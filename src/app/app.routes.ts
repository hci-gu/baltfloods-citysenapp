import { Routes } from '@angular/router';
import { environment } from '@environments/environment';
import { authGuard } from '@core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./modules/dashboard/dashboard.module').then(
        (m) => m.DashboardModule,
      ),
    data: { navigationHeaderTitle: environment.jurisdiction },
  },
  {
    path: 'feedback',
    loadChildren: () =>
      import('./modules/feedback/feedback.module').then(
        (m) => m.FeedbackModule,
      ),
    data: { navigationHeaderTitle: 'NAVIGATION.HEADER.FEEDBACK' },
  },
  {
    path: 'observation',
    loadChildren: () =>
      import('./modules/observation/observation.module').then(
        (m) => m.ObservationModule,
      ),
    data: { navigationHeaderTitle: 'NAVIGATION.HEADER.OBSERVATION' },
  },
  {
    path: 'about',
    loadChildren: () =>
      import('./modules/about/about.module').then((m) => m.AboutModule),
    data: { navigationHeaderTitle: 'NAVIGATION.HEADER.ABOUT' },
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./modules/auth/components/login/login.component').then(
        (c) => c.LoginComponent,
      ),
    data: { navigationHeaderTitle: 'AUTH.LOGIN.TITLE' },
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./modules/auth/components/signup/signup.component').then(
        (c) => c.SignupComponent,
      ),
    data: { navigationHeaderTitle: 'AUTH.SIGNUP.TITLE' },
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./modules/auth/components/profile/profile.component').then(
        (c) => c.ProfileComponent,
      ),
    canActivate: [authGuard],
    data: { navigationHeaderTitle: 'AUTH.PROFILE.TITLE' },
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import(
        './modules/admin/components/admin-observations/admin-observations.component'
      ).then((c) => c.AdminObservationsComponent),
    pathMatch: 'full',
    data: { navigationHeaderTitle: 'Dashboard' },
  },
  {
    path: 'admin',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'admin/login',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
