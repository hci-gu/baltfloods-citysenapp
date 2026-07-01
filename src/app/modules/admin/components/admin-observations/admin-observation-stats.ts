import { ObservationRecord } from '@core/services/observation-records.service';

export interface ObservationFeedItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  createdOn?: Date;
  imageUrl?: string;
}

export interface TypeCountItem {
  type: string;
  count: number;
}

export interface AdminStats {
  totalUploads: number;
  uploadsToday: number;
  latestUpload: {
    id: string;
    type: string;
    timestamp: Date;
  } | null;
  typeBreakdownToday: TypeCountItem[];
}

export function buildObservationFeed(
  observations: ObservationRecord[],
  getObservationImageUrl: (
    observation: ObservationRecord,
  ) => string | undefined,
): ObservationFeedItem[] {
  return observations
    .slice()
    .sort(
      (a, b) =>
        getCreatedTimestamp(b).getTime() - getCreatedTimestamp(a).getTime(),
    )
    .map((observation) => ({
      id: observation.id,
      name: observation.name?.trim() || observation.id,
      type: getObservationTypeLabel(observation),
      visible: observation.visible ?? false,
      createdOn: getCreatedTimestamp(observation),
      imageUrl: getObservationImageUrl(observation),
    }));
}

export function buildAdminStats(
  recentObservations: ObservationRecord[],
  latestUpload: ObservationRecord | null,
  totalUploads: number,
  now = new Date(),
): AdminStats {
  const todayStart = getDayStart(now);
  const todayItems = recentObservations.filter(
    (observation) =>
      getCreatedTimestamp(observation).getTime() >= todayStart.getTime(),
  );

  return {
    totalUploads,
    uploadsToday: todayItems.length,
    latestUpload: latestUpload
      ? {
          id: latestUpload.id,
          type: getObservationTypeLabel(latestUpload),
          timestamp: getCreatedTimestamp(latestUpload),
        }
      : null,
    typeBreakdownToday: toTypeBreakdown(todayItems),
  };
}

export function getObservationTypeLabel(
  observation: ObservationRecord,
): string {
  const recordType = observation.type ?? '';
  const observationType = observation.data?.['observationType'];

  if (recordType === 'storm_water') {
    return 'Storm water';
  }

  if (recordType === 'waterbag_testkit') {
    if (observationType === 'stormwater') {
      return 'Storm water';
    }
    if (observationType === 'water_system') {
      return 'Water system';
    }
    return 'Water observations';
  }

  if (recordType === 'water_overflow') {
    return 'Water overflow';
  }

  return recordType || 'Observation';
}

export function getCreatedTimestamp(observation: ObservationRecord): Date {
  if (observation.created) {
    const parsed = new Date(observation.created);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return getTimestamp(observation);
}

export function getDayStart(date: Date): Date {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimestamp(observation: ObservationRecord): Date {
  const raw = observation.dataRetrievedTimestamp;
  if (typeof raw === 'number') {
    return new Date(raw * 1000);
  }
  if (typeof raw === 'string') {
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return new Date(numeric * 1000);
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (observation.created) {
    const parsed = new Date(observation.created);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(0);
}

function toTypeBreakdown(observations: ObservationRecord[]): TypeCountItem[] {
  const counts = new Map<string, number>();

  observations.forEach((observation) => {
    const type = getObservationTypeLabel(observation);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
