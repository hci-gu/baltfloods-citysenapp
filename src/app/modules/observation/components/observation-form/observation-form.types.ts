import { FormControl } from '@angular/forms';
import { LatLong } from '@core/models/location';
import {
  AlgaeLevel,
  ObservationType,
} from '@core/services/observation-api/observation-api.service';
import { ObservationFormStep } from './observation-form-step.enum';

export interface ObservationForm {
  location: FormControl<LatLong | null>;
  observationType: FormControl<ObservationType | null>;
  photo: FormControl<File | null>;
  airTemp: FormControl<number | null>;
  waterTemp: FormControl<number | null>;
  depthOfView: FormControl<number | null>;
  algaeLevel: FormControl<AlgaeLevel | null>;
  waterPh: FormControl<number | null>;
  turbidity: FormControl<number | null>;
  dissolvedOxygen: FormControl<number | null>;
  nitrate: FormControl<number | null>;
  phosphate: FormControl<number | null>;
  identificationCode: FormControl<string | null>;
  termsAccepted: FormControl<boolean>;
  cc0Accepted: FormControl<boolean>;
}

export const FULL_OBSERVATION_STEP_FLOW: ObservationFormStep[] = [
  ObservationFormStep.LOCATION,
  ObservationFormStep.TYPE_AND_PHOTO,
  ObservationFormStep.TEMPERATURE,
  ObservationFormStep.VISIBILITY_AND_ALGAE,
  ObservationFormStep.WATER_QUALITY,
  ObservationFormStep.TERMS,
];

export const OVERFLOW_OBSERVATION_STEP_FLOW: ObservationFormStep[] = [
  ObservationFormStep.LOCATION,
  ObservationFormStep.TYPE_AND_PHOTO,
];
