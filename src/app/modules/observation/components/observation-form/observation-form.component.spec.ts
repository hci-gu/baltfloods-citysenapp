import { Router } from '@angular/router';
import { LatLong } from '@core/models/location';
import { ObservationApiService } from '@core/services/observation-api/observation-api.service';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import { TranslatePipe } from '@ngx-translate/core';
import imageCompression from 'browser-image-compression';
import { of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { ObservationFormComponent } from './observation-form.component';
import { ObservationFormStep } from './observation-form-step.enum';

jest.mock('browser-image-compression', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __esModule: true,
  default: jest.fn((file) => Promise.resolve(file)),
}));

describe('ObservationFormComponent', () => {
  let shallow: Shallow<ObservationFormComponent>;

  beforeEach(() => {
    shallow = new Shallow(ObservationFormComponent)
      .mock(ObservationApiService, {
        submitWaterObservation: jest.fn().mockReturnValue(of({ id: '1' })),
      })
      .mock(Router, { navigate: jest.fn().mockResolvedValue(true) })
      .mock(ObservationDraftService, {
        consumeQuickObservationDraft: jest.fn().mockReturnValue(null),
      })
      .mockPipe(TranslatePipe, (input) => input);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should start on the location step without a quick draft', async () => {
    const { instance } = await shallow.render();

    expect(instance.currentStep).toBe(ObservationFormStep.LOCATION);
    expect(instance.observationForm.controls.observationType.value).toBeNull();
  });

  it('should submit a quick water overflow observation from the details step', async () => {
    const location = [57.7089, 11.9746] as LatLong;
    const photo = new File(['photo'], 'overflow.jpg', {
      type: 'image/jpeg',
    });

    const compressedPhoto = new File(['compressed'], 'compressed.jpg', {
      type: 'image/jpeg',
    });
    (imageCompression as unknown as jest.Mock).mockResolvedValueOnce(
      compressedPhoto,
    );

    const { find, inject, instance, fixture } = await shallow
      .mock(ObservationDraftService, {
        consumeQuickObservationDraft: jest.fn().mockReturnValue({
          location,
          observationType: 'water_overflow',
          photo,
        }),
      })
      .render();

    expect(instance.currentStep).toBe(ObservationFormStep.TYPE_AND_PHOTO);
    expect(instance.amountOfSteps).toBe(2);
    expect(instance.observationForm.controls.location.value).toEqual(location);
    expect(instance.observationForm.controls.observationType.value).toBe(
      'water_overflow',
    );
    expect(instance.observationForm.controls.photo.value).toBe(photo);
    expect(instance.photoName).toBe('overflow.jpg');
    expect(instance.isNextEnabled).toBe(true);

    find('p-button.next-button').triggerEventHandler('click', {});
    await flushPromises();
    await fixture.whenStable();

    expect(imageCompression).toHaveBeenCalledWith(
      photo,
      expect.objectContaining({
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      }),
    );

    expect(
      inject(ObservationApiService).submitWaterObservation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        location,
        observationType: 'water_overflow',
        photo: expect.objectContaining({
          name: 'overflow.jpg',
          size: compressedPhoto.size,
          type: 'image/jpeg',
        }),
        identificationCode: undefined,
        termsAccepted: undefined,
        cc0Accepted: undefined,
      }),
    );
    expect(inject(Router).navigate).toHaveBeenCalledWith(
      ['/observation/confirmed'],
      { queryParamsHandling: 'preserve' },
    );
  });

});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
