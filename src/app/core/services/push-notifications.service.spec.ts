import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { environment } from '@environments/environment';
import { firstValueFrom, of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { CoreModule } from '../core.module';
import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService', () => {
  let shallow: Shallow<PushNotificationsService>;

  beforeEach(() => {
    const pushSubscription = {
      endpoint: 'https://push.example/subscription-1',
      expirationTime: null,
      options: {},
      getKey: jest.fn(),
      toJSON: jest.fn(),
      unsubscribe: jest.fn(),
    } as unknown as PushSubscription;

    shallow = new Shallow(PushNotificationsService, CoreModule)
      .mock(SwPush, {
        isEnabled: true,
        subscription: of(pushSubscription),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        requestSubscription: jest.fn(),
        messages: of(),
        notificationClicks: of(),
      })
      .mock(HttpClient, {
        post: jest.fn().mockReturnValue(of(undefined)),
      });
  });

  it('should send the push endpoint when unsubscribing', async () => {
    const { instance, inject } = shallow.createService();

    await firstValueFrom(instance.unsubscribe());

    expect(inject(SwPush).unsubscribe).toHaveBeenCalledWith();
    expect(inject(HttpClient).post).toHaveBeenCalledWith(
      `${environment.pushApiUrl}/unsubscribe`,
      { endpoint: 'https://push.example/subscription-1' },
    );
  });
});
