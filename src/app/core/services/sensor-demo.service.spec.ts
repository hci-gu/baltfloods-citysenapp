import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SensorDemoService, SensorDemoState } from './sensor-demo.service';
import { AuthService } from './auth.service';
import { ObservationRealtimeService } from './observation-realtime.service';
import { Subject } from 'rxjs';
import { WeatherStormWaterDataPoint } from '@core/models/data-point';

const baseline: SensorDemoState = {
  settings: { origin: { latitude: 57.7, longitude: 11.97 }, revision: 1 },
  sensor: {
    id: 'floodsensor0001',
    ready: true,
    name: 'Demo water-level sensor',
    latitude: 57.7,
    longitude: 11.97,
    unit: 'm (local reference)',
    placement: { latitude: 57.7, longitude: 11.97 },
    thresholds: {
      unitLabel: 'm',
      warningMaxAgeHours: 12,
      bands: [{ id: 'red', value: 2.8, severity: 'red' }],
    },
  },
  run: { stage: 'normal', cursor: 1000000000, revision: 2, placementError: '' },
  latest: { timestamp: 1000000000, value: 1 },
};

describe('SensorDemoService', () => {
  let http: HttpTestingController;
  let service: SensorDemoService;
  let events: Subject<void>;
  beforeEach(() => {
    jest.useFakeTimers();
    events = new Subject<void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { token: 'admin-token' } },
        {
          provide: ObservationRealtimeService,
          useValue: { sensorChanges$: events },
        },
      ],
    });
    service = TestBed.inject(SensorDemoService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    jest.useRealTimers();
  });

  it('maps the owned sensor and passes its revision to history requests', () => {
    let point!: WeatherStormWaterDataPoint;
    service.getSensors().subscribe((points) => (point = points[0]));
    jest.advanceTimersByTime(0);
    http.expectOne((r) => r.url.endsWith('/demo/state')).flush(baseline);
    expect(point.simulated).toBe(true);
    expect(point.historySeries).toMatchObject({
      provider: 'pocketbase',
      seriesId: 'floodsensor0001',
      effectiveTimeMs: baseline.run.cursor * 1000,
      revision: 2,
    });
    expect(point.sensorThresholds).toEqual(baseline.sensor.thresholds);
    let received: unknown;
    service
      .getHistory(point, new Date(0), new Date(1000))
      .subscribe((rows) => (received = rows));
    const req = http.expectOne((r) => r.url.endsWith('/history'));
    expect(req.request.params.get('revision')).toBe('2');
    req.flush([{ timestamp: 1, value: 1.2 }]);
    expect(received).toEqual([{ timestamp: new Date(1000), value: 1.2 }]);
  });

  it('refreshes across clients, ignores unchanged polls, and recovers after failed requests', () => {
    const changed: SensorDemoState[] = [];
    const sub = service.changes$.subscribe((s) => changed.push(s));
    jest.advanceTimersByTime(0);
    http.expectOne((r) => r.url.endsWith('/demo/state')).flush(baseline);
    events.next();
    http
      .expectOne((r) => r.url.endsWith('/demo/state'))
      .flush({
        ...baseline,
        run: { ...baseline.run, stage: 'peak', revision: 3 },
      });
    expect(changed.map((s) => s.run.stage)).toEqual(['normal', 'peak']);
    jest.advanceTimersByTime(15000);
    http
      .expectOne((r) => r.url.endsWith('/demo/state'))
      .flush(null, { status: 503, statusText: 'Offline' });
    jest.advanceTimersByTime(15000);
    http
      .expectOne((r) => r.url.endsWith('/demo/state'))
      .flush({
        ...baseline,
        run: { ...baseline.run, stage: 'recovery', revision: 4 },
      });
    expect(changed.map((s) => s.run.stage)).toEqual([
      'normal',
      'peak',
      'recovery',
    ]);
    sub.unsubscribe();
  });

  it('authorizes commands and includes both location and run revisions', () => {
    service.action('peak', 2).subscribe();
    const action = http.expectOne((r) => r.url.endsWith('/demo/action'));
    expect(action.request.headers.get('Authorization')).toBe(
      'Bearer admin-token',
    );
    expect(action.request.body).toEqual({ stage: 'peak', revision: 2 });
    action.flush({ ok: true });
    service
      .relocate({ latitude: 0, longitude: 0 }, baseline, {
        latitude: 0.001,
        longitude: 0,
      })
      .subscribe();
    const location = http.expectOne((r) => r.url.endsWith('/demo/location'));
    expect(location.request.body).toMatchObject({
      revision: 1,
      runRevision: 2,
      placement: { latitude: 0.001, longitude: 0 },
    });
    location.flush({ ok: true });
  });
});
