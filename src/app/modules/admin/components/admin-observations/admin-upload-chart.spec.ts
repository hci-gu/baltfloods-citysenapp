import { buildUploadChart } from './admin-upload-chart';

describe('admin upload chart', () => {
  it('should build chart paths and count uploads inside the selected window', () => {
    const chart = buildUploadChart(
      [
        {
          id: 'day-1',
          type: 'storm_water',
          created: '2026-04-10T10:00:00Z',
        },
        {
          id: 'day-2-a',
          type: 'water_overflow',
          created: '2026-04-12T10:00:00Z',
        },
        {
          id: 'day-2-b',
          type: 'water_overflow',
          created: '2026-04-12T11:00:00Z',
        },
        {
          id: 'outside-window',
          type: 'water_overflow',
          created: '2026-04-09T11:00:00Z',
        },
      ],
      3,
      new Date('2026-04-12T12:00:00Z'),
    );

    expect(chart.totalPeriodUploads).toBe(3);
    expect(chart.startLabel).toBe(
      new Date('2026-04-10T00:00:00Z').toLocaleDateString(),
    );
    expect(chart.endLabel).toBe(
      new Date('2026-04-12T00:00:00Z').toLocaleDateString(),
    );
    expect(chart.points.map((point) => point.count)).toEqual([1, 0, 2]);
    expect(chart.linePath).toContain('M');
    expect(chart.areaPath).toContain('Z');
    expect(chart.ticks).toHaveLength(5);
  });
});
