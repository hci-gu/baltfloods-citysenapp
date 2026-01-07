import { Component } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { LatLong } from '@core/models/location';
import {
  AlgaeLevel,
  ObservationApiService,
  ObservationType,
} from '@core/services/observation-api/observation-api.service';
import { StepsComponent } from '@shared/components/steps/steps.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { FeedbackLocationComponent } from '../../../feedback/components/feedback-form/feedback-location/feedback-location.component';
import { ObservationFormStep } from './observation-form-step.enum';

interface ObservationForm {
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

@Component({
  selector: 'app-observation-form',
  templateUrl: './observation-form.component.html',
  styleUrls: ['./observation-form.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    StepsComponent,
    IconComponent,
    Button,
    Checkbox,
    InputText,
    FeedbackLocationComponent,
  ],
})
export class ObservationFormComponent {
  public STEP = ObservationFormStep;
  public currentStep = ObservationFormStep.LOCATION;
  public amountOfSteps = Object.keys(ObservationFormStep).length / 2;

  public observationForm: FormGroup<ObservationForm> = this.formBuilder.group({
    location: this.formBuilder.control<LatLong | null>(null, Validators.required),
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

  public photoName: string | null = null;
  public isSubmitting = false;
  public submissionErrorKey: string | null = null;

  public constructor(
    private readonly formBuilder: FormBuilder,
    private readonly observationApi: ObservationApiService,
    private readonly router: Router,
  ) {}

  public get isNextEnabled(): boolean {
    switch (this.currentStep) {
      case ObservationFormStep.LOCATION:
        return this.observationForm.controls.location.valid;
      case ObservationFormStep.TYPE_AND_PHOTO:
        return this.observationForm.controls.observationType.valid;
      case ObservationFormStep.TERMS:
        return (
          this.observationForm.controls.identificationCode.valid &&
          this.observationForm.controls.termsAccepted.valid &&
          this.observationForm.controls.cc0Accepted.valid
        );
      default:
        return true;
    }
  }

  public get nextButtonLabel(): string {
    return this.currentStep === ObservationFormStep.TERMS
      ? 'OBSERVATION.FOOTER.SUBMIT'
      : 'OBSERVATION.FOOTER.NEXT';
  }

  public onClickBack(): void {
    if (this.currentStep > 0) {
      this.currentStep -= 1;
      this.submissionErrorKey = null;
    }
  }

  public onClickNext(): void {
    if (this.currentStep === ObservationFormStep.TERMS) {
      this.submitObservation();
      return;
    }

    if (this.currentStep < this.amountOfSteps - 1) {
      this.currentStep += 1;
      this.submissionErrorKey = null;
    }
  }

  public onPhotoSelected(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    this.photoName = file.name;
    this.observationForm.controls.photo.setValue(file);
    (event.target as HTMLInputElement).value = '';
  }

  public onRemovePhoto(): void {
    this.photoName = null;
    this.observationForm.controls.photo.setValue(null);
  }

  private submitObservation(): void {
    if (this.observationForm.invalid) {
      this.observationForm.markAllAsTouched();
      return;
    }

    const location = this.observationForm.controls.location.value as LatLong;

    this.isSubmitting = true;
    this.submissionErrorKey = null;

    this.observationApi
      .submitWaterObservation({
        location,
        observationType: this.observationForm.controls.observationType
          .value as ObservationType,
        photo: this.observationForm.controls.photo.value,
        airTemp: this.observationForm.controls.airTemp.value,
        waterTemp: this.observationForm.controls.waterTemp.value,
        depthOfView: this.observationForm.controls.depthOfView.value,
        algaeLevel: this.observationForm.controls.algaeLevel.value,
        waterPh: this.observationForm.controls.waterPh.value,
        turbidity: this.observationForm.controls.turbidity.value,
        dissolvedOxygen: this.observationForm.controls.dissolvedOxygen.value,
        nitrate: this.observationForm.controls.nitrate.value,
        phosphate: this.observationForm.controls.phosphate.value,
        identificationCode: this.observationForm.controls.identificationCode
          .value as string,
        termsAccepted: this.observationForm.controls.termsAccepted.value,
        cc0Accepted: this.observationForm.controls.cc0Accepted.value,
      })
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/observation/confirmed']);
        },
        error: () => {
          this.submissionErrorKey = 'OBSERVATION.MESSAGES.SUBMIT_ERROR';
        },
      });
  }
}
