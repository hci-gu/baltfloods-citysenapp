import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import {
  Observable,
  Subscription,
  catchError,
  map,
  of,
  switchMap,
  take,
  throwError,
} from 'rxjs';

export type DashboardMessageType = 'info' | 'warning';

export interface DashboardMessage {
  id: string;
  title: string;
  content: string;
  start: string;
  end: string;
  type: DashboardMessageType;
}

export type ScheduledMessage = DashboardMessage;

export interface ImmediateAlertRequest {
  title: string;
  content: string;
  type: DashboardMessageType;
  durationHours: number;
}

interface PocketbaseConnectPayload {
  clientId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ScheduledMessagesService {
  private readonly baseUrl = environment.scheduledMessagesApiUrl;
  private readonly pocketbaseUrl = environment.pocketbaseUrl;
  private readonly realtimeTopic = 'scheduled-messages-refresh';
  private readonly reconnectDelayMs = 3000;

  public constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly ngZone: NgZone,
  ) {}

  public getActiveMessages(): Observable<ScheduledMessage[]> {
    return this.http
      .get<Partial<ScheduledMessage>[]>(`${this.baseUrl}/active`)
      .pipe(map((messages) => messages.map(this.normalizeMessage)))
      .pipe(catchError(() => of([])));
  }

  public watchActiveMessages(): Observable<ScheduledMessage[]> {
    return this.createRefreshStream().pipe(
      switchMap(() => this.getActiveMessages()),
    );
  }

  public createImmediateAlert(
    request: ImmediateAlertRequest,
  ): Observable<ScheduledMessage> {
    const token = this.authService.token;
    if (!token) {
      return throwError(() => new Error('Not authenticated'));
    }

    return this.http
      .post<Partial<ScheduledMessage>>(`${this.baseUrl}/alert`, request, {
        headers: new HttpHeaders().set('Authorization', `Bearer ${token}`),
      })
      .pipe(map((message) => this.normalizeMessage(message)));
  }

  private createRefreshStream(): Observable<void> {
    return new Observable<void>((subscriber) => {
      if (typeof EventSource === 'undefined') {
        subscriber.next();
        subscriber.complete();
        return undefined;
      }

      let eventSource: EventSource | null = null;
      let reconnectTimer: number | null = null;
      let registrationSubscription: Subscription | null = null;
      let isClosed = false;

      const clearReconnectTimer = (): void => {
        if (reconnectTimer === null) {
          return;
        }

        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      };

      const closeConnection = (): void => {
        if (!eventSource) {
          return;
        }

        eventSource.removeEventListener('PB_CONNECT', onConnect);
        eventSource.removeEventListener(this.realtimeTopic, onRefresh);
        eventSource.onerror = null;
        eventSource.close();
        eventSource = null;
      };

      const scheduleReconnect = (): void => {
        if (reconnectTimer !== null || isClosed) {
          return;
        }

        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, this.reconnectDelayMs);
      };

      const resetConnectionWithReconnect = (): void => {
        if (isClosed) {
          return;
        }

        registrationSubscription?.unsubscribe();
        registrationSubscription = null;
        closeConnection();
        scheduleReconnect();
      };

      const registerClient = (clientId: string): void => {
        registrationSubscription?.unsubscribe();
        registrationSubscription = this.http
          .post<void>(`${this.pocketbaseUrl}/realtime`, {
            clientId,
            subscriptions: [this.realtimeTopic],
          })
          .pipe(take(1))
          .subscribe({
            error: () => resetConnectionWithReconnect(),
          });
      };

      const parseClientId = (rawData: string): string | null => {
        try {
          const payload = JSON.parse(rawData) as PocketbaseConnectPayload;
          if (
            typeof payload.clientId === 'string' &&
            payload.clientId.length > 0
          ) {
            return payload.clientId;
          }
        } catch {
          return null;
        }

        return null;
      };

      function onConnect(event: Event): void {
        const messageEvent = event as MessageEvent<string>;
        const clientId = parseClientId(messageEvent.data);

        if (!clientId) {
          return;
        }

        registerClient(clientId);
      }

      const onRefresh = (): void => {
        this.ngZone.run(() => subscriber.next());
      };

      const connect = (): void => {
        if (isClosed || eventSource) {
          return;
        }

        eventSource = new EventSource(`${this.pocketbaseUrl}/realtime`);
        eventSource.addEventListener('PB_CONNECT', onConnect);
        eventSource.addEventListener(this.realtimeTopic, onRefresh);
        eventSource.onerror = (): void => resetConnectionWithReconnect();
      };

      subscriber.next();
      connect();

      return () => {
        isClosed = true;
        registrationSubscription?.unsubscribe();
        clearReconnectTimer();
        closeConnection();
      };
    });
  }

  private normalizeMessage(
    message: Partial<ScheduledMessage>,
  ): ScheduledMessage {
    return {
      id: message.id ?? '',
      title: message.title ?? '',
      content: message.content ?? '',
      start: message.start ?? '',
      end: message.end ?? '',
      type: message.type === 'warning' ? 'warning' : 'info',
    };
  }
}
