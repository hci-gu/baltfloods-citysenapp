import { FormGroup, Validators } from '@angular/forms';
import { ObservationFormStep } from './observation-form-step.enum';
import {
  FULL_OBSERVATION_STEP_FLOW,
  OVERFLOW_OBSERVATION_STEP_FLOW,
  ObservationForm,
} from './observation-form.types';

export function getCurrentObservationStep(
  stepFlow: ObservationFormStep[],
  currentStepIndex: number,
): ObservationFormStep {
  return stepFlow[currentStepIndex] ?? ObservationFormStep.LOCATION;
}

export function isWaterOverflowSelected(
  form: FormGroup<ObservationForm>,
): boolean {
  return form.controls.observationType.value === 'water_overflow';
}

export function isNextEnabled(
  form: FormGroup<ObservationForm>,
  currentStep: ObservationFormStep,
): boolean {
  switch (currentStep) {
    case ObservationFormStep.LOCATION:
      return form.controls.location.valid;
    case ObservationFormStep.TYPE_AND_PHOTO:
      return form.controls.observationType.valid && form.controls.photo.valid;
    case ObservationFormStep.TERMS:
      return (
        form.controls.identificationCode.valid &&
        form.controls.termsAccepted.valid &&
        form.controls.cc0Accepted.valid
      );
    default:
      return true;
  }
}

export function getNextButtonLabel(
  currentStepIndex: number,
  amountOfSteps: number,
): string {
  return currentStepIndex === amountOfSteps - 1
    ? 'OBSERVATION.FOOTER.SUBMIT'
    : 'OBSERVATION.FOOTER.NEXT';
}

export function applyObservationStepFlow(
  form: FormGroup<ObservationForm>,
): ObservationFormStep[] {
  if (isWaterOverflowSelected(form)) {
    form.controls.photo.setValidators([Validators.required]);
    form.controls.identificationCode.clearValidators();
    form.controls.termsAccepted.clearValidators();
    form.controls.cc0Accepted.clearValidators();

    clearFullObservationFields(form);
    updateFlowValidators(form);
    return [...OVERFLOW_OBSERVATION_STEP_FLOW];
  }

  form.controls.photo.clearValidators();
  form.controls.identificationCode.setValidators([Validators.required]);
  form.controls.termsAccepted.setValidators([Validators.requiredTrue]);
  form.controls.cc0Accepted.setValidators([Validators.requiredTrue]);

  updateFlowValidators(form);
  return [...FULL_OBSERVATION_STEP_FLOW];
}

function clearFullObservationFields(form: FormGroup<ObservationForm>): void {
  form.controls.airTemp.setValue(null, { emitEvent: false });
  form.controls.waterTemp.setValue(null, { emitEvent: false });
  form.controls.depthOfView.setValue(null, { emitEvent: false });
  form.controls.algaeLevel.setValue(null, { emitEvent: false });
  form.controls.waterPh.setValue(null, { emitEvent: false });
  form.controls.turbidity.setValue(null, { emitEvent: false });
  form.controls.dissolvedOxygen.setValue(null, { emitEvent: false });
  form.controls.nitrate.setValue(null, { emitEvent: false });
  form.controls.phosphate.setValue(null, { emitEvent: false });
  form.controls.identificationCode.setValue(null, { emitEvent: false });
  form.controls.termsAccepted.setValue(false, { emitEvent: false });
  form.controls.cc0Accepted.setValue(false, { emitEvent: false });
}

function updateFlowValidators(form: FormGroup<ObservationForm>): void {
  form.controls.photo.updateValueAndValidity({ emitEvent: false });
  form.controls.identificationCode.updateValueAndValidity({ emitEvent: false });
  form.controls.termsAccepted.updateValueAndValidity({ emitEvent: false });
  form.controls.cc0Accepted.updateValueAndValidity({ emitEvent: false });
}
