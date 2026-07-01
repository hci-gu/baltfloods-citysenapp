import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from 'primeng/inputtext';
import { ObservationForm } from './observation-form.types';

@Component({
  selector: 'app-observation-visibility-algae-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, InputText],
  templateUrl: './observation-visibility-algae-step.component.html',
  styleUrls: ['./observation-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationVisibilityAlgaeStepComponent {
  @Input({ required: true })
  public observationForm!: FormGroup<ObservationForm>;
}
