import { TestBed } from '@angular/core/testing';
import { ObservationFormBuilderService } from './observation-form-builder.service';
import { ObservationFormStep } from './observation-form-step.enum';
import {
  applyObservationStepFlow,
  getCurrentObservationStep,
  getNextButtonLabel,
  isNextEnabled,
} from './observation-step-flow';

describe('observation step flow', () => {
  let formBuilder: ObservationFormBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    formBuilder = TestBed.inject(ObservationFormBuilderService);
  });

  it('should resolve current step and next button labels', () => {
    expect(getCurrentObservationStep([], 2)).toBe(ObservationFormStep.LOCATION);
    expect(getNextButtonLabel(0, 2)).toBe('OBSERVATION.FOOTER.NEXT');
    expect(getNextButtonLabel(1, 2)).toBe('OBSERVATION.FOOTER.SUBMIT');
  });

  it('should require location on the location step', () => {
    const form = formBuilder.createForm();

    expect(isNextEnabled(form, ObservationFormStep.LOCATION)).toBe(false);

    form.controls.location.setValue([57.7, 11.9]);

    expect(isNextEnabled(form, ObservationFormStep.LOCATION)).toBe(true);
  });

  it('should switch overflow observations to the short flow and require photo', () => {
    const form = formBuilder.createForm();
    form.patchValue({
      observationType: 'water_overflow',
      airTemp: 10,
      identificationCode: 'ABC',
      termsAccepted: true,
      cc0Accepted: true,
    });

    const flow = applyObservationStepFlow(form);

    expect(flow).toEqual([
      ObservationFormStep.LOCATION,
      ObservationFormStep.TYPE_AND_PHOTO,
    ]);
    expect(form.controls.photo.valid).toBe(false);
    expect(form.controls.airTemp.value).toBeNull();
    expect(form.controls.identificationCode.value).toBeNull();
    expect(form.controls.termsAccepted.value).toBe(false);
    expect(form.controls.cc0Accepted.value).toBe(false);
  });
});
