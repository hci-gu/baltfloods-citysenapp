import { ObservationRecord } from '@core/services/observation-records.service';
import {
  dayKey,
  getCreatedTimestamp,
  getDayStart,
} from './admin-observation-stats';

export interface UploadChartPoint {
  x: number;
  y: number;
  count: number;
  label: string;
  markerPath: string;
}

export interface UploadChartTick {
  y: number;
  label: number;
}

export interface UploadChart {
  points: UploadChartPoint[];
  linePath: string;
  areaPath: string;
  ticks: UploadChartTick[];
  startLabel: string;
  endLabel: string;
  totalPeriodUploads: number;
}

const CHART_PADDING_TOP = 6;
const CHART_PADDING_BOTTOM = 6;
const CHART_PADDING_HORIZONTAL = 2;

export function buildUploadChart(
  observations: ObservationRecord[],
  chartDays: number,
  today = new Date(),
): UploadChart {
  const todayStart = getDayStart(today);
  const dayEntries = Array.from({ length: chartDays }, (_, index) => {
    const day = new Date(todayStart);
    day.setDate(todayStart.getDate() - (chartDays - 1 - index));
    return {
      day,
      key: dayKey(day),
      count: 0,
    };
  });
  const dayMap = new Map(dayEntries.map((entry) => [entry.key, entry]));
  const leftX = CHART_PADDING_HORIZONTAL;
  const rightX = 100 - CHART_PADDING_HORIZONTAL;
  const topY = CHART_PADDING_TOP;
  const bottomY = 100 - CHART_PADDING_BOTTOM;
  const plotWidth = rightX - leftX;
  const plotHeight = bottomY - topY;

  observations.forEach((observation) => {
    const key = dayKey(getCreatedTimestamp(observation));
    const entry = dayMap.get(key);
    if (entry) {
      entry.count += 1;
    }
  });

  const counts = dayEntries.map((entry) => entry.count);
  const maxCount = Math.max(1, ...counts);
  const totalPeriodUploads = counts.reduce((sum, value) => sum + value, 0);
  const points = dayEntries.map((entry, index) => {
    const progress =
      dayEntries.length > 1 ? index / (dayEntries.length - 1) : 0;
    const x = leftX + progress * plotWidth;
    const y = bottomY - (entry.count / maxCount) * plotHeight;

    return {
      x,
      y,
      count: entry.count,
      label: `${entry.day.toLocaleDateString()} (${entry.count})`,
      markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
    };
  });

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ');

  const areaPath = points.length
    ? `M ${points[0].x.toFixed(2)} ${bottomY.toFixed(2)} ${points
        .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(
          ' ',
        )} L ${points[points.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} Z`
    : '';

  const ticks: UploadChartTick[] = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: bottomY - ratio * plotHeight,
    label: Math.round(maxCount * ratio),
  }));

  return {
    points,
    linePath,
    areaPath,
    ticks,
    startLabel: dayEntries[0]?.day.toLocaleDateString() ?? '',
    endLabel: dayEntries[dayEntries.length - 1]?.day.toLocaleDateString() ?? '',
    totalPeriodUploads,
  };
}
