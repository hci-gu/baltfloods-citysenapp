import { Shallow } from 'shallow-render';
import { CoreModule } from '../core.module';
import { firstValueFrom, take, toArray } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { LocationService, UserLocation } from './location.service';

describe('LocationService', () => {
  let shallow: Shallow<LocationService>;

  beforeEach(() => {
    shallow = new Shallow(LocationService, CoreModule).replaceModule(
      HttpClient,
      HttpClientTestingModule,
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    navigator.permissions = {
      query: jest.fn().mockReturnValue(Promise.resolve({ state: 'prompt' })),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('userLocation$', () => {
    describe('on success', () => {
      it('should emit user location and grant permission', async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        navigator.geolocation = {
          getCurrentPosition: (success: any): void => {
            setTimeout(() => {
              success({ coords: { latitude: 10, longitude: 10 } });
            }, 0);
          },
        };
        const { instance } = shallow.createService();

        const userLocationExpectation: UserLocation[] = [
          {
            loading: true,
          },
          {
            loading: false,
            location: [10, 10],
          },
        ];

        const permissionResultPromise = firstValueFrom(
          instance.locationPermissionState$.pipe(take(3), toArray()),
        );
        const userLocationResult = await firstValueFrom(
          instance.userLocation$.pipe(take(2), toArray()),
        );
        expect(userLocationResult).toEqual(userLocationExpectation);

        const permissionExpectation: PermissionState[] = ['prompt', 'prompt', 'granted'];

        const permissionResult = await permissionResultPromise;
        expect(permissionResult).toEqual(permissionExpectation);
      });
    });

    describe('on error', () => {
      it('should set permission state to denied when geolocation permission is denied', async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        navigator.geolocation = {
          getCurrentPosition: (_: any, error: any): void => {
            setTimeout(() => {
              error({
                code: 1,
                PERMISSION_DENIED: 1,
              });
            }, 0);
          },
        };
        const { instance } = shallow.createService();

        const userLocationExpectation: UserLocation[] = [
          {
            loading: true,
          },
          {
            loading: false,
          },
        ];

        const permissionResultPromise = firstValueFrom(
          instance.locationPermissionState$.pipe(take(3), toArray()),
        );
        const userLocationResult = await firstValueFrom(
          instance.userLocation$.pipe(take(2), toArray()),
        );
        expect(userLocationResult).toEqual(userLocationExpectation);

        const permissionExpectation: PermissionState[] = ['prompt', 'prompt', 'denied'];

        const permissionResult = await permissionResultPromise;
        expect(permissionResult).toEqual(permissionExpectation);
      });

      it('should not set permission state to denied for non-permission geolocation errors', async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        navigator.geolocation = {
          getCurrentPosition: (_: any, error: any): void => {
            setTimeout(() => {
              error({
                code: 2,
                PERMISSION_DENIED: 1,
              });
            }, 0);
          },
        };
        const { instance } = shallow.createService();

        const userLocationExpectation: UserLocation[] = [
          {
            loading: true,
          },
          {
            loading: false,
          },
        ];

        const permissionResultPromise = firstValueFrom(
          instance.locationPermissionState$.pipe(take(2), toArray()),
        );
        const userLocationResult = await firstValueFrom(
          instance.userLocation$.pipe(take(2), toArray()),
        );
        expect(userLocationResult).toEqual(userLocationExpectation);

        const permissionExpectation: PermissionState[] = ['prompt', 'prompt'];

        const permissionResult = await permissionResultPromise;
        expect(permissionResult).toEqual(permissionExpectation);
      });
    });

  });
});
