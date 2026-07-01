import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FeedbackLocationComponent } from '../../../feedback/components/feedback-form/feedback-location/feedback-location.component';
import { ObservationForm } from './observation-form.types';

@Component({
  selector: 'app-observation-location-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, FeedbackLocationComponent],
  templateUrl: './observation-location-step.component.html',
  styleUrls: ['./observation-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationLocationStepComponent {
  @Input({ required: true })
  public observationForm!: FormGroup<ObservationForm>;
}
