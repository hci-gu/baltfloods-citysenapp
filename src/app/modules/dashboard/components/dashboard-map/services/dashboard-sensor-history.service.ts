import { sensorKey, sensorNow, sensorThresholds } from '@core/models/sensor';
import { Injectable, signal } from '@angular/core';
import { SensorThresholdConfig } from '@core/config/sensor-thresholds';
import {
  DataPoint,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import {
  DataPointsApi,
  SensorHistoryPoint,
} from '@core/services/datapoints-api/datapoints-api.service';
import {
  ObservationTimespanBounds,
  ObservationTimelineWindow,
  SensorHistoryCacheEntry,
} from '../dashboard-map.types';
import { isTimestampWithinRange } from '../dashboard-date.utils';
import {
  Observable,
  Subject,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  takeUntil,
  tap,
} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DashboardSensorHistoryService {
  public readonly sensorHistoryCache = signal<
    Record<string, SensorHistoryCacheEntry>
  >({});

  private readonly sensorHistoryRequests = new Map<
    string,
    Observable<SensorHistoryPoint[]>
  >();

  private readonly invalidated = new Subject<void>();

  public constructor(private readonly dataPointsApi: DataPointsApi) {}

  public clear(): void {
    this.invalidated.next();
    this.sensorHistoryRequests.clear();
    this.sensorHistoryCache.set({});
  }

  public loadSensorHistory(
    point: WeatherStormWaterDataPoint,
    bounds: ObservationTimespanBounds,
  ): Observable<SensorHistoryPoint[]> {
    const seriesId = sensorKey(point);
    if (seriesId === undefined) {
      return of([]);
    }

    const cacheKey = this.getSensorHistoryCacheKey(seriesId, bounds);
    const cached = this.sensorHistoryCache()[cacheKey];
    if (cached) {
      return of(cached.historyPoints);
    }

    const coveringCacheEntry = Object.values(this.sensorHistoryCache()).find(
      (entry) =>
        entry.seriesId === seriesId &&
        entry.startMs <= bounds.startMs &&
        entry.endMs >= bounds.endMs,
    );
    if (coveringCacheEntry) {
      return of(
        coveringCacheEntry.historyPoints.filter(
          (historyPoint) =>
            historyPoint.timestamp.getTime() >= bounds.startMs &&
            historyPoint.timestamp.getTime() <= bounds.endMs,
        ),
      );
    }

    const inFlight = this.sensorHistoryRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request$ = this.dataPointsApi
      .getStormWaterHistory(
        point,
        new Date(bounds.startMs),
        new Date(bounds.endMs),
      )
      .pipe(
        takeUntil(this.invalidated),
        map((historyPoints) =>
          historyPoints
            .slice()
            .sort(
              (left, right) =>
                left.timestamp.getTime() - right.timestamp.getTime(),
            ),
        ),
        tap((historyPoints) =>
          this.sensorHistoryCache.update((current) => ({
            ...current,
            [cacheKey]: {
              cacheKey,
              seriesId,
              startMs: bounds.startMs,
              endMs: bounds.endMs,
              historyPoints,
            },
          })),
        ),
        finalize(() => {
          this.sensorHistoryRequests.delete(cacheKey);
        }),
        catchError(() => of([])),
        shareReplay(1),
      );

    this.sensorHistoryRequests.set(cacheKey, request$);
    return request$;
  }

  public getSensorPoints(points: DataPoint[]): WeatherStormWaterDataPoint[] {
    return points.filter(
      (point): point is WeatherStormWaterDataPoint =>
        point.type === DataPointType.STORM_WATER && !!point.historySeries,
    );
  }

  public isPointVisibleInCurrentTimeContext(
    point: DataPoint,
    selectedWindow: ObservationTimelineWindow,
    observationBounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): boolean {
    if (
      point.type === DataPointType.STORM_WATER &&
      !!point.historySeries &&
      this.isCurrentTimeWithinSensorHistorySpan(
        sensorKey(point)!,
        observationBounds,
        sensorHistoryCache,
        sensorNow(point),
      )
    ) {
      return true;
    }

    return isTimestampWithinRange(
      point.lastUpdatedOn,
      selectedWindow.startMs,
      selectedWindow.endMs,
    );
  }

  public isCurrentTimeWithinSensorHistorySpan(
    seriesId: number | string,
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
    currentTimeMs = Date.now(),
  ): boolean {
    const cacheEntry = this.getCachedSensorHistoryEntry(
      seriesId,
      bounds,
      sensorHistoryCache,
    );
    if (!cacheEntry || cacheEntry.historyPoints.length === 0) {
      return false;
    }

    const firstTimestamp = cacheEntry.historyPoints[0].timestamp.getTime();
    const lastTimestamp =
      cacheEntry.historyPoints[
        cacheEntry.historyPoints.length - 1
      ].timestamp.getTime();

    return currentTimeMs >= firstTimestamp && currentTimeMs <= lastTimestamp;
  }

  public getCachedSensorHistoryEntry(
    seriesId: number | string,
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): SensorHistoryCacheEntry | null {
    const exactEntry =
      sensorHistoryCache[this.getSensorHistoryCacheKey(seriesId, bounds)];
    if (exactEntry) {
      return exactEntry;
    }

    return (
      Object.values(sensorHistoryCache).find(
        (entry) =>
          entry.seriesId === seriesId &&
          entry.startMs <= bounds.startMs &&
          entry.endMs >= bounds.endMs,
      ) ?? null
    );
  }

  public getSensorHistoryCacheKey(
    seriesId: number | string,
    bounds: ObservationTimespanBounds,
  ): string {
    return `${seriesId}:${bounds.startMs}:${bounds.endMs}`;
  }

  public compareSensorHistoryCacheEntriesForCurrentTime(
    left: SensorHistoryCacheEntry,
    right: SensorHistoryCacheEntry,
    currentTimeMs: number,
  ): number {
    const leftCoversCurrentTime =
      left.startMs <= currentTimeMs && left.endMs >= currentTimeMs;
    const rightCoversCurrentTime =
      right.startMs <= currentTimeMs && right.endMs >= currentTimeMs;
    if (leftCoversCurrentTime !== rightCoversCurrentTime) {
      return rightCoversCurrentTime ? 1 : -1;
    }

    const durationDifference =
      right.endMs - right.startMs - (left.endMs - left.startMs);
    if (durationDifference !== 0) {
      return durationDifference;
    }

    const latestPointDifference =
      this.getSensorHistoryEntryLastTimestamp(right) -
      this.getSensorHistoryEntryLastTimestamp(left);
    if (latestPointDifference !== 0) {
      return latestPointDifference;
    }

    return right.endMs - left.endMs;
  }

  public getActiveThresholdConfig(
    point: WeatherStormWaterDataPoint | null,
    thresholdsBySeriesId: Record<number, SensorThresholdConfig>,
  ): SensorThresholdConfig | null {
    return (
      sensorThresholds(point) ??
      (point?.historySeries?.provider === 'intoto'
        ? (thresholdsBySeriesId[Number(point.historySeries.seriesId)] ?? null)
        : null)
    );
  }

  private getSensorHistoryEntryLastTimestamp(
    entry: SensorHistoryCacheEntry,
  ): number {
    const lastPoint = entry.historyPoints[entry.historyPoints.length - 1];
    return lastPoint?.timestamp.getTime() ?? Number.NEGATIVE_INFINITY;
  }
}
