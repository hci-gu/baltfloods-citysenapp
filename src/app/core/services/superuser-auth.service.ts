import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface PocketbaseSuperuserRecord {
  id: string;
  email: string;
}

export interface SuperuserAuthState {
  token: string | null;
  record: PocketbaseSuperuserRecord | null;
}

interface PocketbaseSuperuserAuthResponse {
  token: string;
  record: PocketbaseSuperuserRecord;
}

interface PocketbaseListResponse<T> {
  items: T[];
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
export class SuperuserAuthService {
  private readonly storageKey = 'pocketbase-superuser-auth';
  private readonly baseUrl = environment.pocketbaseUrl;
  private readonly authStateSubject = new BehaviorSubject<SuperuserAuthState>(
    this.loadAuthState(),
  );

  public readonly authState$ = this.authStateSubject.asObservable();

  public constructor(private readonly http: HttpClient) {}

  public get isAuthenticated(): boolean {
    return !!this.authStateSubject.value.token;
  }

  public get token(): string | null {
    return this.authStateSubject.value.token;
  }

  public login(identity: string, password: string): Observable<SuperuserAuthState> {
    const loginPayload = {
      identity,
      password,
    };

    return this.http
      .post<PocketbaseSuperuserAuthResponse>(
        `${this.baseUrl}/collections/_superusers/auth-with-password`,
        loginPayload,
      )
      .pipe(
        catchError(() =>
          this.http.post<PocketbaseSuperuserAuthResponse>(
            `${this.baseUrl}/_superusers/auth-with-password`,
            loginPayload,
          ),
        ),
        map((response) => ({
          token: this.normalizeToken(response.token),
          record: response.record,
        })),
        tap((state) => this.setAuthState(state)),
      );
  }

  public deleteObservation(recordId: string): Observable<void> {
    const token = this.authStateSubject.value.token;
    if (!token) {
      return throwError(() => new Error('Not authenticated'));
    }

    return this.deleteObservationWithPrefix(recordId, token);
  }

  public listObservations(): Observable<ObservationRecord[]> {
    const token = this.authStateSubject.value.token;
    if (!token) {
      return throwError(() => new Error('Not authenticated'));
    }

    return this.listObservationsWithPrefix(token);
  }

  public logout(): void {
    this.setAuthState({ token: null, record: null });
  }

  private loadAuthState(): SuperuserAuthState {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return { token: null, record: null };
      }
      const parsed = JSON.parse(stored) as SuperuserAuthState;
      if (!parsed.token) {
        return parsed;
      }
      return {
        ...parsed,
        token: this.normalizeToken(parsed.token),
      };
    } catch {
      return { token: null, record: null };
    }
  }

  private setAuthState(state: SuperuserAuthState): void {
    const normalizedState = state.token
      ? { ...state, token: this.normalizeToken(state.token) }
      : state;

    this.authStateSubject.next(normalizedState);
    if (normalizedState.token && normalizedState.record) {
      localStorage.setItem(this.storageKey, JSON.stringify(normalizedState));
      return;
    }
    localStorage.removeItem(this.storageKey);
  }

  private deleteObservationWithPrefix(
    recordId: string,
    token: string,
  ): Observable<void> {
    const normalizedToken = this.normalizeToken(token);

    return this.http.delete<void>(
      `${this.baseUrl}/collections/observations/records/${recordId}`,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${normalizedToken}`,
        }),
      },
    );
  }

  private listObservationsWithPrefix(
    token: string,
  ): Observable<ObservationRecord[]> {
    const normalizedToken = this.normalizeToken(token);

    return this.http
      .get<PocketbaseListResponse<ObservationRecord>>(
        `${this.baseUrl}/collections/observations/records`,
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${normalizedToken}`,
          }),
          params: {
            perPage: '500',
            sort: '-dataRetrievedTimestamp',
          },
        },
      )
      .pipe(map((response) => response.items ?? []));
  }

  private normalizeToken(token: string): string {
    return token.replace(/^(Bearer|Admin)\s+/i, '').trim();
  }
}
