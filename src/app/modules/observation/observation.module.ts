import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { StepsComponent } from '@shared/components/steps/steps.component';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ObservationRoutingModule } from './observation.routing';
import { ObservationFormComponent } from './components/observation-form/observation-form.component';
import { ObservationConfirmationComponent } from './components/observation-confirmation/observation-confirmation.component';
import { FeedbackLocationComponent } from '../feedback/components/feedback-form/feedback-location/feedback-location.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    SharedModule,
    ObservationRoutingModule,
    ReactiveFormsModule,
    StepsComponent,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    FeedbackLocationComponent,
    ObservationFormComponent,
    ObservationConfirmationComponent,
  ],
})
export class ObservationModule {}
