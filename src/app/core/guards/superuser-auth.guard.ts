import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SuperuserAuthService } from '@core/services/superuser-auth.service';

export const superuserAuthGuard: CanActivateFn = (_route, state) => {
  const superuserAuthService = inject(SuperuserAuthService);
  const router = inject(Router);

  if (superuserAuthService.isAuthenticated) {
    return true;
  }

  return router.createUrlTree(['/admin/login'], {
    queryParams: { redirectTo: state.url },
  });
};
