import {
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  AppSettings,
  AppSettingsService,
  RESTART_AT_MAP,
} from './app-settings.service';

class FakeEventSource extends EventTarget {
  public static instances: FakeEventSource[] = [];
  public onerror?: () => void;
  public closed = false;
  public constructor(public url: string) {
    super();
    FakeEventSource.instances.push(this);
  }
  public close(): void {
    this.closed = true;
  }
  public emit(name: string, data: unknown): void {
    this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  }
}

const INITIAL: AppSettings = {
  origin: { latitude: 59.4377, longitude: 24.733 },
  revision: 1,
};
const NEXT: AppSettings = {
  origin: { latitude: -33.8688, longitude: 151.2093 },
  revision: 2,
};

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('AppSettingsService', () => {
  let service: AppSettingsService;
  let http: HttpTestingController;
  let restart: jest.Mock;
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    restart = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RESTART_AT_MAP, useValue: restart },
      ],
    });
    service = TestBed.inject(AppSettingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.ngOnDestroy();
    http.verify();
    globalThis.EventSource = originalEventSource;
    jest.useRealTimers();
  });

  async function respond(settings: object = INITIAL): Promise<void> {
    http
      .expectOne((r) =>
        r.url.endsWith('/collections/app_settings/records/appsettings0001'),
      )
      .flush(settings);
    await settle();
  }

  async function connect(
    source = FakeEventSource.instances.at(-1)!,
  ): Promise<void> {
    source.emit('PB_CONNECT', { clientId: 'test-client' });
    const registration = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/realtime'),
    );
    expect(registration.request.body.subscriptions).toEqual([
      'app_settings/appsettings0001',
    ]);
    registration.flush(null);
    await settle();
  }

  it('blocks maps until valid settings load and supports zero coordinates', async () => {
    expect(service.ready()).toBe(false);
    expect(() => service.origin).toThrow();
    void service.load();
    expect(service.loading()).toBe(true);
    await respond({ origin: { latitude: 0, longitude: 0 }, revision: 1 });
    expect(service.ready()).toBe(true);
    expect(service.origin).toEqual([0, 0]);
    expect(service.loading()).toBe(false);
    service.ngOnDestroy();
  });

  it('provides a retry after network failure without using a hardcoded location', async () => {
    void service.load();
    http
      .expectOne((r) => r.method === 'GET')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(service.failed()).toBe(true);
    expect(service.ready()).toBe(false);
    void service.load();
    await respond();
    expect(service.failed()).toBe(false);
    expect(service.origin).toEqual([59.4377, 24.733]);
    service.ngOnDestroy();
  });

  it('rejects malformed coordinates and invalid revisions', async () => {
    for (const settings of [
      { origin: { latitude: 91, longitude: 0 }, revision: 1 },
      { origin: { latitude: 0 }, revision: 1 },
      { origin: { latitude: '0', longitude: 0 }, revision: 1 },
      { ...INITIAL, revision: 0 },
    ]) {
      void service.load();
      await respond(settings);
      expect(service.failed()).toBe(true);
      expect(service.ready()).toBe(false);
    }
  });

  it('restarts exactly once on a realtime reset and keeps duplicate events harmless', async () => {
    void service.load();
    await respond();
    await connect();
    await respond();
    expect(restart).not.toHaveBeenCalled();
    const source = FakeEventSource.instances[0];
    source.emit('app_settings/appsettings0001', {
      action: 'update',
      record: NEXT,
    });
    await respond(NEXT);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
    expect(service.ready()).toBe(false);
    source.emit('app_settings/appsettings0001', { record: NEXT });
    await settle();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('catches a reset between the first GET and realtime subscription', async () => {
    void service.load();
    await respond();
    await connect();
    await respond(NEXT);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('rechecks after a realtime event arrives during an older in-flight read', async () => {
    void service.load();
    await respond();
    void service.load();
    FakeEventSource.instances[0].emit('app_settings/appsettings0001', {
      record: NEXT,
    });
    await respond(INITIAL);
    expect(restart).not.toHaveBeenCalled();
    await respond(NEXT);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('rechecks the revision after reconnecting', async () => {
    void service.load();
    await respond();
    await connect();
    await respond();
    FakeEventSource.instances[0].onerror?.();
    jest.advanceTimersByTime(3000);
    await connect();
    await respond(NEXT);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('detects missed events by polling without discarding a working view during an outage', async () => {
    void service.load();
    await respond();
    jest.advanceTimersByTime(30000);
    http
      .expectOne((r) => r.method === 'GET')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(service.ready()).toBe(true);
    expect(restart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30000);
    await respond(NEXT);
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
