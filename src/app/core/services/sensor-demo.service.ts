import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SensorThresholdConfig } from '@core/config/sensor-thresholds';
import {
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { environment } from '@environments/environment';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  map,
  merge,
  shareReplay,
  switchMap,
  take,
  tap,
  timer,
  timeout,
} from 'rxjs';
import { AppSettings } from './app-settings.service';
import { AuthService } from './auth.service';
import { SensorHistoryPoint } from './datapoints-api/intoto-storm-water.service';
import { ObservationRealtimeService } from './observation-realtime.service';

export interface SensorPlacement {
  latitude: number;
  longitude: number;
  name?: string;
  source?: string;
  featureId?: string;
}
export interface SensorDemoState {
  settings: AppSettings;
  sensor: {
    id: string;
    ready: boolean;
    name: string;
    latitude: number;
    longitude: number;
    unit: string;
    thresholds: SensorThresholdConfig;
    placement: SensorPlacement;
  };
  run: {
    stage: string;
    cursor: number;
    revision: number;
    placementError: string;
  };
  latest: { timestamp: number; value: number } | null;
}

@Injectable({ providedIn: 'root' })
export class SensorDemoService {
  private readonly refreshSubject = new Subject<void>();
  public readonly state$: Observable<SensorDemoState>;
  public readonly changes$: Observable<SensorDemoState>;

  public constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    realtime: ObservationRealtimeService,
  ) {
    // Realtime gives immediate stage changes; polling recovers missed events.
    this.state$ = merge(
      timer(0, 15000),
      this.refreshSubject,
      realtime.sensorChanges$,
    ).pipe(
      switchMap(() =>
        this.http
          .get<SensorDemoState>(`${environment.pocketbaseUrl}/demo/state`)
          .pipe(catchError(() => EMPTY)),
      ),
      distinctUntilChanged(
        (a, b) =>
          a.run.revision === b.run.revision &&
          a.settings.revision === b.settings.revision,
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.changes$ = this.state$;
  }

  public refresh(): void {
    this.refreshSubject.next();
  }

  public getSensors(): Observable<WeatherStormWaterDataPoint[]> {
    return this.state$.pipe(
      take(1),
      timeout(15000),
      map((state) => {
        const { sensor, run, latest } = state;
        if (!sensor.ready || !latest) {
          return [];
        }
        return [
          {
            type: DataPointType.STORM_WATER,
            quality: DataPointQuality.DEFAULT,
            name: `${sensor.name} (simulated)`,
            location: [sensor.latitude, sensor.longitude],
            lastUpdatedOn: new Date(latest.timestamp * 1000),
            data: { waterLevel: latest.value },
            dataUnitOverrides: { waterLevel: ` ${sensor.unit}` },
            simulated: true,
            sensorThresholds: sensor.thresholds,
            historySeries: {
              provider: 'pocketbase',
              seriesId: sensor.id,
              revision: run.revision,
              effectiveTimeMs: run.cursor * 1000,
              unitLabel: sensor.unit,
            },
          },
        ];
      }),
    );
  }

  public getHistory(
    point: WeatherStormWaterDataPoint,
    from: Date,
    to: Date,
  ): Observable<SensorHistoryPoint[]> {
    const series = point.historySeries!;
    return this.http
      .get<{ timestamp: number; value: number }[]>(
        `${environment.pocketbaseUrl}/sensors/${series.seriesId}/history`,
        {
          params: {
            from: Math.floor(from.getTime() / 1000),
            to: Math.floor(to.getTime() / 1000),
            revision: series.revision!,
          },
        },
      )
      .pipe(
        map((rows) =>
          rows.map((row) => ({
            timestamp: new Date(row.timestamp * 1000),
            value: row.value,
          })),
        ),
      );
  }

  public action(stage: string, revision: number): Observable<unknown> {
    return this.http
      .post(
        `${environment.pocketbaseUrl}/demo/action`,
        { stage, revision },
        this.authOptions(),
      )
      .pipe(tap(() => this.refresh()));
  }

  public relocate(
    origin: AppSettings['origin'],
    state: SensorDemoState,
    placement?: SensorPlacement,
  ): Observable<unknown> {
    return this.http
      .post(
        `${environment.pocketbaseUrl}/demo/location`,
        {
          origin,
          placement,
          revision: state.settings.revision,
          runRevision: state.run.revision,
        },
        this.authOptions(),
      )
      .pipe(tap(() => this.refresh()));
  }

  private authOptions(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders().set(
        'Authorization',
        `Bearer ${this.auth.token ?? ''}`,
      ),
    };
  }
}
