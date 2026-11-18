import { Component, Input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { environment } from '@environments/environment';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';

@Component({
  selector: 'app-feedback-contact',
  templateUrl: './feedback-contact.component.html',
  styleUrls: ['./feedback-contact.component.scss'],
  standalone: true,
  imports: [TranslatePipe, Checkbox, ReactiveFormsModule, InputText],
})
export class FeedbackContactComponent {
  @Input({ required: true }) public contactForm!: FormGroup<{
    email: FormControl<string | null>;
    firstName: FormControl<string | null>;
    lastName: FormControl<string | null>;
    phone: FormControl<string | null>;
    termsOfUseAccepted: FormControl<boolean>;
  }>;

  public termsOfUseUrl = environment.termsOfUseUrl;
  public privacyPolicyUrl = environment.privacyPolicyUrl;

  public constructor(private readonly translateService: TranslateService) {}

  public get invalidPhoneNumberMessage(): string {
    return this.translateService.instant(
      'FEEDBACK.CONTACT.ERROR.INTERNATIONAL_PHONE_NUMBER',
    );
  }
}
