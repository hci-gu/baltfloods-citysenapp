import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LatLong } from '@core/models/location';
import { AuthService } from '@core/services/auth.service';
import { IntotoApiService } from '@core/services/intoto-api/intoto-api.service';
import {
  IntotoEnumDto,
  IntotoMyAreaDto,
  IntotoMyLocationDto,
  IntotoMySeriesDto,
  IntotoSeriesDataDto,
} from '@core/services/intoto-api/models';
import {
  DataPointQuality,
  DataPointType,
  ParkingDataPoint,
  QUALITY_CONVERSION,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '../../models/data-point';
import { environment } from '../../../../environments/environment';
import { removeEmpty } from '../../../shared/utils/object-utils';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';
import {
  DataPointEndpoint,
  ObservationWaterResponse,
  ParkingResponse,
  RoadWorksResponse,
  WaterbagTestKitResponse,
  WeatherAirQualityResponse,
  WeatherConditionsResponse,
  WeatherStormWaterResponse,
} from './models';

interface IntotoSeriesCandidate {
  locationName: string;
  location: LatLong;
  description: string | null;
  providerInfo: string | null;
  unitName: string | null;
  referenceLevelName: string | null;
  series: IntotoMySeriesDto;
  distanceKm: number;
}

interface IntotoCatalogContext {
  areas: IntotoMyAreaDto[];
  categories: IntotoEnumDto[];
  subCategories: IntotoEnumDto[];
  units: IntotoEnumDto[];
}

export interface SensorHistoryPoint {
  timestamp: Date;
  value: number;
}

@Injectable({ providedIn: 'root' })
export class DataPointsApi {
  private readonly baseUrl = `${environment.streetAiApiUrl}/${environment.streetAiApiJurisdictionId}`;
  private readonly apiKey = environment.streetAiApiKey;
  private readonly defaultHeaders = new HttpHeaders().append(
    'X-Api-Key',
    this.apiKey,
  );
  private readonly intotoMaxLocations = 10;
  private intotoCatalog$?: Observable<IntotoCatalogContext>;
  private readonly debugIntoto = !environment.production;

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly authService: AuthService,
    private readonly intotoApi: IntotoApiService,
  ) {}

  public getWeatherConditions(): Observable<WeatherConditionDataPoint[]> {
    return this.httpClient
      .get<WeatherConditionsResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_CONDITIONS}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(
        map((response) =>
          response.map(
            ({
              name,
              latitude,
              longitude,
              dataRetrievedTimestamp,
              ...rest
            }) => ({
              name: name,
              location: [latitude, longitude],
              lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
              type: DataPointType.WEATHER_CONDITIONS,
              quality: DataPointQuality.DEFAULT,
              data: { ...removeEmpty(rest) },
            }),
          ),
        ),
      );
  }

  public getWeatherStormWater(
    center?: LatLong,
  ): Observable<WeatherStormWaterDataPoint[]> {
    if (this.debugIntoto) {
      console.log('[Intoto] getWeatherStormWater', {
        center,
      });
    }

    const streetAi$ = this.httpClient
      .get<WeatherStormWaterResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_STORM_WATER}`,
        {
          headers: this.buildStreetAiHeaders(),
        },
      )
      .pipe(
        map((response) => this.mapStreetAiStormWater(response)),
        catchError(() => of([] as WeatherStormWaterDataPoint[])),
      );

    const intoto$ = center
      ? this.getNearbyIntotoStormWater(center).pipe(
          catchError((error) => {
            if (this.debugIntoto) {
              console.error('[Intoto] nearby storm water lookup failed', {
                center,
                error,
              });
            }

            return of([] as WeatherStormWaterDataPoint[]);
          }),
        )
      : of([] as WeatherStormWaterDataPoint[]);

    return forkJoin([streetAi$, intoto$]).pipe(
      map(([streetAi, intoto]) => {
        if (this.debugIntoto) {
          console.log('[Intoto] merged storm water points', {
            streetAiCount: streetAi.length,
            intotoCount: intoto.length,
            intotoPoints: intoto.map((point) => ({
              name: point.name,
              location: point.location,
              lastUpdatedOn: point.lastUpdatedOn?.toISOString(),
              data: point.data,
            })),
          });
        }

        return [...streetAi, ...intoto];
      }),
    );
  }

  public getWeatherAirQuality(): Observable<WeatherAirQualityDataPoint[]> {
    return this.httpClient
      .get<WeatherAirQualityResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_AIR_QUALITY}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(
        map((response) =>
          response.map(
            ({
              name,
              latitude,
              longitude,
              measurementIndex,
              dataRetrievedTimestamp,
            }) => ({
              name: name,
              location: [latitude, longitude],
              lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
              type: DataPointType.AIR_QUALITY,
              quality:
                QUALITY_CONVERSION[measurementIndex] ??
                DataPointQuality.DEFAULT,
            }),
          ),
        ),
      );
  }

  public getParking(): Observable<ParkingDataPoint[]> {
    return this.httpClient
      .get<ParkingResponse>(`${this.baseUrl}/${DataPointEndpoint.PARKING}`, {
        headers: this.defaultHeaders,
      })
      .pipe(
        map((response) =>
          response.map(
            ({
              name,
              latitude,
              longitude,
              availableSpots,
              dataRetrievedTimestamp,
            }) => ({
              name: name,
              location: [latitude, longitude],
              lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
              type: DataPointType.PARKING,
              quality: DataPointQuality.DEFAULT,
              availableSpots,
            }),
          ),
        ),
      );
  }

  public getWaterbagTestKits(): Observable<WaterbagTestKitDataPoint[]> {
    const streetAi$ = this.httpClient
      .get<WaterbagTestKitResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WATERBAG_TESTKIT}`,
        {
          headers: this.buildStreetAiHeaders(),
        },
      )
      .pipe(catchError(() => of([] as WaterbagTestKitResponse)));

    const observationHeaders = this.buildOptionalAuthHeaders();
    const observations$ = this.httpClient
      .get<ObservationWaterResponse>(`${environment.observationApiUrl}/water`, {
        ...(observationHeaders ? { headers: observationHeaders } : {}),
      })
      .pipe(catchError(() => of([] as ObservationWaterResponse)));

    return forkJoin([streetAi$, observations$]).pipe(
      map(([streetAi, observations]) => [
        ...this.mapStreetAiWaterbag(streetAi),
        ...this.mapObservationWaterbag(observations),
      ]),
    );
  }

  public getRoadWorks(): Observable<RoadWorksDataPoint[]> {
    return this.httpClient
      .get<RoadWorksResponse>(
        `${this.baseUrl}/${DataPointEndpoint.ROAD_WORKS}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(
        map((response) =>
          response.map(({ name, latitude, longitude, validityPeriod }) => {
            const [from, to] = validityPeriod.split(' - ');

            return {
              name,
              location: [latitude, longitude],
              type: DataPointType.ROAD_WORKS,
              quality: DataPointQuality.DEFAULT,
              validFrom: from,
              validTo: to,
            };
          }),
        ),
      );
  }

  public getStormWaterHistory(
    point: WeatherStormWaterDataPoint,
    fromDateTime: Date,
    toDateTime: Date,
  ): Observable<SensorHistoryPoint[]> {
    const historySeries = point.historySeries;
    if (!historySeries || historySeries.provider !== 'intoto') {
      return of([]);
    }

    return this.intotoApi
      .getSeriesData(historySeries.seriesId, {
        fromDateTime,
        toDateTime,
      })
      .pipe(
        map((seriesData) =>
          seriesData
            .filter(
              (item): item is IntotoSeriesDataDto & {
                timestamp: string;
                value: number;
              } =>
                item.error !== true &&
                typeof item.timestamp === 'string' &&
                typeof item.value === 'number',
            )
            .map((item) => ({
              timestamp: new Date(item.timestamp),
              value: item.value,
            })),
        ),
      );
  }

  private mapStreetAiStormWater(
    response: WeatherStormWaterResponse,
  ): WeatherStormWaterDataPoint[] {
    return response.map(
      ({
        name,
        latitude,
        longitude,
        waterQuality,
        fillLevel,
        dataRetrievedTimestamp,
      }) => ({
        name: name,
        location: [latitude, longitude],
        lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
        type: DataPointType.STORM_WATER,
        quality: waterQuality,
        data: {
          fillLevel: fillLevel.result,
        },
      }),
    );
  }

  private getNearbyIntotoStormWater(
    center: LatLong,
  ): Observable<WeatherStormWaterDataPoint[]> {
    return this.getIntotoCatalog().pipe(
      map((catalog) => this.findNearbyIntotoSeries(catalog, center)),
      switchMap((candidates) => {
        if (this.debugIntoto) {
          console.log('[Intoto] nearby series candidates', {
            center,
            candidateCount: candidates.length,
            candidates: candidates.map((candidate) => ({
              seriesId: candidate.series.id,
              locationName: candidate.locationName,
              location: candidate.location,
              distanceKm: Math.round(candidate.distanceKm * 100) / 100,
              description: candidate.description,
              unitName: candidate.unitName,
              referenceLevelName: candidate.referenceLevelName,
            })),
          });
        }

        if (candidates.length === 0) {
          return of([] as WeatherStormWaterDataPoint[]);
        }

        const now = new Date();
        const fromDateTime = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        return forkJoin(
          candidates.map((candidate) =>
            this.intotoApi
              .getSeriesData(candidate.series.id, {
                fromDateTime,
                toDateTime: now,
              })
              .pipe(
                map((seriesData) =>
                  this.mapIntotoSeriesToStormWater(candidate, seriesData),
                ),
                catchError((error) => {
                  if (this.debugIntoto) {
            console.error('[Intoto] series fetch failed', {
                      seriesId: candidate.series.id,
                      locationName: candidate.locationName,
                      error,
                    });
                  }

                  return of(null);
                }),
              ),
          ),
        ).pipe(
          map((points) =>
            points.filter(
              (point): point is WeatherStormWaterDataPoint => point !== null,
            ),
          ),
        );
      }),
    );
  }

  private getIntotoCatalog(): Observable<IntotoCatalogContext> {
    if (!this.intotoCatalog$) {
      this.intotoCatalog$ = forkJoin({
        areas: this.intotoApi.getMyAreas(),
        categories: this.intotoApi.getSeriesCategories(),
        subCategories: this.intotoApi.getSeriesSubCategories(),
        units: this.intotoApi.getSeriesUnits(),
      }).pipe(
        map((catalog) => {
          if (this.debugIntoto) {
            console.log('[Intoto] catalog loaded', {
              areaCount: catalog.areas.length,
              categoryCount: catalog.categories.length,
              subCategoryCount: catalog.subCategories.length,
              unitCount: catalog.units.length,
            });
          }

          return catalog;
        }),
        catchError((error) => {
          this.intotoCatalog$ = undefined;

          if (this.debugIntoto) {
            console.error('[Intoto] catalog load failed', {
              error,
            });
          }

          return throwError(() => error);
        }),
        shareReplay(1),
      );
    }

    return this.intotoCatalog$;
  }

  private findNearbyIntotoSeries(
    catalog: IntotoCatalogContext,
    center: LatLong,
  ): IntotoSeriesCandidate[] {
    const categoryNames = new Map(
      catalog.categories.map((item) => [item.value, item.name?.toLowerCase()]),
    );
    const subCategories = new Map(
      catalog.subCategories.map((item) => [item.value, item]),
    );
    const units = new Map(catalog.units.map((item) => [item.value, item]));

    return this.flattenLocations(catalog.areas)
      .flatMap((location) =>
        (location.series ?? []).map((series) => {
          const subCategory = subCategories.get(series.seriesSubCategory);
          const unit = units.get(series.seriesUnit);

          return {
            locationName: location.name?.trim() || `Location ${location.id}`,
            location: [location.wgs84latitude, location.wgs84longitude] as LatLong,
            description: series.description,
            providerInfo: series.providerInfo,
            unitName: unit?.name ?? null,
            referenceLevelName: subCategory?.name ?? null,
            series,
            distanceKm: this.calculateDistanceKm(center, [
              location.wgs84latitude,
              location.wgs84longitude,
            ]),
            haystack: [
              categoryNames.get(series.seriesCategory),
              series.description,
              series.providerInfo,
              subCategory?.name,
              subCategory?.description,
              unit?.name,
              unit?.description,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
          };
        }),
      )
      .filter(
        (candidate) =>
          categoryNames.get(candidate.series.seriesCategory) === 'water' &&
          /(level|distance|depth|nn2000|rh2000|masl|water)/.test(
            candidate.haystack,
          ),
      )
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, this.intotoMaxLocations)
      .map(({ haystack: _, ...candidate }) => candidate);
  }

  private flattenLocations(areas: IntotoMyAreaDto[]): IntotoMyLocationDto[] {
    return areas.flatMap((area) => [
      ...(area.locations ?? []),
      ...this.flattenLocations(area.childAreas ?? []),
    ]);
  }

  private mapIntotoSeriesToStormWater(
    candidate: IntotoSeriesCandidate,
    seriesData: IntotoSeriesDataDto[],
  ): WeatherStormWaterDataPoint | null {
    const latest = [...seriesData]
      .reverse()
      .find(
        (item) =>
          item.error !== true &&
          typeof item.value === 'number' &&
          typeof item.timestamp === 'string',
      );

    if (!latest || latest.value === undefined || !latest.timestamp) {
      if (this.debugIntoto) {
        console.log('[Intoto] no usable latest point', {
          seriesId: candidate.series.id,
          locationName: candidate.locationName,
          pointCount: seriesData.length,
        });
      }

      return null;
    }

    const unitSuffix = candidate.unitName ? ` ${candidate.unitName.toLowerCase()}` : '';
    const referenceLevel = candidate.referenceLevelName
      ? ` ${candidate.referenceLevelName}`
      : '';

    const mappedPoint: WeatherStormWaterDataPoint = {
      name: candidate.locationName,
      location: candidate.location,
      lastUpdatedOn: new Date(latest.timestamp),
      type: DataPointType.STORM_WATER,
      quality: DataPointQuality.DEFAULT,
      data: {
        waterLevel: Math.round(latest.value * 1000) / 1000,
      },
      dataUnitOverrides: {
        waterLevel: `${unitSuffix}${referenceLevel}`,
      },
      historySeries: {
        provider: 'intoto',
        seriesId: candidate.series.id,
        unitLabel: `${unitSuffix}${referenceLevel}`.trim(),
      },
    };

    if (this.debugIntoto) {
      console.log('[Intoto] mapped storm water point', {
        seriesId: candidate.series.id,
        locationName: candidate.locationName,
        location: candidate.location,
        latestTimestamp: latest.timestamp,
        latestValue: latest.value,
      });
    }

    return mappedPoint;
  }

  private mapStreetAiWaterbag(
    response: WaterbagTestKitResponse,
  ): WaterbagTestKitDataPoint[] {
    return response.map(({ id, coords, ...rest }) => {
      const { dataRetrievedTimestamp, imageUrl, ...data } = rest;

      return {
        name: id,
        location: [coords.latitudeValue, coords.longitudeValue],
        imageUrl,
        type: DataPointType.WATERBAG_TESTKIT,
        quality: DataPointQuality.DEFAULT,
        lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
        data: Object.fromEntries(
          Object.entries(data).filter(([_, metric]) => metric.value !== null),
        ),
      };
    });
  }

  private mapObservationWaterbag(
    response: ObservationWaterResponse,
  ): WaterbagTestKitDataPoint[] {
    return response.map((item) => {
      const dataTimestamp = item.dataRetrievedTimestamp ?? Date.now() / 1000;
      const algaeValue = this.mapAlgaeLevel(item.algaeLevel);
      const fallbackNamePrefix =
        item.observationType === 'water_overflow'
          ? 'Water overflow'
          : item.observationType === 'stormwater'
            ? 'Storm water observation'
            : item.observationType === 'water_system'
              ? 'Water system observation'
              : 'Water observation';
      const fallbackId = item.id.slice(0, 6);
      const name = item.name?.trim() || `${fallbackNamePrefix} ${fallbackId}`;

      const data = {
        airTemp: this.toMetric(item.airTemp, dataTimestamp),
        waterTemp: this.toMetric(item.waterTemp, dataTimestamp),
        visibility: this.toMetric(item.depthOfView, dataTimestamp),
        algae: algaeValue ? this.toMetric(algaeValue, dataTimestamp) : null,
        waterPh: this.toMetric(item.waterPh, dataTimestamp),
        turbidity: this.toMetric(item.turbidity, dataTimestamp),
        dissolvedOxygen: this.toMetric(item.dissolvedOxygen, dataTimestamp),
        nitrate: this.toMetric(item.nitrate, dataTimestamp),
        phosphate: this.toMetric(item.phosphate, dataTimestamp),
      };

      const filteredData = Object.fromEntries(
        Object.entries(data).filter(
          (
            entry,
          ): entry is [string, { value: number; dataRetrievedTimestamp: number }] => {
            const metric = entry[1];
            return (
              metric !== null &&
              metric.value !== null &&
              metric.value !== undefined
            );
          },
        ),
      );

      return {
        name,
        location: [item.latitude, item.longitude],
        imageUrl:
          typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0
            ? item.imageUrl.trim()
            : undefined,
        type: DataPointType.WATERBAG_TESTKIT,
        quality: DataPointQuality.DEFAULT,
        lastUpdatedOn: new Date(dataTimestamp * 1000),
        data: filteredData,
      };
    });
  }

  private toMetric(value: number | null | undefined, timestamp: number) {
    if (value === null || value === undefined) {
      return null;
    }

    return {
      value,
      dataRetrievedTimestamp: timestamp,
    };
  }

  private mapAlgaeLevel(value: string | null | undefined): number | null {
    switch (value) {
      case 'none':
        return 1;
      case 'little':
        return 2;
      case 'rich':
        return 3;
      case 'very_rich':
        return 4;
      default:
        return null;
    }
  }

  private buildStreetAiHeaders(): HttpHeaders {
    const authToken = this.getValidAuthToken();
    if (!authToken) {
      return this.defaultHeaders;
    }

    return this.defaultHeaders.set('Authorization', `Bearer ${authToken}`);
  }

  private buildOptionalAuthHeaders(): HttpHeaders | null {
    const authToken = this.getValidAuthToken();
    if (!authToken) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${authToken}`,
    });
  }

  private getValidAuthToken(): string | null {
    const token = this.authService.token;
    if (!token || !this.looksLikeJwt(token)) {
      return null;
    }
    return token;
  }

  private looksLikeJwt(token: string): boolean {
    const parts = token.split('.');
    const jwtPartPattern = /^[A-Za-z0-9_-]+$/;
    return (
      parts.length === 3 &&
      parts.every((part) => part.length > 0 && jwtPartPattern.test(part))
    );
  }

  private calculateDistanceKm(origin: LatLong, target: LatLong): number {
    const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latDiff = toRadians(target[0] - origin[0]);
    const longDiff = toRadians(target[1] - origin[1]);
    const a =
      Math.sin(latDiff / 2) ** 2 +
      Math.cos(toRadians(origin[0])) *
        Math.cos(toRadians(target[0])) *
        Math.sin(longDiff / 2) ** 2;

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
