import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { CoreModule } from '../core.module';
import { AuthService } from './auth.service';
import { ObservationRecordsService } from './observation-records.service';

describe('ObservationRecordsService', () => {
  let shallow: Shallow<ObservationRecordsService>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-14T12:00:00Z'));

    shallow = new Shallow(ObservationRecordsService, CoreModule)
      .mock(AuthService, { token: null })
      .mock(HttpClient, {
        get: jest.fn().mockReturnValue(
          of({
            items: [],
            page: 1,
            perPage: 500,
            totalItems: 0,
            totalPages: 1,
          }),
        ),
      });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should sort observations by arrival time', async () => {
    const { instance, inject } = shallow.createService();

    await firstValueFrom(instance.listObservations(1, 50));

    const httpClient = inject(HttpClient);
    expect(httpClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/collections/observations/records'),
      expect.objectContaining({
        params: expect.objectContaining({
          sort: '-created',
        }),
      }),
    );
  });

  it('should use the real arrival timestamp when loading recent observations', async () => {
    const { instance, inject } = shallow.createService();
    const expectedCutoffDate = new Date('2026-04-14T12:00:00Z');
    expectedCutoffDate.setDate(expectedCutoffDate.getDate() - 30);
    const expectedCutoff = expectedCutoffDate.toISOString().replace('T', ' ');

    await firstValueFrom(instance.listRecentObservations(30));

    const httpClient = inject(HttpClient);
    expect(httpClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/collections/observations/records'),
      expect.objectContaining({
        params: expect.objectContaining({
          filter: `created >= "${expectedCutoff}"`,
          sort: '-created',
        }),
      }),
    );
  });
});
