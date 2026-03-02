import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
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
  type?: string;
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

  public constructor(private readonly http: HttpClient) {}

  public listObservations(
    page: number,
    perPage: number,
  ): Observable<ObservationRecordsPage> {
    return this.http
      .get<PocketbaseListResponse<ObservationRecord>>(
        `${this.baseUrl}/collections/observations/records`,
        {
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
}
