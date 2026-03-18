import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import { map, Observable } from 'rxjs';

interface PocketbaseListResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface ObservationRecordsPage {
  items: ObservationRecord[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export interface ObservationRecord {
  id: string;
  name?: string;
  type?: string;
  visible?: boolean;
  user?: string | string[];
  dataRetrievedTimestamp?: number | string;
  created?: string;
  imageUrl?: string;
  photo?: string[] | string;
  data?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class ObservationRecordsService {
  private readonly baseUrl = environment.pocketbaseUrl;

  public constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
  ) {}

  public listObservations(
    page: number,
    perPage: number,
  ): Observable<ObservationRecordsPage> {
    const headers = this.createOptionalAuthHeaders();

    return this.http
      .get<PocketbaseListResponse<ObservationRecord>>(
        `${this.baseUrl}/collections/observations/records`,
        {
          ...(headers ? { headers } : {}),
          params: {
            page: `${page}`,
            perPage: `${perPage}`,
            sort: '-dataRetrievedTimestamp',
          },
        },
      )
      .pipe(
        map((response) => ({
          items: response.items ?? [],
          page: response.page ?? page,
          perPage: response.perPage ?? perPage,
          totalItems: response.totalItems ?? 0,
          totalPages: response.totalPages ?? 1,
        })),
      );
  }

  public listRecentObservations(days: number): Observable<ObservationRecord[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
    const headers = this.createOptionalAuthHeaders();

    return this.http
      .get<PocketbaseListResponse<ObservationRecord>>(
        `${this.baseUrl}/collections/observations/records`,
        {
          ...(headers ? { headers } : {}),
          params: {
            page: '1',
            perPage: '500',
            sort: '-dataRetrievedTimestamp',
            filter: `dataRetrievedTimestamp >= ${cutoffTimestamp}`,
          },
        },
      )
      .pipe(map((response) => response.items ?? []));
  }

  public deleteObservation(recordId: string, authToken: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/collections/observations/records/${recordId}`,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${authToken}`,
        }),
      },
    );
  }

  public updateObservation(
    recordId: string,
    data: Partial<ObservationRecord>,
    authToken: string,
  ): Observable<ObservationRecord> {
    return this.http.patch<ObservationRecord>(
      `${this.baseUrl}/collections/observations/records/${recordId}`,
      data,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${authToken}`,
        }),
      },
    );
  }

  private createOptionalAuthHeaders(): HttpHeaders | null {
    const token = this.authService.token;
    if (!token || !this.looksLikeJwt(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
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
