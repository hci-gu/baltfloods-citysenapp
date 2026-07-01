import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LatLong } from '@core/models/location';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import {
  ParkingDataPoint,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '../../models/data-point';
import { mapObservationWaterbag } from './data-point-mappers';
import {
  IntotoStormWaterService,
  SensorHistoryPoint,
} from './intoto-storm-water.service';
import { ObservationWaterResponse } from './models';
import { StreetAiDataPointsService } from './street-ai-data-points.service';

export type { SensorHistoryPoint } from './intoto-storm-water.service';

@Injectable({ providedIn: 'root' })
export class DataPointsApi {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly authService: AuthService,
    private readonly streetAiDataPoints: StreetAiDataPointsService,
    private readonly intotoStormWater: IntotoStormWaterService,
  ) {}

  public getWeatherConditions(): Observable<WeatherConditionDataPoint[]> {
    return this.streetAiDataPoints.getWeatherConditions();
  }

  public getWeatherStormWater(
    center?: LatLong,
  ): Observable<WeatherStormWaterDataPoint[]> {
    const streetAi$ = this.streetAiDataPoints
      .getWeatherStormWater()
      .pipe(catchError(() => of([] as WeatherStormWaterDataPoint[])));

    const intoto$ = center
      ? this.intotoStormWater
          .getNearbyStormWater(center)
          .pipe(catchError(() => of([] as WeatherStormWaterDataPoint[])))
      : of([] as WeatherStormWaterDataPoint[]);

    return forkJoin([streetAi$, intoto$]).pipe(
      map(([streetAi, intoto]) => [...streetAi, ...intoto]),
    );
  }

  public getWeatherAirQuality(): Observable<WeatherAirQualityDataPoint[]> {
    return this.streetAiDataPoints.getWeatherAirQuality();
  }

  public getParking(): Observable<ParkingDataPoint[]> {
    return this.streetAiDataPoints.getParking();
  }

  public getWaterbagTestKits(): Observable<WaterbagTestKitDataPoint[]> {
    const streetAi$ = this.streetAiDataPoints
      .getWaterbagTestKits()
      .pipe(catchError(() => of([] as WaterbagTestKitDataPoint[])));

    const observationHeaders = this.buildOptionalAuthHeaders();
    const observations$ = this.httpClient
      .get<ObservationWaterResponse>(`${environment.observationApiUrl}/water`, {
        ...(observationHeaders ? { headers: observationHeaders } : {}),
      })
      .pipe(
        map(mapObservationWaterbag),
        catchError(() => of([] as WaterbagTestKitDataPoint[])),
      );

    return forkJoin([streetAi$, observations$]).pipe(
      map(([streetAi, observations]) => [...streetAi, ...observations]),
    );
  }

  public getRoadWorks(): Observable<RoadWorksDataPoint[]> {
    return this.streetAiDataPoints.getRoadWorks();
  }

  public getStormWaterHistory(
    point: WeatherStormWaterDataPoint,
    fromDateTime: Date,
    toDateTime: Date,
  ): Observable<SensorHistoryPoint[]> {
    return this.intotoStormWater.getHistory(point, fromDateTime, toDateTime);
  }

  private buildOptionalAuthHeaders(): HttpHeaders | null {
    const authToken = this.getValidAuthToken();
    if (!authToken) {
      return null;
    }

    return new HttpHeaders().set('Authorization', `Bearer ${authToken}`);
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
}
