import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  try {
    await lastValueFrom(auth.refresh());
    return auth.isAuthenticated();
  } catch {
    return router.createUrlTree(['/login']);
  }
};
