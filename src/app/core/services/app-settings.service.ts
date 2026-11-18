import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Injectable,
  InjectionToken,
  NgZone,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { LatLong } from '@core/models/location';
import { environment } from '@environments/environment';
import { firstValueFrom, timeout } from 'rxjs';

export interface AppSettings {
  origin: { latitude: number; longitude: number };
  revision: number;
}

// A document restart clears every location-specific service, draft, and pending
// request together. Persistent authentication is intentionally retained.
export const RESTART_AT_MAP = new InjectionToken<() => void>('restart at map', {
  providedIn: 'root',
  factory: (): (() => void) => {
    const document = inject(DOCUMENT);
    return (): void => window.location.replace(document.baseURI);
  },
});

@Injectable({ providedIn: 'root' })
export class AppSettingsService implements OnDestroy {
  public readonly ready = signal(false);
  public readonly loading = signal(false);
  public readonly failed = signal(false);
  private current?: AppSettings;
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly restart = inject(RESTART_AT_MAP);
  private readonly baseUrl = environment.pocketbaseUrl;
  private readonly topic = 'app_settings/appsettings0001';
  private source: EventSource | null = null;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private destroyed = false;
  private restarting = false;
  private refreshPending = false;

  public get origin(): LatLong {
    if (!this.current) {
      throw new Error('App settings must load before creating a map.');
    }
    return [this.current.origin.latitude, this.current.origin.longitude];
  }

  public async load(): Promise<void> {
    if (this.loading() || this.destroyed || this.restarting) {
      return;
    }
    this.loading.set(true);
    try {
      const settings = await firstValueFrom(
        this.http
          .get<AppSettings>(
            `${this.baseUrl}/collections/app_settings/records/appsettings0001`,
            {
              // Prevent intermediaries from serving an earlier configuration.
              params: { freshness: Date.now().toString() },
            },
          )
          .pipe(timeout(15000)),
      );
      if (this.destroyed || this.restarting) {
        return;
      }
      this.validate(settings);
      if (
        this.current &&
        (settings.revision !== this.current.revision ||
          settings.origin.latitude !== this.current.origin.latitude ||
          settings.origin.longitude !== this.current.origin.longitude)
      ) {
        this.restarting = true;
        this.ready.set(false);
        this.disconnect();
        this.restart();
        return;
      }
      this.current = settings;
      this.failed.set(false);
      this.ready.set(true);
      this.watch();
    } catch {
      if (!this.current) {
        this.failed.set(true);
      }
      // During a temporary outage retain the current consistent view. Recheck
      // on reconnect and periodically, including if SSE is blocked by a proxy.
    } finally {
      this.loading.set(false);
      if (this.refreshPending) {
        this.refreshPending = false;
        void this.load();
      }
    }
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.disconnect();
    window.removeEventListener('online', this.refresh);
    document.removeEventListener('visibilitychange', this.refresh);
  }

  private readonly refresh = (): void => {
    if (this.loading()) {
      this.refreshPending = true;
      return;
    }
    void this.load();
  };

  private watch(): void {
    if (!this.pollTimer) {
      this.zone.runOutsideAngular(() => {
        this.pollTimer = setInterval(this.refresh, 30000);
      });
      window.addEventListener('online', this.refresh);
      document.addEventListener('visibilitychange', this.refresh);
    }
    if (
      this.source ||
      this.reconnectTimer ||
      typeof EventSource === 'undefined'
    ) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const source = new EventSource(`${this.baseUrl}/realtime`);
      this.source = source;
      source.addEventListener('PB_CONNECT', (event) => {
        void this.subscribe(source, event as MessageEvent<string>);
      });
      source.addEventListener(this.topic, () => {
        this.zone.run(this.refresh);
      });
      source.onerror = (): void => this.reconnect(source);
    });
  }

  private async subscribe(
    source: EventSource,
    event: MessageEvent<string>,
  ): Promise<void> {
    try {
      const { clientId } = JSON.parse(event.data) as { clientId?: string };
      if (!clientId) {
        throw new Error('Missing realtime client ID');
      }
      await firstValueFrom(
        this.http
          .post(`${this.baseUrl}/realtime`, {
            clientId,
            subscriptions: [this.topic],
          })
          .pipe(timeout(15000)),
      );
      if (this.source === source) {
        // Closes the race between initial GET and subscription, and catches
        // resets missed while disconnected.
        this.zone.run(this.refresh);
      }
    } catch {
      this.reconnect(source);
    }
  }

  private reconnect(source: EventSource): void {
    if (this.source !== source) {
      return;
    }
    source.close();
    this.source = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.destroyed && !this.restarting) {
        this.watch();
      }
    }, 3000);
  }

  private disconnect(): void {
    this.source?.close();
    this.source = null;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pollTimer);
    this.reconnectTimer = undefined;
    this.pollTimer = undefined;
  }

  private validate(settings: AppSettings): void {
    const origin = settings?.origin;
    if (
      !origin ||
      !Number.isFinite(origin.latitude) ||
      Math.abs(origin.latitude) > 90 ||
      !Number.isFinite(origin.longitude) ||
      Math.abs(origin.longitude) > 180 ||
      !Number.isSafeInteger(settings.revision) ||
      settings.revision < 1
    ) {
      throw new Error('Invalid app location settings');
    }
  }
}
