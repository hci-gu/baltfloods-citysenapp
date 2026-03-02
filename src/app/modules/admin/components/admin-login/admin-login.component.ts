import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SuperuserAuthService } from '@core/services/superuser-auth.service';
import { InputTextModule } from 'primeng/inputtext';
import { SharedModule } from '@shared/shared.module';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
  imports: [SharedModule, ReactiveFormsModule, InputTextModule, RouterLink],
})
export class AdminLoginComponent {
  public readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  public errorMessage = '';
  public isSubmitting = false;

  public constructor(
    private readonly formBuilder: FormBuilder,
    private readonly superuserAuthService: SuperuserAuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  public onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    if (!email || !password) {
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

    this.superuserAuthService.login(email, password).subscribe({
      next: () => {
        const redirectTo =
          this.route.snapshot.queryParamMap.get('redirectTo') || '/admin';
        this.router.navigateByUrl(redirectTo);
      },
      error: () => {
        this.errorMessage = 'Invalid superuser credentials.';
        this.isSubmitting = false;
      },
    });
  }
}
