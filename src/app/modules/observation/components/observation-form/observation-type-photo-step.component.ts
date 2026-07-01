import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { ObservationForm } from './observation-form.types';

@Component({
  selector: 'app-observation-type-photo-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, Button],
  templateUrl: './observation-type-photo-step.component.html',
  styleUrls: ['./observation-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationTypePhotoStepComponent {
  @Input({ required: true })
  public observationForm!: FormGroup<ObservationForm>;
  @Input() public photoName: string | null = null;
  @Input() public isWaterOverflowSelected = false;

  @Output() public photoSelected = new EventEmitter<Event>();
  @Output() public removePhoto = new EventEmitter<void>();
}
