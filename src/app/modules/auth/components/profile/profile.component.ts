import { Component } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { InputTextModule } from 'primeng/inputtext';
import { SharedModule } from '@shared/shared.module';
import { AuthService } from '@core/services/auth.service';
import { PushNotificationsService } from '@core/services/push-notifications.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  imports: [SharedModule, ReactiveFormsModule, InputTextModule, TranslatePipe],
})
export class ProfileComponent {
  public readonly passwordForm = this.formBuilder.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirm: ['', [Validators.required]],
    },
    { validators: [this.passwordMatchValidator] },
  );

  public errorMessage = '';
  public successMessage = '';
  public isSubmitting = false;
  public pushErrorMessage = '';
  public pushSuccessMessage = '';
  public isPushSubmitting = false;
  public readonly pushSubscription$ = this.pushNotifications.subscription$;

  public constructor(
    private readonly formBuilder: FormBuilder,
    private readonly authService: AuthService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly router: Router,
  ) {}

  public get email(): string {
    return this.authService.user?.email ?? '';
  }

  public get passwordMismatch(): boolean {
    return this.passwordForm.hasError('passwordMismatch');
  }

  public get isPushSupported(): boolean {
    return this.pushNotifications.isEnabled;
  }

  public get isPushPermissionDenied(): boolean {
    return this.pushNotifications.permission === 'denied';
  }

  public onSubmit(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { password } = this.passwordForm.getRawValue();
    if (!password) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSubmitting = true;

    this.authService.changePassword(password).subscribe({
      next: () => {
        this.successMessage = 'AUTH.PROFILE.PASSWORD_UPDATED';
        this.isSubmitting = false;
        this.passwordForm.reset();
      },
      error: () => {
        this.errorMessage = 'AUTH.ERROR.PASSWORD_UPDATE_FAILED';
        this.isSubmitting = false;
      },
    });
  }

  public onEnablePush(): void {
    if (this.isPushPermissionDenied) {
      this.pushErrorMessage = 'AUTH.PROFILE.PUSH_PERMISSION_DENIED';
      this.pushSuccessMessage = '';
      return;
    }

    this.pushErrorMessage = '';
    this.pushSuccessMessage = '';
    this.isPushSubmitting = true;

    this.pushNotifications.requestSubscription().subscribe({
      next: () => {
        this.pushSuccessMessage = 'AUTH.PROFILE.PUSH_ENABLED';
        this.isPushSubmitting = false;
      },
      error: () => {
        this.pushErrorMessage = 'AUTH.PROFILE.PUSH_ERROR';
        this.isPushSubmitting = false;
      },
    });
  }

  public onDisablePush(): void {
    this.pushErrorMessage = '';
    this.pushSuccessMessage = '';
    this.isPushSubmitting = true;

    this.pushNotifications.unsubscribe().subscribe({
      next: () => {
        this.pushSuccessMessage = 'AUTH.PROFILE.PUSH_DISABLED';
        this.isPushSubmitting = false;
      },
      error: () => {
        this.pushErrorMessage = 'AUTH.PROFILE.PUSH_ERROR';
        this.isPushSubmitting = false;
      },
    });
  }

  public onLogout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  private passwordMatchValidator(
    control: AbstractControl,
  ): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('passwordConfirm')?.value;
    if (!password || !confirm) {
      return null;
    }

    return password === confirm ? null : { passwordMismatch: true };
  }
}
