import { DatePipe } from '@angular/common';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DataPoint,
  DataPointQuality,
  DataPointType,
  WATERBAG_TESTKIT_METRIC_UNIT,
  WaterbagTestKitDataPoint,
  WaterbagTestKitDataPointData,
  WEATHER_CONDITIONS_METRIC_UNIT,
  WEATHER_STORM_WATER_METRIC_UNIT,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';

export function getWeatherConditionMetricValue(
  value: string | number,
  translateService: TranslateService,
): string | number {
  if (typeof value === 'number') {
    return Math.round(value * 10) / 10;
  }

  return getDataPointTranslation(
    DataPointType.WEATHER_CONDITIONS,
    value,
    translateService,
  );
}

export function getStormWeatherMetricValue(
  value: string | number,
  key: string,
  datePipe: DatePipe,
): string | number {
  if (key === 'dataRetrievedTimestamp') {
    const date = datePipe.transform(value, 'dd/MM/yyyy');
    return date ? date : '';
  }

  return value;
}

export function getQualityTranslation(quality: DataPointQuality): string {
  return `DASHBOARD.DATA_POINTS.QUALITY.${DataPointQuality[quality]}`;
}

export function getWaterbagTestkitValue(
  value: WaterbagTestKitDataPointData,
  key: keyof WaterbagTestKitDataPoint['data'],
  translateService: TranslateService,
): number {
  if (key === 'algae') {
    return translateService.instant(
      `DASHBOARD.DATA_POINTS.WATERBAG_TESTKIT.ALGAE_DESCRIPTION.${value.value}`,
    );
  }

  return value.calculatedValue ?? value.value;
}

export function getDataQualityBackgroundColor(
  quality: DataPointQuality,
): string {
  return DATA_POINT_QUALITY_COLOR_CHART[quality];
}

export function getDataQualityTextColor(quality: DataPointQuality): string {
  return quality === DataPointQuality.DEFAULT ? 'white' : 'black';
}

export function getMetricUnit(
  type: DataPointType,
  key: string,
): string | undefined {
  if (type === DataPointType.WEATHER_CONDITIONS) {
    return (
      WEATHER_CONDITIONS_METRIC_UNIT[
        key as keyof typeof WEATHER_CONDITIONS_METRIC_UNIT
      ] ?? ''
    );
  }

  if (type === DataPointType.STORM_WATER) {
    return (
      WEATHER_STORM_WATER_METRIC_UNIT[
        key as keyof typeof WEATHER_STORM_WATER_METRIC_UNIT
      ] ?? ''
    );
  }

  if (type === DataPointType.WATERBAG_TESTKIT) {
    return (
      WATERBAG_TESTKIT_METRIC_UNIT[
        key as keyof typeof WATERBAG_TESTKIT_METRIC_UNIT
      ] ?? ''
    );
  }

  return undefined;
}

export function getMetricUnitForDataPoint(
  point: DataPoint,
  key: string,
): string | undefined {
  if (
    point.type === DataPointType.STORM_WATER &&
    point.dataUnitOverrides?.[key]
  ) {
    return point.dataUnitOverrides[key];
  }

  return getMetricUnit(point.type, key);
}

export function getStormWaterMetrics(
  dataPoint: WeatherStormWaterDataPoint,
): { key: string; value: string | number }[] {
  return Object.entries(dataPoint.data)
    .filter(([key]) => key !== 'fillLevel')
    .map(([key, value]) => ({ key, value }));
}

export function getDataPointTranslation(
  type: DataPointType,
  key: string,
  translateService: TranslateService,
): string {
  const i18nKey = `DASHBOARD.DATA_POINTS.${Object.values(DataPointType)[type]}.${key.toUpperCase()}`;
  return translateService.instant(i18nKey);
}

export function getDataPointImageUrl(imageUrl: string): string {
  let normalized = imageUrl.trim();
  const pocketbaseBase = environment.pocketbaseUrl.replace(/\/$/, '');

  if (normalized.startsWith('../')) {
    normalized = normalized.replace(/^(\.\.\/)+/, '');
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('/api/')) {
    return normalized;
  }

  if (normalized.startsWith('api/')) {
    return `/${normalized.replace(/^\/+/, '')}`;
  }

  if (normalized.startsWith('/files/')) {
    return `${pocketbaseBase}/${normalized.replace(/^\/+/, '')}`;
  }

  if (normalized.startsWith('files/')) {
    return `${pocketbaseBase}/${normalized}`;
  }

  if (normalized.startsWith('/')) {
    return normalized;
  }

  return `${environment.streetAiUploadUrl.replace(/\/$/, '')}/${normalized.replace(/^\/+/, '')}`;
}
