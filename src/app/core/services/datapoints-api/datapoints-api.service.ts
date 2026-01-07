import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  QUALITY_CONVERSION,
  DataPointQuality,
  DataPointType,
  ParkingDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
  RoadWorksDataPoint,
} from '../../models/data-point';
import { environment } from '../../../../environments/environment';
import { removeEmpty } from '../../../shared/utils/object-utils';
import { Observable, catchError, map, of, forkJoin } from 'rxjs';
import {
  DataPointEndpoint,
  ParkingResponse,
  RoadWorksResponse,
  ObservationWaterResponse,
  WaterbagTestKitResponse,
  WeatherAirQualityResponse,
  WeatherConditionsResponse,
  WeatherStormWaterResponse,
} from './models';

@Injectable({ providedIn: 'root' })
export class DataPointsApi {
  private baseUrl = `${environment.streetAiApiUrl}/${environment.streetAiApiJurisdictionId}`;
  private apiKey = environment.streetAiApiKey;
  private defaultHeaders = new HttpHeaders().append('X-Api-Key', this.apiKey);

  public constructor(private readonly httpClient: HttpClient) {}

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

  public getWeatherStormWater(): Observable<WeatherStormWaterDataPoint[]> {
    return this.httpClient
      .get<WeatherStormWaterResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_STORM_WATER}`,
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
          ),
        ),
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
          headers: this.defaultHeaders,
        },
      )
      .pipe(catchError(() => of([] as WaterbagTestKitResponse)));

    const observations$ = this.httpClient
      .get<ObservationWaterResponse>(`${environment.observationApiUrl}/water`)
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
          Object.entries(data).filter(([_, metric]) => {
            return metric.value !== null;
          }),
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
            return metric !== null && metric.value !== null && metric.value !== undefined;
          },
        ),
      );

      return {
        name: item.id,
        location: [item.latitude, item.longitude],
        imageUrl: item.imageUrl ?? undefined,
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
}
