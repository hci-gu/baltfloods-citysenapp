import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  map,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
  throwError,
} from 'rxjs';

interface PocketbaseConnectPayload {
  clientId?: string;
}

interface PocketbaseListResponse<T> {
  items?: T[];
}

interface PocketbaseDemoTimeRecord {
  id: string;
  key?: string;
  currentTime?: string;
}

export interface DemoTimeState {
  overrideTime: Date | null;
  loading: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class DemoTimeService implements OnDestroy {
  private readonly baseUrl = environment.pocketbaseUrl;
  private readonly reconnectDelayMs = 3000;
  private readonly collectionName = 'demo_time_overrides';
  private readonly singletonKey = 'global';
  private readonly realtimeTopics = [
    `${this.collectionName}/*`,
    this.collectionName,
  ];
  private readonly stateSubject = new BehaviorSubject<DemoTimeState>({
    overrideTime: null,
    loading: true,
  });
  private readonly overrideChangedSubject = new Subject<Date | null>();
  private recordId: string | null = null;
  private eventSource: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private isDestroyed = false;

  public readonly state$ = this.stateSubject.asObservable();
  public readonly override$ = this.state$.pipe(
    map((state) => state.overrideTime),
    shareReplay(1),
  );
  public readonly overrideChanged$ = this.overrideChangedSubject.asObservable();

  public constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly ngZone: NgZone,
  ) {
    this.refreshState();
    this.connect();
  }

  public ngOnDestroy(): void {
    this.isDestroyed = true;
    this.clearReconnectTimer();
    this.closeConnection();
    this.stateSubject.complete();
    this.overrideChangedSubject.complete();
  }

  public now(): Date {
    const overrideTime = this.stateSubject.value.overrideTime;
    return overrideTime ? new Date(overrideTime) : new Date();
  }

  public setOverride(overrideTime: Date | null): Observable<Date | null> {
    const headers = this.createAuthHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authenticated'));
    }

    return this.ensureRecord(headers).pipe(
      switchMap((record) =>
        this.http.patch<PocketbaseDemoTimeRecord>(
          `${this.baseUrl}/collections/${this.collectionName}/records/${record.id}`,
          {
            currentTime: overrideTime ? overrideTime.toISOString() : '',
          },
          { headers },
        ),
      ),
      map((record) => this.applyRecord(record)),
    );
  }

  private refreshState(): void {
    this.http
      .get<PocketbaseListResponse<PocketbaseDemoTimeRecord>>(
        `${this.baseUrl}/collections/${this.collectionName}/records`,
        {
          params: {
            page: '1',
            perPage: '1',
            filter: `key="${this.singletonKey}"`,
          },
        },
      )
      .pipe(
        take(1),
        catchError(() => {
          this.stateSubject.next({
            overrideTime: null,
            loading: false,
          });
          return of({ items: [] } as PocketbaseListResponse<PocketbaseDemoTimeRecord>);
        }),
      )
      .subscribe((response) => {
        const record = response.items?.[0] ?? null;
        this.ngZone.run(() => this.applyRecord(record));
      });
  }

  private ensureRecord(headers: HttpHeaders): Observable<PocketbaseDemoTimeRecord> {
    if (this.recordId) {
      return of({
        id: this.recordId,
        key: this.singletonKey,
      });
    }

    return this.http
      .post<PocketbaseDemoTimeRecord>(
        `${this.baseUrl}/collections/${this.collectionName}/records`,
        {
          key: this.singletonKey,
        },
        { headers },
      )
      .pipe(
        tap((record) => {
          this.recordId = record.id;
        }),
      );
  }

  private applyRecord(record: PocketbaseDemoTimeRecord | null): Date | null {
    const previousOverride = this.stateSubject.value.overrideTime;
    const overrideTime = this.parseOverrideTime(record?.currentTime);
    this.recordId = record?.id ?? this.recordId;
    this.stateSubject.next({
      overrideTime,
      loading: false,
    });

    if (previousOverride?.getTime() !== overrideTime?.getTime()) {
      this.overrideChangedSubject.next(
        overrideTime ? new Date(overrideTime) : null,
      );
    }

    return overrideTime;
  }

  private parseOverrideTime(rawValue?: string): Date | null {
    if (!rawValue) {
      return null;
    }

    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private createAuthHeaders(): HttpHeaders | null {
    const token = this.authService.token;
    if (!token) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  private connect(): void {
    if (this.isDestroyed || this.eventSource) {
      return;
    }

    const eventSource = new EventSource(`${this.baseUrl}/realtime`);
    eventSource.addEventListener('PB_CONNECT', this.onConnect);
    this.realtimeTopics.forEach((topic) =>
      eventSource.addEventListener(topic, this.onRealtimeMessage),
    );
    eventSource.onerror = this.onError;

    this.eventSource = eventSource;
  }

  private onConnect = (event: Event): void => {
    const messageEvent = event as MessageEvent<string>;
    const clientId = this.parseClientId(messageEvent.data);

    if (!clientId) {
      return;
    }

    this.http
      .post<void>(`${this.baseUrl}/realtime`, {
        clientId,
        subscriptions: this.realtimeTopics,
      })
      .pipe(take(1))
      .subscribe({
        error: () => this.resetConnectionWithReconnect(),
      });
  };

  private onRealtimeMessage = (): void => {
    this.ngZone.run(() => this.refreshState());
  };

  private onError = (): void => {
    this.resetConnectionWithReconnect();
  };

  private resetConnectionWithReconnect(): void {
    if (this.isDestroyed) {
      return;
    }

    this.closeConnection();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.isDestroyed) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeConnection(): void {
    if (!this.eventSource) {
      return;
    }

    this.eventSource.removeEventListener('PB_CONNECT', this.onConnect);
    this.realtimeTopics.forEach((topic) =>
      this.eventSource?.removeEventListener(topic, this.onRealtimeMessage),
    );
    this.eventSource.onerror = null;
    this.eventSource.close();
    this.eventSource = null;
  }

  private parseClientId(rawData: string): string | null {
    try {
      const payload = JSON.parse(rawData) as PocketbaseConnectPayload;
      return typeof payload.clientId === 'string' && payload.clientId
        ? payload.clientId
        : null;
    } catch {
      return null;
    }
  }
}
