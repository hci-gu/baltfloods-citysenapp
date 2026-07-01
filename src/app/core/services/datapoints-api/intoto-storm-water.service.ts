import { Injectable } from '@angular/core';
import { LatLong } from '@core/models/location';
import { IntotoApiService } from '@core/services/intoto-api/intoto-api.service';
import {
  IntotoEnumDto,
  IntotoMyAreaDto,
  IntotoMyLocationDto,
  IntotoMySeriesDto,
  IntotoSeriesDataDto,
  IntotoSeriesDataQuery,
} from '@core/services/intoto-api/models';
import { environment } from '@environments/environment';
import {
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '../../models/data-point';
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
export class IntotoStormWaterService {
  private readonly intotoMaxLocations = 10;
  private intotoCatalog$?: Observable<IntotoCatalogContext>;
  private readonly intotoSeriesDataCache = new Map<
    string,
    Observable<IntotoSeriesDataDto[]>
  >();
  private readonly debugIntoto = !environment.production;

  public constructor(private readonly intotoApi: IntotoApiService) {}

  public getNearbyStormWater(
    center: LatLong,
  ): Observable<WeatherStormWaterDataPoint[]> {
    return this.getIntotoCatalog().pipe(
      map((catalog) => this.findNearbyIntotoSeries(catalog, center)),
      switchMap((candidates) => {
        this.logIntotoDebug('[Intoto] nearby series candidates', {
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

        if (candidates.length === 0) {
          return of([] as WeatherStormWaterDataPoint[]);
        }

        const now = new Date(Date.now());
        const fromDateTime = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        return forkJoin(
          candidates.map((candidate) =>
            this.getCachedSeriesData(candidate.series.id, {
              fromDateTime,
              toDateTime: now,
            }).pipe(
              map((seriesData) =>
                this.mapIntotoSeriesToStormWater(candidate, seriesData),
              ),
              catchError((error) => {
                this.logIntotoDebug('[Intoto] series fetch failed', {
                  seriesId: candidate.series.id,
                  locationName: candidate.locationName,
                  error,
                });

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

  public getHistory(
    point: WeatherStormWaterDataPoint,
    fromDateTime: Date,
    toDateTime: Date,
  ): Observable<SensorHistoryPoint[]> {
    const historySeries = point.historySeries;
    if (!historySeries || historySeries.provider !== 'intoto') {
      return of([]);
    }

    return this.getCachedSeriesData(historySeries.seriesId, {
      fromDateTime,
      toDateTime,
    }).pipe(
      map((seriesData) =>
        seriesData
          .filter(
            (
              item,
            ): item is IntotoSeriesDataDto & {
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

  private getIntotoCatalog(): Observable<IntotoCatalogContext> {
    if (!this.intotoCatalog$) {
      this.intotoCatalog$ = forkJoin({
        areas: this.intotoApi.getMyAreas(),
        categories: this.intotoApi.getSeriesCategories(),
        subCategories: this.intotoApi.getSeriesSubCategories(),
        units: this.intotoApi.getSeriesUnits(),
      }).pipe(
        map((catalog) => {
          this.logIntotoDebug('[Intoto] catalog loaded', {
            areaCount: catalog.areas.length,
            categoryCount: catalog.categories.length,
            subCategoryCount: catalog.subCategories.length,
            unitCount: catalog.units.length,
          });

          return catalog;
        }),
        catchError((error) => {
          this.intotoCatalog$ = undefined;

          this.logIntotoDebug('[Intoto] catalog load failed', { error });

          return throwError(() => error);
        }),
        shareReplay(1),
      );
    }

    return this.intotoCatalog$;
  }

  private getCachedSeriesData(
    seriesId: number,
    query: IntotoSeriesDataQuery,
  ): Observable<IntotoSeriesDataDto[]> {
    const cacheKey = this.getSeriesDataCacheKey(seriesId, query);
    const cached = this.intotoSeriesDataCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.intotoApi.getSeriesData(seriesId, query).pipe(
      catchError((error) => {
        this.intotoSeriesDataCache.delete(cacheKey);
        return throwError(() => error);
      }),
      shareReplay(1),
    );
    this.intotoSeriesDataCache.set(cacheKey, request$);
    return request$;
  }

  private getSeriesDataCacheKey(
    seriesId: number,
    query: IntotoSeriesDataQuery,
  ): string {
    return [
      seriesId,
      this.getDateCacheKey(query.fromDateTime),
      this.getDateCacheKey(query.toDateTime),
    ].join(':');
  }

  private getDateCacheKey(value: Date | string | undefined): string {
    if (!value) {
      return '';
    }

    return value instanceof Date ? value.toISOString() : value;
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
            location: [
              location.wgs84latitude,
              location.wgs84longitude,
            ] as LatLong,
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
      this.logIntotoDebug('[Intoto] no usable latest point', {
        seriesId: candidate.series.id,
        locationName: candidate.locationName,
        pointCount: seriesData.length,
      });

      return null;
    }

    const unitSuffix = candidate.unitName
      ? ` ${candidate.unitName.toLowerCase()}`
      : '';
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

    this.logIntotoDebug('[Intoto] mapped storm water point', {
      seriesId: candidate.series.id,
      locationName: candidate.locationName,
      location: candidate.location,
      latestTimestamp: latest.timestamp,
      latestValue: latest.value,
    });

    return mappedPoint;
  }

  private logIntotoDebug(message: string, context: unknown): void {
    if (!this.debugIntoto) {
      return;
    }

    // eslint-disable-next-line no-console
    console.debug(message, context);
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
