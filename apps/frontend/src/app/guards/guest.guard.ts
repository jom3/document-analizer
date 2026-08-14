import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    try {
      await lastValueFrom(auth.refresh());
    } catch {
      // No hay sesión: se permite el acceso a la página pública.
    }
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
