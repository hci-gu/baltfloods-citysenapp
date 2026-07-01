import { ObservationTimespanBounds } from './dashboard-map.types';

export const getDayStart = (date: Date): Date => {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
};

export const getDayEnd = (date: Date): Date => {
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd;
};

export const parseDateInput = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateForInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDefaultSensorViewStartDate = (fullEnd: Date): Date => {
  const defaultStart = getDayStart(new Date(fullEnd));
  defaultStart.setMonth(defaultStart.getMonth() - 3);
  defaultStart.setDate(defaultStart.getDate() + 1);
  return defaultStart;
};

export const normalizeDateInput = (
  value: string,
  bounds: ObservationTimespanBounds,
): string | null => {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return null;
  }

  const clamped = Math.min(
    Math.max(getDayStart(parsed).getTime(), bounds.startMs),
    bounds.endMs,
  );
  return formatDateForInput(new Date(clamped));
};

export const isTimestampWithinRange = (
  timestamp: Date | undefined,
  startMs: number,
  endMs: number,
): boolean => {
  if (!timestamp) {
    return true;
  }

  const value = timestamp.getTime();
  return value >= startMs && value <= endMs;
};
