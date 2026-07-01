import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ObservationForm } from './observation-form.types';

@Component({
  selector: 'app-observation-water-quality-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './observation-water-quality-step.component.html',
  styleUrls: ['./observation-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationWaterQualityStepComponent {
  @Input({ required: true })
  public observationForm!: FormGroup<ObservationForm>;
}
