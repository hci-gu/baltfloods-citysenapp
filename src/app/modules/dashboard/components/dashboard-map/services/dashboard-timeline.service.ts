import { Injectable } from '@angular/core';
import {
  capitalizeSensorSeverity,
  getSensorThresholdColor,
  getSensorThresholdSeverity,
  getSensorThresholdValues,
  getWorseSensorSeverity,
  SENSOR_THRESHOLD_COLORS,
  SensorThresholdConfig,
} from '@core/config/sensor-thresholds';
import { DataPointType } from '@core/models/data-point';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';
import { DAY_MS, OBSERVATION_TIMELINE_COLOR } from '../dashboard-map.constants';
import {
  formatDateForInput,
  getDayStart,
  isTimestampWithinRange,
} from '../dashboard-date.utils';
import {
  ObservationFeedItem,
  ObservationTimeline,
  ObservationTimelineTick,
  ObservationTimespanBounds,
  SensorValueTimeline,
  SensorValueTimelinePoint,
} from '../dashboard-map.types';

@Injectable({
  providedIn: 'root',
})
export class DashboardTimelineService {
  private readonly timelinePaddingTop = 7;
  private readonly timelinePaddingBottom = 8;
  private readonly timelinePaddingHorizontal = 2;

  public buildObservationTimeline(
    feedItems: ObservationFeedItem[],
    bounds: ObservationTimespanBounds,
    typeFilter: DataPointType[],
    getObservationTypeLabel: (type: DataPointType) => string,
  ): ObservationTimeline {
    const observations = feedItems
      .filter((item) =>
        isTimestampWithinRange(
          item.lastUpdatedOn,
          bounds.startMs,
          bounds.endMs,
        ),
      )
      .filter((item) => this.matchesTypeFilter(item.type, typeFilter))
      .filter((item) => item.lastUpdatedOn) as (ObservationFeedItem & {
      lastUpdatedOn: Date;
    })[];

    const start = getDayStart(new Date(bounds.startMs));
    const end = getDayStart(new Date(bounds.endMs));
    const totalDays = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1,
    );
    const bucketSizeDays = totalDays > 540 ? 30 : totalDays > 180 ? 7 : 1;
    const bucketCount = Math.max(1, Math.ceil(totalDays / bucketSizeDays));

    const leftX = this.timelinePaddingHorizontal;
    const rightX = 100 - this.timelinePaddingHorizontal;
    const topY = this.timelinePaddingTop;
    const bottomY = 100 - this.timelinePaddingBottom;
    const plotWidth = rightX - leftX;
    const plotHeight = bottomY - topY;

    const seriesMap = new Map<DataPointType, number[]>();
    observations.forEach((item) => {
      const elapsedDays = Math.floor(
        (getDayStart(item.lastUpdatedOn).getTime() - start.getTime()) / DAY_MS,
      );
      const bucketIndex = Math.max(
        0,
        Math.min(bucketCount - 1, Math.floor(elapsedDays / bucketSizeDays)),
      );

      if (!seriesMap.has(item.type)) {
        seriesMap.set(item.type, new Array(bucketCount).fill(0));
      }

      const buckets = seriesMap.get(item.type);
      if (buckets) {
        buckets[bucketIndex] += 1;
      }
    });

    const maxCount = Math.max(
      1,
      ...Array.from(seriesMap.values()).flatMap((counts) => counts),
    );

    const series = Array.from(seriesMap.entries())
      .map(([type, counts]) => {
        const points = counts.map((count, index) => {
          const progress = bucketCount > 1 ? index / (bucketCount - 1) : 0.5;
          const x = leftX + progress * plotWidth;
          const y = bottomY - (count / maxCount) * plotHeight;

          return {
            x,
            y,
            count,
            markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
          };
        });

        return {
          type,
          label: getObservationTypeLabel(type),
          color: OBSERVATION_TIMELINE_COLOR[type],
          total: counts.reduce((sum, value) => sum + value, 0),
          path: points
            .map(
              (point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
            )
            .join(' '),
          points,
        };
      })
      .sort((a, b) => b.total - a.total);

    const ticks: ObservationTimelineTick[] = [0, 0.25, 0.5, 0.75, 1].map(
      (ratio) => ({
        y: bottomY - ratio * plotHeight,
        label: Math.round(maxCount * ratio),
      }),
    );

    return {
      series,
      ticks,
      startLabel: start.toLocaleDateString(),
      endLabel: end.toLocaleDateString(),
    };
  }

