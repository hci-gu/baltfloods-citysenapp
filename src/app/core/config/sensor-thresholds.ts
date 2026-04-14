export type SensorThresholdSeverity = 'green' | 'yellow' | 'orange' | 'red';

export interface SensorThresholdBand {
  id: string;
  severity: Exclude<SensorThresholdSeverity, 'green'>;
  value: number;
}

export interface SensorThresholdConfig {
  unitLabel: string;
  warningMaxAgeHours: number;
  bands: SensorThresholdBand[];
}

export const SENSOR_THRESHOLD_COLORS: Record<SensorThresholdSeverity, string> =
  {
    green: '#15803d',
    yellow: '#eab308',
    orange: '#f97316',
    red: '#dc2626',
  };

const BOEN_BRU_THRESHOLDS: SensorThresholdConfig = {
  unitLabel: 'MASL',
  warningMaxAgeHours: 12,
  bands: [
    {
      id: 'yellow-18-0',
      severity: 'yellow',
      value: 18.0,
    },
    {
      id: 'yellow-18-4',
      severity: 'yellow',
      value: 18.4,
    },
    {
      id: 'orange-18-5',
      severity: 'orange',
      value: 18.5,
    },
    {
      id: 'orange-19-5',
      severity: 'orange',
      value: 19.5,
    },
  ],
};

export const SENSOR_THRESHOLDS_BY_SERIES_ID: Record<
  number,
  SensorThresholdConfig
> = {
  121: BOEN_BRU_THRESHOLDS,
  213: BOEN_BRU_THRESHOLDS,
};
