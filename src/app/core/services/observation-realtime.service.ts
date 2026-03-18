import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { environment } from '@environments/environment';
import { Subject, take } from 'rxjs';

type ObservationRealtimeAction = 'create' | 'update' | 'delete';

interface PocketbaseConnectPayload {
  clientId?: string;
}

interface PocketbaseObservationRealtimePayload {
  action?: string;
  record?: {
    id?: string;
  };
}

export interface ObservationRealtimeEvent {
  action: ObservationRealtimeAction;
  recordId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ObservationRealtimeService implements OnDestroy {
  private readonly baseUrl = environment.pocketbaseUrl;
  private readonly reconnectDelayMs = 3000;
  private readonly observationTopics = [
    'observations/*',
    'observations',
    'observations-refresh',
  ];
  private eventSource: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private isDestroyed = false;
  private readonly observationChangesSubject =
    new Subject<ObservationRealtimeEvent>();

  public readonly observationChanges$ =
    this.observationChangesSubject.asObservable();

  public constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone,
  ) {
    this.connect();
  }

  public ngOnDestroy(): void {
    this.isDestroyed = true;
    this.clearReconnectTimer();
    this.closeConnection();
    this.observationChangesSubject.complete();
  }

  private connect(): void {
    if (this.isDestroyed || this.eventSource) {
      return;
    }

    const eventSource = new EventSource(`${this.baseUrl}/realtime`);
    eventSource.addEventListener('PB_CONNECT', this.onConnect);
    this.observationTopics.forEach((topic) =>
      eventSource.addEventListener(topic, this.onObservationMessage),
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
        subscriptions: this.observationTopics,
      })
      .pipe(take(1))
      .subscribe({
        error: () => this.resetConnectionWithReconnect(),
      });
  };

  private onObservationMessage = (event: Event): void => {
    const messageEvent = event as MessageEvent<string>;
    const parsed = this.parseObservationEvent(messageEvent.data);
    this.ngZone.run(() =>
      this.observationChangesSubject.next(parsed ?? { action: 'update' }),
    );
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
    this.observationTopics.forEach((topic) =>
      this.eventSource?.removeEventListener(topic, this.onObservationMessage),
    );
    this.eventSource.onerror = null;
    this.eventSource.close();
    this.eventSource = null;
  }

  private parseClientId(rawData: string): string | null {
    try {
      const payload = JSON.parse(rawData) as PocketbaseConnectPayload;
      if (typeof payload.clientId === 'string' && payload.clientId.length > 0) {
        return payload.clientId;
      }
    } catch {
      return null;
    }

    return null;
  }

  private parseObservationEvent(
    rawData: string,
  ): ObservationRealtimeEvent | null {
    try {
      const payload = JSON.parse(rawData) as PocketbaseObservationRealtimePayload;
      const action = payload.action?.toLowerCase();

      if (action !== 'create' && action !== 'update' && action !== 'delete') {
        return null;
      }

      const recordId =
        typeof payload.record?.id === 'string' ? payload.record.id : undefined;

      return { action, recordId };
    } catch {
      return null;
    }
  }
}
