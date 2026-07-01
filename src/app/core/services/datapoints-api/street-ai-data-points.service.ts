import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import { Observable, map } from 'rxjs';
import {
  ParkingDataPoint,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '../../models/data-point';
import {
  mapParking,
  mapRoadWorks,
  mapStreetAiStormWater,
  mapStreetAiWaterbag,
  mapWeatherAirQuality,
  mapWeatherConditions,
} from './data-point-mappers';
import {
  DataPointEndpoint,
  ParkingResponse,
  RoadWorksResponse,
  WaterbagTestKitResponse,
  WeatherAirQualityResponse,
  WeatherConditionsResponse,
  WeatherStormWaterResponse,
} from './models';

@Injectable({ providedIn: 'root' })
export class StreetAiDataPointsService {
  private readonly baseUrl = `${environment.streetAiApiUrl}/${environment.streetAiApiJurisdictionId}`;
  private readonly defaultHeaders = new HttpHeaders().append(
    'X-Api-Key',
    environment.streetAiApiKey,
  );

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly authService: AuthService,
  ) {}

  public getWeatherConditions(): Observable<WeatherConditionDataPoint[]> {
    return this.httpClient
      .get<WeatherConditionsResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_CONDITIONS}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(map(mapWeatherConditions));
  }

  public getWeatherStormWater(): Observable<WeatherStormWaterDataPoint[]> {
    return this.httpClient
      .get<WeatherStormWaterResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_STORM_WATER}`,
        {
          headers: this.buildStreetAiHeaders(),
        },
      )
      .pipe(map(mapStreetAiStormWater));
  }

  public getWeatherAirQuality(): Observable<WeatherAirQualityDataPoint[]> {
    return this.httpClient
      .get<WeatherAirQualityResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WEATHER_AIR_QUALITY}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(map(mapWeatherAirQuality));
  }

  public getParking(): Observable<ParkingDataPoint[]> {
    return this.httpClient
      .get<ParkingResponse>(`${this.baseUrl}/${DataPointEndpoint.PARKING}`, {
        headers: this.defaultHeaders,
      })
      .pipe(map(mapParking));
  }

  public getWaterbagTestKits(): Observable<WaterbagTestKitDataPoint[]> {
    return this.httpClient
      .get<WaterbagTestKitResponse>(
        `${this.baseUrl}/${DataPointEndpoint.WATERBAG_TESTKIT}`,
        {
          headers: this.buildStreetAiHeaders(),
        },
      )
      .pipe(map(mapStreetAiWaterbag));
  }

  public getRoadWorks(): Observable<RoadWorksDataPoint[]> {
    return this.httpClient
      .get<RoadWorksResponse>(
        `${this.baseUrl}/${DataPointEndpoint.ROAD_WORKS}`,
        {
          headers: this.defaultHeaders,
        },
      )
      .pipe(map(mapRoadWorks));
  }

  private buildStreetAiHeaders(): HttpHeaders {
    const authToken = this.getValidAuthToken();
    if (!authToken) {
      return this.defaultHeaders;
    }

    return this.defaultHeaders.set('Authorization', `Bearer ${authToken}`);
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
