import { DashboardTimelineService } from './dashboard-timeline.service';
import {
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { sensorKey } from '@core/models/sensor';
import {
  DataPointsApi,
  SensorHistoryPoint,
} from '@core/services/datapoints-api/datapoints-api.service';
import { Subject, of } from 'rxjs';
import { DashboardSensorHistoryService } from './dashboard-sensor-history.service';
import { DashboardSensorWarningsService } from './dashboard-sensor-warnings.service';

const clock = new Date('2020-01-01T12:00:00Z').getTime();
const point: WeatherStormWaterDataPoint = {
  type: DataPointType.STORM_WATER,
  quality: DataPointQuality.DEFAULT,
  name: 'Simulation',
  location: [0, 0],
  simulated: true,
  data: { waterLevel: 3.2 },
  historySeries: {
    provider: 'pocketbase',
    seriesId: 'floodsensor0001',
    revision: 2,
    effectiveTimeMs: clock,
    unitLabel: 'm (local reference)',
  },
  sensorThresholds: {
    unitLabel: 'm (local reference)',
    warningMaxAgeHours: 12,
    bands: [
      { id: 'watch', value: 1.5, severity: 'yellow' },
      { id: 'warning', value: 2, severity: 'orange' },
      { id: 'peak', value: 2.8, severity: 'red' },
    ],
  },
};
const bounds = {
  startMs: clock - 86400000,
  endMs: clock + 86400000,
  durationMs: 2 * 86400000,
};

describe('Owned sensor history and warnings', () => {
  it('preserves the latest baseline reading when charts aggregate daily peaks', () => {
    const latest = { timestamp: new Date(clock), value: 1 };
    const earlier = { timestamp: new Date(clock - 3600000), value: 1.1 };
    const timeline = new DashboardTimelineService().buildSensorValueTimeline(
      [earlier, latest],
      'm',
      {
        startMs: clock - 90 * 86400000,
        endMs: clock,
        durationMs: 90 * 86400000,
      },
      point.sensorThresholds!,
    );
    expect(timeline.points.at(-1)).toMatchObject(latest);
    expect(timeline.points.map((p) => p.value)).toEqual([1.1, 1]);
  });
  it('uses the sensor clock for alarms and clears them after recovery without changing real time', () => {
    const realNow = Date.now();
    const history = new DashboardSensorHistoryService({} as DataPointsApi);
    const warnings = new DashboardSensorWarningsService(history);
    const readings = [{ timestamp: new Date(clock), value: 3.2 }];
    const warning = warnings.buildSensorWarningMessage(point, readings, bounds);
    expect(warning?.title).toBe('Simulated flood warning');
    expect(warning?.content).toContain('not a real flood alert');
    const recovered = {
      ...point,
      data: { waterLevel: 1 },
      historySeries: {
        ...point.historySeries!,
        revision: 3,
        effectiveTimeMs: clock + 54 * 3600000,
      },
    };
    expect(
      warnings.buildSensorWarningMessage(recovered, readings, bounds),
    ).toBeNull();
    expect(
      warnings.getActiveSensorThresholdSeverity(recovered, bounds, {}),
    ).toBeNull();
    expect(Date.now()).toBeGreaterThanOrEqual(realNow);
  });

  it('isolates providers and revisions and cancels stale chart responses on a stage change', () => {
    const pending = new Subject<SensorHistoryPoint[]>();
    const getStormWaterHistory = jest.fn().mockReturnValue(pending);
    const history = new DashboardSensorHistoryService({
      getStormWaterHistory,
    } as unknown as DataPointsApi);
    const received = jest.fn();
    history.loadSensorHistory(point, bounds).subscribe(received);
    history.clear();
    pending.next([{ timestamp: new Date(clock), value: 3.2 }]);
    pending.complete();
    expect(received).not.toHaveBeenCalled();
    expect(history.sensorHistoryCache()).toEqual({});
    getStormWaterHistory.mockReturnValue(
      of([{ timestamp: new Date(clock), value: 1 }]),
    );
    const newer = {
      ...point,
      historySeries: { ...point.historySeries!, revision: 3 },
    };
    history.loadSensorHistory(newer, bounds).subscribe();
    history
      .loadSensorHistory(
        {
          ...newer,
          historySeries: { ...newer.historySeries, provider: 'intoto' },
        },
        bounds,
      )
      .subscribe();
    expect(getStormWaterHistory).toHaveBeenCalledTimes(3);
    expect(
      Object.values(history.sensorHistoryCache()).map(
        (entry) => entry.seriesId,
      ),
    ).toEqual([sensorKey(newer), 'intoto:floodsensor0001:3']);
  });
});
