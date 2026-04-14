import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { CoreModule } from '../core.module';
import { AuthService } from './auth.service';
import { DemoTimeService } from './demo-time.service';
import { ObservationRecordsService } from './observation-records.service';

describe('ObservationRecordsService', () => {
  let shallow: Shallow<ObservationRecordsService>;

  beforeEach(() => {
    shallow = new Shallow(ObservationRecordsService, CoreModule)
      .mock(AuthService, { token: null })
      .mock(DemoTimeService, {
        now: jest.fn(() => new Date('2026-04-14T12:00:00Z')),
      })
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

  it('should use the fake current time when loading recent observations', async () => {
    const { instance, inject } = shallow.createService();
    const expectedCutoffDate = new Date('2026-04-14T12:00:00Z');
    expectedCutoffDate.setDate(expectedCutoffDate.getDate() - 30);
    const expectedCutoffTimestamp = Math.floor(
      expectedCutoffDate.getTime() / 1000,
    );

    await firstValueFrom(instance.listRecentObservations(30));

    const httpClient = inject(HttpClient);
    expect(httpClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/collections/observations/records'),
      expect.objectContaining({
        params: expect.objectContaining({
          filter: `dataRetrievedTimestamp >= ${expectedCutoffTimestamp}`,
        }),
      }),
    );
  });
});
