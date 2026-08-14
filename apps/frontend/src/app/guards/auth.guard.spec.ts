import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { authGuard } from './auth.guard';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

describe('authGuard', () => {
  let auth: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  it('allows access when there is a session', async () => {
    auth.setSession({ accessToken: 'tok', user: { id: '1', email: 'a@b.c' } });

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBe(true);
  });

  it('restores the session with the refresh token and allows access', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => authGuard(route, state)) as Promise<boolean | UrlTree>;

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ accessToken: 'new-tok' });

    const result = await resultPromise;
    expect(result).toBe(true);
    expect(auth.token()).toBe('new-tok');
  });

  it('redirects to /login when the refresh fails', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => authGuard(route, state)) as Promise<boolean | UrlTree>;

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const result = await resultPromise;
    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
