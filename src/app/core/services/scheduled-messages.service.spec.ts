import { HttpClientModule } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { CoreModule } from '@core/core.module';
import { environment } from '@environments/environment';
import { firstValueFrom } from 'rxjs';
import { Shallow } from 'shallow-render';
import {
  ScheduledMessage,
  ScheduledMessagesService,
} from './scheduled-messages.service';

describe('ScheduledMessagesService', () => {
  let shallow: Shallow<ScheduledMessagesService>;

  beforeEach(() => {
    shallow = new Shallow(ScheduledMessagesService, CoreModule)
      .import(HttpClientTestingModule)
      .dontMock(HttpClientTestingModule)
      .replaceModule(HttpClientModule, HttpClientTestingModule);
  });

  it('should request active messages', async () => {
    const { instance, inject } = shallow.createService();
    const httpTestingController = inject(HttpTestingController);

    const requestPromise = firstValueFrom(instance.getActiveMessages());

    const req = httpTestingController.expectOne(
      `${environment.scheduledMessagesApiUrl}/active`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_ACTIVE_MESSAGES);

    expect(await requestPromise).toEqual(MOCK_ACTIVE_MESSAGES);
  });

  it('should return an empty array when the request fails', async () => {
    const { instance, inject } = shallow.createService();
    const httpTestingController = inject(HttpTestingController);

    const requestPromise = firstValueFrom(instance.getActiveMessages());

    const req = httpTestingController.expectOne(
      `${environment.scheduledMessagesApiUrl}/active`,
    );
    req.flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(await requestPromise).toEqual([]);
  });
});

const MOCK_ACTIVE_MESSAGES: ScheduledMessage[] = [
  {
    id: 'scheduled-message-1',
    title: 'Maintenance',
    content: '<p>Map updates are in progress.</p>',
    start: '2026-02-25 08:00:00.000Z',
    end: '2026-02-25 12:00:00.000Z',
  },
];
