import {
  SENSOR_THRESHOLD_COLORS,
  SENSOR_THRESHOLDS_BY_SERIES_ID,
  SensorThresholdConfig,
  SensorThresholdSeverity,
} from '@core/config/sensor-thresholds';
import {
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { getMetricUnit } from './data-point-detail-view-model';

export function getSensorValue(
  dataPoint: WeatherStormWaterDataPoint,
): number | null {
  const value = dataPoint.data['waterLevel'];
  return typeof value === 'number' ? value : null;
}

export function getSensorValueLabel(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  const value = getSensorValue(dataPoint);

  if (value === null) {
    return 'No reading';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

export function getSensorStatusLabel(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  const severity = getSensorSeverity(dataPoint);

  switch (severity) {
    case 'yellow':
      return 'Watch';
    case 'orange':
      return 'Warning';
    case 'red':
      return 'Critical';
    default:
      return 'Normal';
  }
}

export function getSensorStatusDescription(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  const severity = getSensorSeverity(dataPoint);

  switch (severity) {
    case 'yellow':
      return 'Above the watch threshold.';
    case 'orange':
      return 'Above the warning threshold.';
    case 'red':
      return 'Above the highest configured threshold.';
    default:
      return 'Within the normal range.';
  }
}

export function getSensorStatusBackgroundColor(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  return SENSOR_THRESHOLD_COLORS[getSensorSeverity(dataPoint)];
}

export function getSensorStatusTextColor(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  return getSensorSeverity(dataPoint) === 'yellow' ? '#111827' : 'white';
}

export function getSensorAlertThresholdSummary(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  const thresholdConfig = getSensorThresholdConfig(dataPoint);

  if (!thresholdConfig) {
    return 'No alert thresholds configured.';
  }

  const yellowThreshold = thresholdConfig.bands.find(
    (band) => band.severity === 'yellow',
  )?.value;
  const orangeThreshold = thresholdConfig.bands.find(
    (band) => band.severity === 'orange',
  )?.value;
  const highestThreshold = thresholdConfig.bands.reduce(
    (max, band) => Math.max(max, band.value),
    Number.NEGATIVE_INFINITY,
  );
  const unitLabel = thresholdConfig.unitLabel;
  const parts = [
    yellowThreshold !== undefined
      ? `Yellow ${yellowThreshold} ${unitLabel}`
      : null,
    orangeThreshold !== undefined
      ? `Orange ${orangeThreshold} ${unitLabel}`
      : null,
    Number.isFinite(highestThreshold)
      ? `Red above ${highestThreshold} ${unitLabel}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.join('  •  ');
}

export function getSensorUnitLabel(
  dataPoint: WeatherStormWaterDataPoint,
): string {
  return (
    dataPoint.dataUnitOverrides?.['waterLevel'] ??
    dataPoint.historySeries?.unitLabel ??
    getMetricUnit(DataPointType.STORM_WATER, 'waterLevel') ??
    ''
  );
}

export function isIntotoStormWaterDataPoint(
  dataPoint: WeatherStormWaterDataPoint,
): boolean {
  return dataPoint.historySeries?.provider === 'intoto';
}

export function hasStormWaterFillLevel(
  dataPoint: WeatherStormWaterDataPoint,
): boolean {
  return dataPoint.data['fillLevel'] !== undefined;
}

function getSensorSeverity(
  dataPoint: WeatherStormWaterDataPoint,
): SensorThresholdSeverity {
  const value = getSensorValue(dataPoint);
  const thresholdConfig = getSensorThresholdConfig(dataPoint);

  if (value === null || !thresholdConfig) {
    return 'green';
  }

  const matchingBands = thresholdConfig.bands.filter(
    (band) => value >= band.value,
  );

  if (matchingBands.length === 0) {
    return 'green';
  }

  const highestBand = matchingBands.reduce((currentHighest, band) =>
    band.value > currentHighest.value ? band : currentHighest,
  );
  const highestConfiguredValue = thresholdConfig.bands.reduce(
    (max, band) => Math.max(max, band.value),
    Number.NEGATIVE_INFINITY,
  );

  if (
    highestBand.severity !== 'red' &&
    value >= highestConfiguredValue &&
    Number.isFinite(highestConfiguredValue)
  ) {
    return 'red';
  }

  return highestBand.severity;
}

function getSensorThresholdConfig(
  dataPoint: WeatherStormWaterDataPoint,
): SensorThresholdConfig | null {
  const seriesId = dataPoint.historySeries?.seriesId;

  if (seriesId === undefined) {
    return null;
  }

  return SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null;
}
