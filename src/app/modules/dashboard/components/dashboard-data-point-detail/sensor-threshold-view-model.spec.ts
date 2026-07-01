import {
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import {
  getSensorAlertThresholdSummary,
  getSensorStatusDescription,
  getSensorStatusLabel,
  getSensorUnitLabel,
  getSensorValueLabel,
} from './sensor-threshold-view-model';

describe('sensor threshold view model', () => {
  it('should format sensor values and units', () => {
    const point: WeatherStormWaterDataPoint = {
      name: 'Boen bru',
      type: DataPointType.STORM_WATER,
      quality: DataPointQuality.DEFAULT,
      data: { waterLevel: 16.81234 },
      location: [58.25, 8.15] as [number, number],
      historySeries: {
        provider: 'intoto' as const,
        seriesId: 121,
        unitLabel: 'meter NN2000',
      },
    };

    expect(getSensorValueLabel(point)).toBe('16.812');
    expect(getSensorUnitLabel(point)).toBe('meter NN2000');
  });

  it('should classify configured thresholds', () => {
    const point: WeatherStormWaterDataPoint = {
      name: 'Boen bru',
      type: DataPointType.STORM_WATER,
      quality: DataPointQuality.DEFAULT,
      data: { waterLevel: 19.7 },
      location: [58.25, 8.15] as [number, number],
      historySeries: {
        provider: 'intoto' as const,
        seriesId: 121,
        unitLabel: 'MASL',
      },
    };

    expect(getSensorStatusLabel(point)).toBe('Critical');
    expect(getSensorStatusDescription(point)).toBe(
      'Above the highest configured threshold.',
    );
    expect(getSensorAlertThresholdSummary(point)).toContain('Yellow 18 MASL');
  });
});
