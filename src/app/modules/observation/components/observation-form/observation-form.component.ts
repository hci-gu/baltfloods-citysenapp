import { Component } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { LatLong } from '@core/models/location';
import {
  ObservationApiService,
  ObservationType,
} from '@core/services/observation-api/observation-api.service';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import { StepsComponent } from '@shared/components/steps/steps.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { Button } from 'primeng/button';
import { ObservationFormStep } from './observation-form-step.enum';
import { ObservationFormBuilderService } from './observation-form-builder.service';
import { ObservationPhotoService } from './observation-photo.service';
import {
  FULL_OBSERVATION_STEP_FLOW,
  ObservationForm,
} from './observation-form.types';
import {
  applyObservationStepFlow,
  getCurrentObservationStep,
  getNextButtonLabel,
  isNextEnabled,
  isWaterOverflowSelected,
} from './observation-step-flow';
import { ObservationLocationStepComponent } from './observation-location-step.component';
import { ObservationTermsStepComponent } from './observation-terms-step.component';
import { ObservationTemperatureStepComponent } from './observation-temperature-step.component';
import { ObservationTypePhotoStepComponent } from './observation-type-photo-step.component';
import { ObservationVisibilityAlgaeStepComponent } from './observation-visibility-algae-step.component';
import { ObservationWaterQualityStepComponent } from './observation-water-quality-step.component';

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
    ObservationLocationStepComponent,
    ObservationTypePhotoStepComponent,
    ObservationTemperatureStepComponent,
    ObservationVisibilityAlgaeStepComponent,
    ObservationWaterQualityStepComponent,
    ObservationTermsStepComponent,
  ],
})
export class ObservationFormComponent {
  public STEP = ObservationFormStep;
  public currentStepIndex = 0;
  public observationStepFlow = [...FULL_OBSERVATION_STEP_FLOW];
  public observationForm: FormGroup<ObservationForm> =
    this.formBuilderService.createForm();

  public photoName: string | null = null;
  public isSubmitting = false;
  public submissionErrorKey: string | null = null;

  public constructor(
    private readonly formBuilderService: ObservationFormBuilderService,
    private readonly observationApi: ObservationApiService,
    private readonly router: Router,
    private readonly observationDraftService: ObservationDraftService,
    private readonly observationPhotoService: ObservationPhotoService,
  ) {
    this.applyQuickObservationDraft();
    this.observationForm.controls.observationType.valueChanges.subscribe(() => {
      this.updateFlowAndValidation();
    });
    this.updateFlowAndValidation();
  }

  public get currentStep(): ObservationFormStep {
    return getCurrentObservationStep(
      this.observationStepFlow,
      this.currentStepIndex,
    );
  }

  public get amountOfSteps(): number {
    return this.observationStepFlow.length;
  }

  public get isWaterOverflowSelected(): boolean {
    return isWaterOverflowSelected(this.observationForm);
  }

  public get isNextEnabled(): boolean {
    return isNextEnabled(this.observationForm, this.currentStep);
  }

  public get nextButtonLabel(): string {
    return getNextButtonLabel(this.currentStepIndex, this.amountOfSteps);
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
    this.currentStepIndex = FULL_OBSERVATION_STEP_FLOW.indexOf(
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

    const photo = await this.observationPhotoService.getCompressedPhoto(
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
          : (this.observationForm.controls.identificationCode.value ??
            undefined),
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

  private getSubmissionLocation(location: LatLong): LatLong {
    return location;
  }

  private updateFlowAndValidation(): void {
    this.observationStepFlow = applyObservationStepFlow(this.observationForm);

    if (this.currentStepIndex > this.amountOfSteps - 1) {
      this.currentStepIndex = this.amountOfSteps - 1;
    }
  }
}
