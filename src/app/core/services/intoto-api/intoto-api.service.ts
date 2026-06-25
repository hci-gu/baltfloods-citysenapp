import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { map, Observable } from 'rxjs';
import {
  IntotoEndpoint,
  IntotoEnumDto,
  IntotoMyAreaDto,
  IntotoSeriesDataDto,
  IntotoSeriesDataQuery,
} from './models';

@Injectable({ providedIn: 'root' })
export class IntotoApiService {
  private readonly baseUrl = environment.intoToApiUrl.replace(/\/$/, '');
  private readonly defaultHeaders = new HttpHeaders().set(
    'x-api-key',
    environment.intoToApiKey,
  );

  public constructor(private readonly httpClient: HttpClient) {}

  public getLocationTypes(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.LOCATION_TYPES);
  }

  public getSeriesCategories(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.SERIES_CATEGORIES);
  }

  public getSeriesSubCategories(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.SERIES_SUB_CATEGORIES);
  }

  public getSeriesAggregationPeriods(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.SERIES_AGGREGATION_PERIODS);
  }

  public getSeriesAggregationMethods(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.SERIES_AGGREGATION_METHODS);
  }

  public getSeriesUnits(): Observable<IntotoEnumDto[]> {
    return this.getEnums(IntotoEndpoint.SERIES_UNITS);
  }

  public getMyAreas(): Observable<IntotoMyAreaDto[]> {
    return this.httpClient
      .get<IntotoApiResponse<IntotoMyAreaDto[]>>(
        this.createUrl(IntotoEndpoint.MY_AREAS),
        { headers: this.defaultHeaders },
      )
      .pipe(map((response) => this.unwrapResponse(response)));
  }

  public getSeriesData(
    seriesId: number,
    query: IntotoSeriesDataQuery = {},
  ): Observable<IntotoSeriesDataDto[]> {
    let params = new HttpParams();

    if (query.fromDateTime) {
      params = params.set(
        'fromDateTime',
        this.toDateTimeString(query.fromDateTime),
      );
    }

    if (query.toDateTime) {
      params = params.set('toDateTime', this.toDateTimeString(query.toDateTime));
    }

    return this.httpClient
      .get<IntotoApiResponse<IntotoSeriesDataDto[]>>(
        this.createUrl(`${IntotoEndpoint.SERIES_DATA}/${seriesId}`),
        {
          headers: this.defaultHeaders,
          params,
        },
      )
      .pipe(map((response) => this.unwrapResponse(response)));
  }

  private getEnums(endpoint: IntotoEndpoint): Observable<IntotoEnumDto[]> {
    return this.httpClient
      .get<IntotoApiResponse<IntotoEnumDto[]>>(this.createUrl(endpoint), {
        headers: this.defaultHeaders,
      })
      .pipe(map((response) => this.unwrapResponse(response)));
  }

  private createUrl(path: string): string {
    return `${this.baseUrl}/${path}`;
  }

  private toDateTimeString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private unwrapResponse<T>(response: IntotoApiResponse<T>): T {
    if (
      response &&
      typeof response === 'object' &&
      'data' in response &&
      response.data !== undefined
    ) {
      return response.data;
    }

    return response as T;
  }
}

type IntotoApiResponse<T> = T | { data: T };
