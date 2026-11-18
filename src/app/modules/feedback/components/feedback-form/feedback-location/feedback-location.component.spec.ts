import { AppSettingsService } from '@core/services/app-settings.service';
import { FormControl } from '@angular/forms';
import { LatLong } from '@core/models/location';
import { LocationService, UserLocation } from '@core/services/location.service';
import { NavigationHeaderService } from '@shared/components/navigation/navigation-header/navigation-header.service';
import { firstValueFrom, of, take } from 'rxjs';
import { Shallow } from 'shallow-render';
import { FeedbackLocationComponent } from './feedback-location.component';
import { SharedModule } from 'primeng/api';

describe('FeedbackLocationComponent', () => {
  let shallow: Shallow<FeedbackLocationComponent>;

  beforeEach(() => {
    shallow = new Shallow(FeedbackLocationComponent)
      .mock(AppSettingsService, { origin: [59.4377, 24.733] })
      .mock(LocationService, {
        userLocation$: of({
          loading: false,
          available: true,
          location: [52, 52],
        } as UserLocation),
      })
      .provideMock(SharedModule)
      .mock(NavigationHeaderService, { setSkip: jest.fn() });
  });

  describe('select location', () => {
    it('centres the map on a prefilled scenario and allows a different position', async () => {
      const scenario: LatLong = [53.252258, 14.54536];
      const locationFormControl = new FormControl<LatLong | null>(scenario);
      const { instance } = await shallow.render(
        '<app-feedback-location [locationFormControl]="locationFormControl"></app-feedback-location>',
        { bind: { locationFormControl } },
      );
      expect(await firstValueFrom(instance.mapCenter$)).toEqual(scenario);
      const selected: LatLong = [53.252639, 14.487766];
      instance.onClickMap(selected);
      expect(locationFormControl.value).toEqual(selected);
      expect(await firstValueFrom(instance.mapCenter$)).toEqual(selected);
    });

    it('should update the center of the map and form control value', async () => {
      const locationFormControl = new FormControl();

      const { instance } = await shallow.render(
        '<app-feedback-location [locationFormControl]="locationFormControl"></app-feedback-location>',
        {
          bind: { locationFormControl },
        },
      );

      const latLong: LatLong = [0, 2];
      locationFormControl.setValue(latLong);

      expect(locationFormControl.value).toEqual(latLong);
      instance.mapCenter$
        .pipe(take(1))
        .subscribe((result) => expect(result === latLong));
    });
  });
});
