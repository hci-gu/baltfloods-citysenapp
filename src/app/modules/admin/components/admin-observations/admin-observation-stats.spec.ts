import { ObservationRecord } from '@core/services/observation-records.service';
import {
  buildAdminStats,
  buildObservationFeed,
  getCreatedTimestamp,
  getObservationTypeLabel,
} from './admin-observation-stats';

describe('admin observation stats', () => {
  const today = new Date('2026-04-12T12:00:00Z');

  it('should map observation type labels', () => {
    expect(getObservationTypeLabel({ id: '1', type: 'storm_water' })).toEqual(
      'Storm water',
    );
    expect(
      getObservationTypeLabel({
        id: '2',
        type: 'waterbag_testkit',
        data: { observationType: 'water_system' },
      }),
    ).toEqual('Water system');
    expect(
      getObservationTypeLabel({ id: '3', type: 'water_overflow' }),
    ).toEqual('Water overflow');
  });

  it('should prefer created timestamps over data timestamps', () => {
    expect(
      getCreatedTimestamp({
        id: '1',
        created: '2026-04-12T10:00:00Z',
        dataRetrievedTimestamp: 100,
      }),
    ).toEqual(new Date('2026-04-12T10:00:00Z'));
  });

  it('should build a sorted feed with image URLs', () => {
    const records: ObservationRecord[] = [
      {
        id: 'older',
        type: 'water_overflow',
        visible: false,
        created: '2026-04-11T10:00:00Z',
        imageUrl: 'older.jpg',
      },
      {
        id: 'newer',
        name: ' New upload ',
        type: 'storm_water',
        visible: true,
        created: '2026-04-12T10:00:00Z',
        imageUrl: 'newer.jpg',
      },
    ];

    expect(
      buildObservationFeed(records, (record) => `/images/${record.imageUrl}`),
    ).toEqual([
      expect.objectContaining({
        id: 'newer',
        name: 'New upload',
        type: 'Storm water',
        visible: true,
        imageUrl: '/images/newer.jpg',
      }),
      expect.objectContaining({
        id: 'older',
        name: 'older',
        type: 'Water overflow',
        visible: false,
        imageUrl: '/images/older.jpg',
      }),
    ]);
  });

  it('should build totals, today counts, latest upload, and type breakdown', () => {
    const recent: ObservationRecord[] = [
      {
        id: 'today-1',
        type: 'storm_water',
        created: '2026-04-12T10:00:00Z',
      },
      {
        id: 'today-2',
        type: 'storm_water',
        created: '2026-04-12T11:00:00Z',
      },
      {
        id: 'yesterday',
        type: 'water_overflow',
        created: '2026-04-11T12:00:00Z',
      },
    ];

    expect(buildAdminStats(recent, recent[1], 12, today)).toEqual({
      totalUploads: 12,
      uploadsToday: 2,
      latestUpload: {
        id: 'today-2',
        type: 'Storm water',
        timestamp: new Date('2026-04-12T11:00:00Z'),
      },
      typeBreakdownToday: [{ type: 'Storm water', count: 2 }],
    });
  });
});
