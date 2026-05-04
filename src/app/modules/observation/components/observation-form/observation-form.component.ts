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
import imageCompression, { Options } from 'browser-image-compression';
import { LatLong } from '@core/models/location';
import {
  AlgaeLevel,
  ObservationApiService,
  ObservationType,
} from '@core/services/observation-api/observation-api.service';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import { LocationService } from '@core/services/location.service';
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

const OBSERVATION_PHOTO_COMPRESSION_OPTIONS: Options = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

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
  private readonly overrideLocationJitterMaxMeters = 5;
  private readonly metersPerDegreeLatitude = 111_320;
  public STEP = ObservationFormStep;
  private readonly fullStepFlow: ObservationFormStep[] = [
    ObservationFormStep.LOCATION,
    ObservationFormStep.TYPE_AND_PHOTO,
    ObservationFormStep.TEMPERATURE,
    ObservationFormStep.VISIBILITY_AND_ALGAE,
    ObservationFormStep.WATER_QUALITY,
    ObservationFormStep.TERMS,
  ];
  private readonly overflowStepFlow: ObservationFormStep[] = [
    ObservationFormStep.LOCATION,
    ObservationFormStep.TYPE_AND_PHOTO,
  ];
  public currentStepIndex = 0;
  public observationStepFlow = [...this.fullStepFlow];

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
    private readonly observationDraftService: ObservationDraftService,
    private readonly locationService: LocationService,
  ) {
    this.applyQuickObservationDraft();
    this.observationForm.controls.observationType.valueChanges.subscribe(() => {
      this.updateFlowAndValidation();
    });
    this.updateFlowAndValidation();
  }

  public get currentStep(): ObservationFormStep {
    return this.observationStepFlow[this.currentStepIndex] ?? ObservationFormStep.LOCATION;
  }

  public get amountOfSteps(): number {
    return this.observationStepFlow.length;
  }

  public get isWaterOverflowSelected(): boolean {
    return this.observationForm.controls.observationType.value === 'water_overflow';
  }

  public get isNextEnabled(): boolean {
    switch (this.currentStep) {
      case ObservationFormStep.LOCATION:
        return this.observationForm.controls.location.valid;
      case ObservationFormStep.TYPE_AND_PHOTO:
        return (
          this.observationForm.controls.observationType.valid &&
          this.observationForm.controls.photo.valid
        );
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
    return this.currentStepIndex === this.amountOfSteps - 1
      ? 'OBSERVATION.FOOTER.SUBMIT'
      : 'OBSERVATION.FOOTER.NEXT';
  }

  public onClickBack(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex -= 1;
      this.submissionErrorKey = null;
    }
  }

  public onClickNext(): void {
    if (this.currentStepIndex === this.amountOfSteps - 1) {
      this.submitObservation();
      return;
    }

    if (this.currentStepIndex < this.amountOfSteps - 1) {
      this.currentStepIndex += 1;
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

  private applyQuickObservationDraft(): void {
    const draft = this.observationDraftService.consumeQuickObservationDraft();
    if (!draft) {
      return;
    }

    this.observationForm.patchValue({
      location: draft.location,
      observationType: draft.observationType,
      photo: draft.photo,
    });
    this.photoName = draft.photo.name;
    this.currentStepIndex = this.fullStepFlow.indexOf(
      ObservationFormStep.TYPE_AND_PHOTO,
    );
  }

  private submitObservation(): void {
    if (this.observationForm.invalid) {
      this.observationForm.markAllAsTouched();
      return;
    }

    void this.submitCompressedObservation();
  }

  private async submitCompressedObservation(): Promise<void> {
    const location = this.getSubmissionLocation(
      this.observationForm.controls.location.value as LatLong,
    );

    this.isSubmitting = true;
    this.submissionErrorKey = null;

    const photo = await this.getCompressedPhoto(
      this.observationForm.controls.photo.value,
    );

    this.observationApi
      .submitWaterObservation({
        location,
        observationType: this.observationForm.controls.observationType
          .value as ObservationType,
        photo,
        airTemp: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.airTemp.value,
        waterTemp: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.waterTemp.value,
        depthOfView: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.depthOfView.value,
        algaeLevel: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.algaeLevel.value,
        waterPh: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.waterPh.value,
        turbidity: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.turbidity.value,
        dissolvedOxygen: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.dissolvedOxygen.value,
        nitrate: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.nitrate.value,
        phosphate: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.phosphate.value,
        identificationCode: this.isWaterOverflowSelected
          ? undefined
          : (this.observationForm.controls.identificationCode.value ?? undefined),
        termsAccepted: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.termsAccepted.value,
        cc0Accepted: this.isWaterOverflowSelected
          ? undefined
          : this.observationForm.controls.cc0Accepted.value,
      })
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/observation/confirmed'], {
            queryParamsHandling: 'preserve',
          });
        },
        error: () => {
          this.submissionErrorKey = 'OBSERVATION.MESSAGES.SUBMIT_ERROR';
        },
      });
  }

  private async getCompressedPhoto(photo: File | null): Promise<File | null> {
    if (!photo) {
      return null;
    }

    try {
      const compressedPhoto = await imageCompression(
        photo,
        OBSERVATION_PHOTO_COMPRESSION_OPTIONS,
      );

      return new File([compressedPhoto], photo.name, {
        type: compressedPhoto.type || photo.type,
        lastModified: photo.lastModified,
      });
    } catch {
      return photo;
    }
  }

  private getSubmissionLocation(location: LatLong): LatLong {
    if (!this.locationService.isLocationOverridden) {
      return location;
    }

    return this.jitterLocation(location);
  }

  private jitterLocation(location: LatLong): LatLong {
    const radiusMeters =
      Math.sqrt(Math.random()) * this.overrideLocationJitterMaxMeters;
    const angle = Math.random() * Math.PI * 2;
    const latitudeOffset =
      (Math.cos(angle) * radiusMeters) / this.metersPerDegreeLatitude;
    const latitudeRadians = (location[0] * Math.PI) / 180;
    const metersPerDegreeLongitude = Math.max(
      1,
      Math.abs(this.metersPerDegreeLatitude * Math.cos(latitudeRadians)),
    );
    const longitudeOffset =
      (Math.sin(angle) * radiusMeters) / metersPerDegreeLongitude;

    return [
      location[0] + latitudeOffset,
      location[1] + longitudeOffset,
    ] as LatLong;
  }

  private updateFlowAndValidation(): void {
    if (this.isWaterOverflowSelected) {
      this.observationStepFlow = [...this.overflowStepFlow];

      this.observationForm.controls.photo.setValidators([Validators.required]);
      this.observationForm.controls.identificationCode.clearValidators();
      this.observationForm.controls.termsAccepted.clearValidators();
      this.observationForm.controls.cc0Accepted.clearValidators();

      this.observationForm.controls.airTemp.setValue(null, { emitEvent: false });
      this.observationForm.controls.waterTemp.setValue(null, { emitEvent: false });
      this.observationForm.controls.depthOfView.setValue(null, {
        emitEvent: false,
      });
      this.observationForm.controls.algaeLevel.setValue(null, { emitEvent: false });
      this.observationForm.controls.waterPh.setValue(null, { emitEvent: false });
      this.observationForm.controls.turbidity.setValue(null, { emitEvent: false });
      this.observationForm.controls.dissolvedOxygen.setValue(null, {
        emitEvent: false,
      });
      this.observationForm.controls.nitrate.setValue(null, { emitEvent: false });
      this.observationForm.controls.phosphate.setValue(null, { emitEvent: false });
      this.observationForm.controls.identificationCode.setValue(null, {
        emitEvent: false,
      });
      this.observationForm.controls.termsAccepted.setValue(false, {
        emitEvent: false,
      });
      this.observationForm.controls.cc0Accepted.setValue(false, {
        emitEvent: false,
      });
    } else {
      this.observationStepFlow = [...this.fullStepFlow];

      this.observationForm.controls.photo.clearValidators();
      this.observationForm.controls.identificationCode.setValidators([
        Validators.required,
      ]);
      this.observationForm.controls.termsAccepted.setValidators([
        Validators.requiredTrue,
      ]);
      this.observationForm.controls.cc0Accepted.setValidators([
        Validators.requiredTrue,
      ]);
    }

    this.observationForm.controls.photo.updateValueAndValidity({
      emitEvent: false,
    });
    this.observationForm.controls.identificationCode.updateValueAndValidity({
      emitEvent: false,
    });
    this.observationForm.controls.termsAccepted.updateValueAndValidity({
      emitEvent: false,
    });
    this.observationForm.controls.cc0Accepted.updateValueAndValidity({
      emitEvent: false,
    });

    if (this.currentStepIndex > this.amountOfSteps - 1) {
      this.currentStepIndex = this.amountOfSteps - 1;
    }
  }
}
