import { DataPointType } from '@core/models/data-point';
import {
  MapDisplayMode,
  ObservationTimespanOption,
  TimelineSelectionRangeOption,
} from './dashboard-map.types';

export const OBSERVATION_TIMELINE_COLOR: Record<DataPointType, string> = {
  [DataPointType.WEATHER_CONDITIONS]: '#0284c7',
  [DataPointType.AIR_QUALITY]: '#ea580c',
  [DataPointType.STORM_WATER]: '#15803d',
  [DataPointType.PARKING]: '#4f46e5',
  [DataPointType.ROAD_WORKS]: '#b45309',
  [DataPointType.WATERBAG_TESTKIT]: '#0f766e',
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const INTOTO_SENSOR_MARKER_ICON = 'sensor-water-level-icon.svg';
export const WEB_MERCATOR_TILE_SIZE = 256;
export const OBSERVATION_REFRESH_MIN_DISTANCE_KM = 1.5;
export const OBSERVATION_REFRESH_VIEWPORT_FRACTION = 0.35;

export const OBSERVATION_TIMESPAN_OPTIONS: ObservationTimespanOption[] = [
  { key: '6m', label: '6 months', days: 183 },
  { key: '1y', label: '1 year', days: 365 },
  { key: '3y', label: '3 years', days: 365 * 3 },
  { key: '5y', label: '5 years', days: 365 * 5 },
];

export const DISPLAY_MODE_OPTIONS: {
  key: MapDisplayMode;
  label: string;
}[] = [
  { key: 'default', label: 'Default' },
  { key: 'heatmap', label: 'Heatmap' },
];

export const TIMELINE_SELECTION_RANGE_OPTIONS: TimelineSelectionRangeOption[] =
  [
    { key: '7d', label: '7 days', days: 7 },
    { key: '14d', label: '14 days', days: 14 },
    { key: '30d', label: '30 days', days: 30 },
    { key: '60d', label: '60 days', days: 60 },
    { key: '90d', label: '90 days', days: 90 },
  ];
