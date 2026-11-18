import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LatLong } from '@core/models/location';
import { AuthService } from '@core/services/auth.service';
import { ObservationApiService } from '@core/services/observation-api/observation-api.service';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import { ScenarioLocationService } from '@core/services/scenario-location.service';
import { ObservationFormBuilderService } from './observation-form-builder.service';
import { ObservationFormComponent } from './observation-form.component';
import { ObservationPhotoService } from './observation-photo.service';

describe('Scenario observation submission', () => {
  const scenario: LatLong = [53.252258, 14.54536];

  beforeEach(() => {
    window.history.replaceState(null, '', '/?lat=53.252258&lon=14.545360');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: { navigate: jest.fn().mockResolvedValue(true) },
        },
        { provide: AuthService, useValue: { token: null } },
        {
          provide: ObservationPhotoService,
          useValue: {
            getCompressedPhoto: (photo: File) => Promise.resolve(photo),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    window.history.replaceState(null, '', '/');
  });

  it.each(['normal', 'quick', 'manually changed'])(
    'uploads the correct location and photo via the %s flow',
    async (flow) => {
      const scenarioService = TestBed.inject(ScenarioLocationService);
      // Internal navigation must not lose the scenario captured on entry.
      window.history.replaceState(null, '', '/observation');
      const draft = TestBed.inject(ObservationDraftService);
      const photo = new File(['test photo'], 'lake.jpg', {
        type: 'image/jpeg',
      });
      if (flow === 'quick') {
        draft.setQuickObservationDraft({
          location: scenarioService.location!,
          observationType: 'water_overflow',
          photo,
        });
      }
      const form = TestBed.runInInjectionContext(
        () =>
          new ObservationFormComponent(
            TestBed.inject(ObservationFormBuilderService),
            TestBed.inject(ObservationApiService),
            TestBed.inject(Router),
            draft,
            TestBed.inject(ObservationPhotoService),
          ),
      );
      expect(form.observationForm.controls.location.value).toEqual(scenario);
      const expected: LatLong =
        flow === 'manually changed' ? [53.252639, 14.487766] : scenario;
      if (flow === 'manually changed') {
        form.observationForm.controls.location.setValue(expected);
      }
      form.observationForm.patchValue({
        observationType: 'water_overflow',
        photo,
      });
      form.currentStepIndex = form.amountOfSteps - 1;
      form.onClickNext();
      await Promise.resolve();

      const request = TestBed.inject(HttpTestingController).expectOne(
        (req) =>
          req.method === 'POST' && req.url.endsWith('/observation/water'),
      );
      const body = request.request.body as FormData;
      expect(body.get('latitude')).toBe(String(expected[0]));
      expect(body.get('longitude')).toBe(String(expected[1]));
      expect(body.get('photo')).toBe(photo);
      request.flush({ id: 'test-observation' });
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
        ['/observation/confirmed'],
        { queryParamsHandling: 'preserve' },
      );
    },
  );
});
