import { Injectable } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { LatLong } from '@core/models/location';
import {
  AlgaeLevel,
  ObservationType,
} from '@core/services/observation-api/observation-api.service';
import { ObservationForm } from './observation-form.types';

@Injectable({ providedIn: 'root' })
export class ObservationFormBuilderService {
  public constructor(private readonly formBuilder: FormBuilder) {}

  public createForm(): FormGroup<ObservationForm> {
    return this.formBuilder.group({
      location: this.formBuilder.control<LatLong | null>(
        null,
        Validators.required,
      ),
      observationType: this.formBuilder.control<ObservationType | null>(
        null,
        Validators.required,
      ),
      photo: this.formBuilder.control<File | null>(null),
      airTemp: this.formBuilder.control<number | null>(null),
      waterTemp: this.formBuilder.control<number | null>(null),
      depthOfView: this.formBuilder.control<number | null>(null),
      algaeLevel: this.formBuilder.control<AlgaeLevel | null>(null),
      waterPh: this.formBuilder.control<number | null>(null),
      turbidity: this.formBuilder.control<number | null>(null),
      dissolvedOxygen: this.formBuilder.control<number | null>(null),
      nitrate: this.formBuilder.control<number | null>(null),
      phosphate: this.formBuilder.control<number | null>(null),
      identificationCode: this.formBuilder.control<string | null>(
        null,
        Validators.required,
      ),
      termsAccepted: new FormControl(false, {
        nonNullable: true,
        validators: [Validators.requiredTrue],
      }),
      cc0Accepted: new FormControl(false, {
        nonNullable: true,
        validators: [Validators.requiredTrue],
      }),
    });
  }
}
