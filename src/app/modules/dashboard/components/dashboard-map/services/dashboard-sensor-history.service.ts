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
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';

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

  public constructor(private readonly dataPointsApi: DataPointsApi) {}

  public loadSensorHistory(
    point: WeatherStormWaterDataPoint,
    bounds: ObservationTimespanBounds,
  ): Observable<SensorHistoryPoint[]> {
    const seriesId = point.historySeries?.seriesId;
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
        shareReplay(1),
      );

    this.sensorHistoryRequests.set(cacheKey, request$);
    return request$;
  }

  public getIntotoStormWaterPoints(
    points: DataPoint[],
  ): WeatherStormWaterDataPoint[] {
    return points.filter(
      (point): point is WeatherStormWaterDataPoint =>
        point.type === DataPointType.STORM_WATER &&
        point.historySeries?.provider === 'intoto',
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
      point.historySeries?.provider === 'intoto' &&
      this.isCurrentTimeWithinSensorHistorySpan(
        point.historySeries.seriesId,
        observationBounds,
        sensorHistoryCache,
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
    seriesId: number,
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): boolean {
    const cacheEntry = this.getCachedSensorHistoryEntry(
      seriesId,
      bounds,
      sensorHistoryCache,
    );
    if (!cacheEntry || cacheEntry.historyPoints.length === 0) {
      return false;
    }

    const currentTimeMs = Date.now();
    const firstTimestamp = cacheEntry.historyPoints[0].timestamp.getTime();
    const lastTimestamp =
      cacheEntry.historyPoints[
        cacheEntry.historyPoints.length - 1
      ].timestamp.getTime();

    return currentTimeMs >= firstTimestamp && currentTimeMs <= lastTimestamp;
  }

  public getCachedSensorHistoryEntry(
    seriesId: number,
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
    seriesId: number,
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
    const seriesId = point?.historySeries?.seriesId;
    return seriesId !== undefined
      ? (thresholdsBySeriesId[seriesId] ?? null)
      : null;
  }

  private getSensorHistoryEntryLastTimestamp(
    entry: SensorHistoryCacheEntry,
  ): number {
    const lastPoint = entry.historyPoints[entry.historyPoints.length - 1];
    return lastPoint?.timestamp.getTime() ?? Number.NEGATIVE_INFINITY;
  }
}
