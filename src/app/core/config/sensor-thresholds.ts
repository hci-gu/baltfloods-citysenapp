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

export const SENSOR_SEVERITY_RANK: Record<SensorThresholdSeverity, number> = {
  green: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

export const getSensorThresholdValues = (
  thresholdConfig: SensorThresholdConfig | null,
): number[] => {
  if (!thresholdConfig) {
    return [];
  }

  return thresholdConfig.bands.map((band) => band.value);
};

export const getSensorThresholdSeverity = (
  value: number,
  thresholdConfig: SensorThresholdConfig | null,
): SensorThresholdSeverity => {
  if (!thresholdConfig) {
    return 'green';
  }

  const severity = thresholdConfig.bands.reduce<SensorThresholdSeverity>(
    (currentSeverity, band) => {
      if (value < band.value) {
        return currentSeverity;
      }

      return getWorseSensorSeverity(currentSeverity, band.severity);
    },
    'green',
  );

  const highestBand = thresholdConfig.bands.reduce(
    (highest, band) => (band.value > highest.value ? band : highest),
    thresholdConfig.bands[0],
  );

  if (
    highestBand &&
    highestBand.severity !== 'red' &&
    value >= highestBand.value
  ) {
    return 'red';
  }

  return severity;
};

export const getSensorThresholdColor = (
  value: number,
  thresholdConfig: SensorThresholdConfig | null,
): string => {
  return SENSOR_THRESHOLD_COLORS[
    getSensorThresholdSeverity(value, thresholdConfig)
  ];
};

export const getWorseSensorSeverity = (
  left: SensorThresholdSeverity,
  right: SensorThresholdSeverity,
): SensorThresholdSeverity => {
  return SENSOR_SEVERITY_RANK[left] >= SENSOR_SEVERITY_RANK[right]
    ? left
    : right;
};

export const capitalizeSensorSeverity = (
  severity: SensorThresholdSeverity,
): string => `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;

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

export const SENSOR_THRESHOLDS_BY_SERIES_ID = Object.fromEntries([
  [121, BOEN_BRU_THRESHOLDS],
  [213, BOEN_BRU_THRESHOLDS],
]) as Record<number, SensorThresholdConfig>;
