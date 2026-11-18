import {
  SensorThresholdConfig,
  SENSOR_THRESHOLDS_BY_SERIES_ID,
} from '@core/config/sensor-thresholds';
import { WeatherStormWaterDataPoint } from './data-point';

export function sensorKey(
  point: WeatherStormWaterDataPoint | null | undefined,
): string | undefined {
  const series = point?.historySeries;
  return series
    ? `${series.provider}:${series.seriesId}:${series.revision ?? 0}`
    : undefined;
}

export function sensorNow(
  point: WeatherStormWaterDataPoint | null | undefined,
): number {
  return point?.historySeries?.effectiveTimeMs ?? Date.now();
}

export function sensorThresholds(
  point: WeatherStormWaterDataPoint | null | undefined,
): SensorThresholdConfig | null {
  if (point?.sensorThresholds) {
    return point.sensorThresholds;
  }
  const series = point?.historySeries;
  return series?.provider === 'intoto'
    ? (SENSOR_THRESHOLDS_BY_SERIES_ID[Number(series.seriesId)] ?? null)
    : null;
}
