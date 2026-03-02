import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

export interface PocketbaseUserRecord {
  id: string;
  email: string;
  name?: string;
  verified?: boolean;
  type?: 'regular' | 'admin';
}

export interface AuthState {
  token: string | null;
  record: PocketbaseUserRecord | null;
}

interface PocketbaseAuthResponse {
  token: string;
  record: PocketbaseUserRecord;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storageKey = 'pocketbase-auth';
  private readonly baseUrl = environment.pocketbaseUrl;
  private readonly authStateSubject = new BehaviorSubject<AuthState>(
    this.loadAuthState(),
  );

  public readonly authState$ = this.authStateSubject.asObservable();

  public constructor(private readonly http: HttpClient) {}

  public get isAuthenticated(): boolean {
    return !!this.authStateSubject.value.token;
  }

  public get user(): PocketbaseUserRecord | null {
    return this.authStateSubject.value.record;
  }

  public get token(): string | null {
    return this.authStateSubject.value.token;
  }

  public login(email: string, password: string): Observable<AuthState> {
    return this.http
      .post<PocketbaseAuthResponse>(
        `${this.baseUrl}/collections/users/auth-with-password`,
        {
          identity: email,
          password,
        },
      )
      .pipe(
        map((response) => ({ token: response.token, record: response.record })),
        tap((state) => this.setAuthState(state)),
      );
  }

  public signup(email: string, password: string): Observable<AuthState> {
    return this.http
      .post<PocketbaseUserRecord>(`${this.baseUrl}/collections/users/records`, {
        email,
        password,
        passwordConfirm: password,
        type: 'regular',
      })
      .pipe(
        switchMap(() => this.login(email, password)),
        catchError((error) => throwError(() => error)),
      );
  }

  public changePassword(newPassword: string): Observable<PocketbaseUserRecord> {
    const currentUser = this.user;
    const token = this.authStateSubject.value.token;

    if (!currentUser || !token) {
      return throwError(() => new Error('Not authenticated'));
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    return this.http
      .patch<PocketbaseUserRecord>(
        `${this.baseUrl}/collections/users/records/${currentUser.id}`,
        {
          password: newPassword,
          passwordConfirm: newPassword,
        },
        { headers },
      )
      .pipe(
        tap((record) =>
          this.setAuthState({
            token,
            record,
          }),
        ),
      );
  }

  public logout(): void {
    this.setAuthState({ token: null, record: null });
  }

  private loadAuthState(): AuthState {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return { token: null, record: null };
      }
      return JSON.parse(stored) as AuthState;
    } catch {
      return { token: null, record: null };
    }
  }

  private setAuthState(state: AuthState): void {
    this.authStateSubject.next(state);
    if (state.token && state.record) {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
      return;
    }
    localStorage.removeItem(this.storageKey);
  }
}
