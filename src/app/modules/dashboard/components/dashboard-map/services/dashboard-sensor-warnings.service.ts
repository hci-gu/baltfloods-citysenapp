import { Injectable } from '@angular/core';
import {
  getSensorThresholdSeverity,
  getWorseSensorSeverity,
  SENSOR_SEVERITY_RANK,
  SENSOR_THRESHOLDS_BY_SERIES_ID,
  SensorThresholdConfig,
  SensorThresholdSeverity,
} from '@core/config/sensor-thresholds';
import {
  DataPoint,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';
import { DashboardMessage } from '@core/services/scheduled-messages.service';
import {
  ActiveSensorThresholdPoint,
  ObservationTimespanBounds,
  SensorHistoryCacheEntry,
} from '../dashboard-map.types';
import { DashboardSensorHistoryService } from './dashboard-sensor-history.service';

@Injectable({
  providedIn: 'root',
})
export class DashboardSensorWarningsService {
  public constructor(
    private readonly sensorHistoryService: DashboardSensorHistoryService,
  ) {}

  public buildSensorWarningMessage(
    point: WeatherStormWaterDataPoint,
    historyPoints: SensorHistoryPoint[],
    bounds: ObservationTimespanBounds,
  ): DashboardMessage | null {
    const seriesId = point.historySeries?.seriesId;
    const thresholdConfig =
      seriesId !== undefined
        ? (SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null)
        : null;

    if (!thresholdConfig || historyPoints.length === 0) {
      return null;
    }

    const currentTimeMs = Date.now();
    const recentThresholdMs =
      currentTimeMs - thresholdConfig.warningMaxAgeHours * 60 * 60 * 1000;
    const redPoints = historyPoints.filter(
      (historyPoint) =>
        historyPoint.timestamp.getTime() >= recentThresholdMs &&
        historyPoint.timestamp.getTime() <= currentTimeMs &&
        getSensorThresholdSeverity(historyPoint.value, thresholdConfig) ===
          'red',
    );

    if (redPoints.length === 0) {
      return null;
    }

    const peakPoint = redPoints.reduce((highest, pointCandidate) =>
      pointCandidate.value > highest.value ||
      (pointCandidate.value === highest.value &&
        pointCandidate.timestamp.getTime() > highest.timestamp.getTime())
        ? pointCandidate
        : highest,
    );
    const measurementUnit =
      point.historySeries?.unitLabel ??
      point.dataUnitOverrides?.['waterLevel'] ??
      '';
    const warningTimestamp = peakPoint.timestamp.toLocaleString();
    const warningValue = Math.round(peakPoint.value * 1000) / 1000;

    return {
      id: `sensor-warning-${seriesId}-${bounds.startMs}-${bounds.endMs}`,
      title: `Use caution near ${point.name}`,
      content: `<p>Water levels near this sensor may be unsafe. If you are nearby, avoid flooded paths, roads, underpasses, and waterfront edges. Do not walk or drive through floodwater, and keep children and pets away from fast-moving or deep water.</p><p>Latest high sensor reading: ${warningValue} ${measurementUnit} at ${warningTimestamp}.</p>`,
      start: peakPoint.timestamp.toISOString(),
      end: peakPoint.timestamp.toISOString(),
      type: 'warning',
    };
  }

  public getHighestActiveSensorThresholdSeverity(
    dataPoints: DataPoint[],
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): Exclude<SensorThresholdSeverity, 'green'> | null {
    return dataPoints.reduce<Exclude<SensorThresholdSeverity, 'green'> | null>(
      (highestSeverity, dataPoint) => {
        const severity = this.getActiveSensorThresholdSeverity(
          dataPoint,
          bounds,
          sensorHistoryCache,
        );
        if (!severity) {
          return highestSeverity;
        }

        if (
          !highestSeverity ||
          SENSOR_SEVERITY_RANK[severity] > SENSOR_SEVERITY_RANK[highestSeverity]
        ) {
          return severity;
        }

        return highestSeverity;
      },
      null,
    );
  }

  public getActiveSensorThresholdSeverity(
    dataPoint: DataPoint,
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): Exclude<SensorThresholdSeverity, 'green'> | null {
    if (
      dataPoint.type !== DataPointType.STORM_WATER ||
      dataPoint.historySeries?.provider !== 'intoto'
    ) {
      return null;
    }

    const value = dataPoint.data['waterLevel'];
    const seriesId = dataPoint.historySeries.seriesId;
    const thresholdConfig = SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null;
    if (!thresholdConfig) {
      return null;
    }

    if (typeof value !== 'number') {
      return this.getActiveSensorHistoryThresholdSeverity(
        seriesId,
        thresholdConfig,
        bounds,
        sensorHistoryCache,
      );
    }

    const currentSeverity = getSensorThresholdSeverity(value, thresholdConfig);
    const historySeverity = this.getActiveSensorHistoryThresholdSeverity(
      seriesId,
      thresholdConfig,
      bounds,
      sensorHistoryCache,
    );

    return this.getWorseActiveSensorThresholdSeverity(
      currentSeverity === 'green' ? null : currentSeverity,
      historySeverity,
    );
  }

  public getActiveSensorHistoryThresholdPoint(
    historyPoints: SensorHistoryPoint[],
    thresholdConfig: SensorThresholdConfig,
  ): ActiveSensorThresholdPoint | null {
    const currentTimeMs = Date.now();
    const recentThresholdMs =
      currentTimeMs - thresholdConfig.warningMaxAgeHours * 60 * 60 * 1000;

    return historyPoints.reduce<ActiveSensorThresholdPoint | null>(
      (highestPoint, historyPoint) => {
        if (
          historyPoint.timestamp.getTime() < recentThresholdMs ||
          historyPoint.timestamp.getTime() > currentTimeMs
        ) {
          return highestPoint;
        }

        const severity = getSensorThresholdSeverity(
          historyPoint.value,
          thresholdConfig,
        );
        if (severity === 'green') {
          return highestPoint;
        }

        const candidate = {
          historyPoint,
          severity,
        };

        return this.getWorseActiveSensorThresholdPoint(highestPoint, candidate);
      },
      null,
    );
  }

  private getActiveSensorHistoryThresholdSeverity(
    seriesId: number,
    thresholdConfig: SensorThresholdConfig,
    bounds: ObservationTimespanBounds,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
  ): Exclude<SensorThresholdSeverity, 'green'> | null {
    const cacheEntry = this.sensorHistoryService.getCachedSensorHistoryEntry(
      seriesId,
      bounds,
      sensorHistoryCache,
    );
    if (!cacheEntry || cacheEntry.historyPoints.length === 0) {
      return null;
    }

    return (
      this.getActiveSensorHistoryThresholdPoint(
        cacheEntry.historyPoints,
        thresholdConfig,
      )?.severity ?? null
    );
  }

  private getWorseActiveSensorThresholdSeverity(
    left: Exclude<SensorThresholdSeverity, 'green'> | null,
    right: Exclude<SensorThresholdSeverity, 'green'> | null,
  ): Exclude<SensorThresholdSeverity, 'green'> | null {
    if (!left) {
      return right;
    }

    if (!right) {
      return left;
    }

    return getWorseSensorSeverity(left, right) as Exclude<
      SensorThresholdSeverity,
      'green'
    >;
  }

  private getWorseActiveSensorThresholdPoint(
    left: ActiveSensorThresholdPoint | null,
    right: ActiveSensorThresholdPoint,
  ): ActiveSensorThresholdPoint {
    if (!left) {
      return right;
    }

    const leftRank = SENSOR_SEVERITY_RANK[left.severity];
    const rightRank = SENSOR_SEVERITY_RANK[right.severity];
    if (rightRank !== leftRank) {
      return rightRank > leftRank ? right : left;
    }

    if (right.historyPoint.value !== left.historyPoint.value) {
      return right.historyPoint.value > left.historyPoint.value ? right : left;
    }

    return right.historyPoint.timestamp.getTime() >
      left.historyPoint.timestamp.getTime()
      ? right
      : left;
  }
}
