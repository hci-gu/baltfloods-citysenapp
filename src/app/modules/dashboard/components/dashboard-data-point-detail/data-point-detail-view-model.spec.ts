import { DatePipe } from '@angular/common';
import { DataPointQuality, DataPointType } from '@core/models/data-point';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';
import {
  getDataPointImageUrl,
  getDataPointTranslation,
  getDataQualityTextColor,
  getMetricUnit,
  getStormWeatherMetricValue,
  getWeatherConditionMetricValue,
} from './data-point-detail-view-model';

describe('data point detail view model', () => {
  const translateService = {
    instant: jest.fn((key) => key),
  } as unknown as TranslateService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should round numeric weather values and translate string values', () => {
    expect(getWeatherConditionMetricValue(12.34, translateService)).toBe(12.3);
    expect(getWeatherConditionMetricValue('icy', translateService)).toBe(
      'DASHBOARD.DATA_POINTS.WEATHER_CONDITIONS.ICY',
    );
  });

  it('should format storm water timestamp metrics', () => {
    expect(
      getStormWeatherMetricValue(
        new Date('2026-04-12T10:00:00Z').toISOString(),
        'dataRetrievedTimestamp',
        new DatePipe('en-US'),
      ),
    ).toBe('12/04/2026');
  });

  it('should resolve metric units and quality text colors', () => {
    expect(getMetricUnit(DataPointType.STORM_WATER, 'waterLevel')).toBe(' mm');
    expect(getDataQualityTextColor(DataPointQuality.DEFAULT)).toBe('white');
    expect(getDataQualityTextColor(DataPointQuality.GOOD)).toBe('black');
  });

  it('should build translation keys', () => {
    expect(
      getDataPointTranslation(
        DataPointType.WATERBAG_TESTKIT,
        'waterPh',
        translateService,
      ),
    ).toBe('DASHBOARD.DATA_POINTS.WATERBAG_TESTKIT.WATERPH');
  });

  it('should normalize image URLs', () => {
    expect(getDataPointImageUrl('/api/files/observations/1/photo.jpg')).toBe(
      '/api/files/observations/1/photo.jpg',
    );
    expect(getDataPointImageUrl('../uploads/photo.jpg')).toBe(
      `${environment.streetAiUploadUrl.replace(/\/$/, '')}/uploads/photo.jpg`,
    );
  });
});
