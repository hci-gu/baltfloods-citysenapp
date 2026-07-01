import { SensorThresholdSeverity } from '@core/config/sensor-thresholds';
import { DataPoint, DataPointType } from '@core/models/data-point';
import { LatLong } from '@core/models/location';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';

export interface ObservationFeedItem {
  id: string;
  name: string;
  location: LatLong;
  type: DataPointType;
  typeLabel: string;
  lastUpdatedOn?: Date;
  createdOn?: Date;
  imageUrl?: string;
}

export interface DataPointCluster {
  location: LatLong;
  points: DataPoint[];
}

export type ObservationTimespanKey = '6m' | '1y' | '3y' | '5y';
export type MapDisplayMode = 'default' | 'heatmap';
export type TimelineSelectionRangeKey = '7d' | '14d' | '30d' | '60d' | '90d';
export type MobileBottomPanel = 'list' | 'timeline' | null;

export interface ObservationTimespanOption {
  key: ObservationTimespanKey;
  label: string;
  days: number;
}

export interface TimelineSelectionRangeOption {
  key: TimelineSelectionRangeKey;
  label: string;
  days: number;
}

export interface ObservationTimespanBounds {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface ObservationTimelinePoint {
  x: number;
  y: number;
  count: number;
  markerPath: string;
}

export interface ObservationTimelineSeries {
  type: DataPointType;
  label: string;
  color: string;
  total: number;
  path: string;
  points: ObservationTimelinePoint[];
}

export interface ObservationTimelineTick {
  y: number;
  label: number;
}

export interface ObservationTimeline {
  series: ObservationTimelineSeries[];
  ticks: ObservationTimelineTick[];
  startLabel: string;
  endLabel: string;
}

export interface ObservationTimelineWindow {
  startMs: number;
  endMs: number;
  startRatio: number;
  widthRatio: number;
}

export interface ObservationTimelineWindowStyle {
  leftPercent: number;
  widthPercent: number;
}

export interface SensorValueTimelinePoint {
  x: number;
  y: number;
  markerPath: string;
  timestamp: Date;
  value: number;
  color: string;
  severity: SensorThresholdSeverity;
}

export interface SensorValueTimeline {
  segments: {
    path: string;
    color: string;
  }[];
  points: SensorValueTimelinePoint[];
  thresholdLines: {
    id: string;
    y: number;
    value: number;
    color: string;
    label: string;
  }[];
  minValue: number;
  maxValue: number;
  startLabel: string;
  endLabel: string;
  unitLabel: string;
}

export interface SensorTimelineCursor {
  x: number;
  y: number;
  timestamp: Date;
  value: number;
  color: string;
  severity: SensorThresholdSeverity;
}

export interface SensorHistoryCacheEntry {
  cacheKey: string;
  seriesId: number;
  startMs: number;
  endMs: number;
  historyPoints: SensorHistoryPoint[];
}

export interface ActiveSensorThresholdPoint {
  historyPoint: SensorHistoryPoint;
  severity: Exclude<SensorThresholdSeverity, 'green'>;
}
