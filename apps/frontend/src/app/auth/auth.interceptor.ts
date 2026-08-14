import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const RETRIED = new HttpContextToken<boolean>(() => false);

const AUTH_FLOW_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !request.context.get(RETRIED) && !isAuthFlowRequest(request.url)) {
        return auth.refresh().pipe(
          switchMap(() => {
            const retryRequest = request.clone({
              setHeaders: { Authorization: `Bearer ${auth.token()}` },
              context: request.context.set(RETRIED, true),
            });
            return next(retryRequest);
          }),
          catchError(() => {
            auth.clearSession();
            return throwError(() => error);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};

function isAuthFlowRequest(url: string): boolean {
  return AUTH_FLOW_PATHS.has(url.split('?')[0]);
}