  public buildSensorValueTimeline(
    historyPoints: SensorHistoryPoint[],
    unitLabel: string,
    bounds: ObservationTimespanBounds,
    thresholdConfig: SensorThresholdConfig | null,
  ): SensorValueTimeline {
    const sortedPoints = this.bucketSensorHistoryPoints(historyPoints, bounds)
      .slice()
      .sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
    const leftX = this.timelinePaddingHorizontal;
    const rightX = 100 - this.timelinePaddingHorizontal;
    const topY = this.timelinePaddingTop;
    const bottomY = 100 - this.timelinePaddingBottom;
    const plotWidth = rightX - leftX;
    const plotHeight = bottomY - topY;
    const thresholdValues = getSensorThresholdValues(thresholdConfig);
    const minValue = Math.min(
      ...sortedPoints.map((point) => point.value),
      ...thresholdValues,
    );
    const maxValue = Math.max(
      ...sortedPoints.map((point) => point.value),
      ...thresholdValues,
    );
    const valueRange = Math.max(1e-6, maxValue - minValue);
    const durationMs = Math.max(1, bounds.endMs - bounds.startMs);

    const points = sortedPoints.map((point) => {
      const progress = Math.max(
        0,
        Math.min(1, (point.timestamp.getTime() - bounds.startMs) / durationMs),
      );
      const normalizedValue = (point.value - minValue) / valueRange;
      const x = leftX + progress * plotWidth;
      const y = bottomY - normalizedValue * plotHeight;

      return {
        x,
        y,
        timestamp: point.timestamp,
        value: point.value,
        severity: getSensorThresholdSeverity(point.value, thresholdConfig),
        color: getSensorThresholdColor(point.value, thresholdConfig),
        markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
      };
    });

    const segments = this.buildSensorTimelineSegments(points);
    const thresholdLines = this.buildSensorThresholdLines(
      thresholdConfig,
      minValue,
      valueRange,
      topY,
      bottomY,
    );

    return {
      segments,
      points,
      thresholdLines,
      minValue,
      maxValue,
      startLabel: new Date(bounds.startMs).toLocaleDateString(),
      endLabel: new Date(bounds.endMs).toLocaleDateString(),
      unitLabel,
    };
  }

  private buildSensorTimelineSegments(
    points: SensorValueTimelinePoint[],
  ): { path: string; color: string }[] {
    if (points.length < 2) {
      return [];
    }

    const segments: { path: string; color: string }[] = [];
    let activeSeverity = getWorseSensorSeverity(
      points[0].severity,
      points[1].severity,
    );
    let activePath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;

    for (let index = 1; index < points.length - 1; index += 1) {
      const nextSeverity = getWorseSensorSeverity(
        points[index].severity,
        points[index + 1].severity,
      );

      if (nextSeverity === activeSeverity) {
        activePath += ` L ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
        continue;
      }

      segments.push({
        path: activePath,
        color: SENSOR_THRESHOLD_COLORS[activeSeverity],
      });
      activeSeverity = nextSeverity;
      activePath = `M ${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)} L ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
    }

    segments.push({
      path: activePath,
      color: SENSOR_THRESHOLD_COLORS[activeSeverity],
    });

    return segments;
  }

  private buildSensorThresholdLines(
    thresholdConfig: SensorThresholdConfig | null,
    minValue: number,
    valueRange: number,
    topY: number,
    bottomY: number,
  ): {
    id: string;
    y: number;
    value: number;
    color: string;
    label: string;
  }[] {
    if (!thresholdConfig) {
      return [];
    }

    const plotHeight = bottomY - topY;

    return thresholdConfig.bands.map((band) => ({
      id: band.id,
      y: bottomY - ((band.value - minValue) / valueRange) * plotHeight,
      value: band.value,
      color: SENSOR_THRESHOLD_COLORS[band.severity],
      label: `${capitalizeSensorSeverity(band.severity)} threshold`,
    }));
  }

  private bucketSensorHistoryPoints(
    historyPoints: SensorHistoryPoint[],
    bounds: ObservationTimespanBounds,
  ): SensorHistoryPoint[] {
    if (bounds.durationMs <= 31 * DAY_MS) {
      return historyPoints;
    }

    const maxPointByDay = new Map<string, SensorHistoryPoint>();

    historyPoints.forEach((point) => {
      const bucketKey = formatDateForInput(point.timestamp);
      const current = maxPointByDay.get(bucketKey);

      if (
        !current ||
        point.value > current.value ||
        (point.value === current.value &&
          point.timestamp.getTime() > current.timestamp.getTime())
      ) {
        maxPointByDay.set(bucketKey, point);
      }
    });

    return Array.from(maxPointByDay.values());
  }

  private matchesTypeFilter(
    type: DataPointType,
    typeFilter: DataPointType[],
  ): boolean {
    return typeFilter.length === 0 || typeFilter.includes(type);
  }
}
