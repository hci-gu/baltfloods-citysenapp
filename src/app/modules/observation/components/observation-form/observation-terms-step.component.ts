import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { ObservationForm } from './observation-form.types';

@Component({
  selector: 'app-observation-terms-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, Checkbox, InputText],
  templateUrl: './observation-terms-step.component.html',
  styleUrls: ['./observation-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationTermsStepComponent {
  @Input({ required: true })
  public observationForm!: FormGroup<ObservationForm>;
  @Input() public submissionErrorKey: string | null = null;
}
