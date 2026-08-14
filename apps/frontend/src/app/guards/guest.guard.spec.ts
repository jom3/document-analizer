import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { guestGuard } from './guest.guard';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

describe('guestGuard', () => {
  let auth: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  it('allows access to the public page when there is no session', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => guestGuard(route, state)) as Promise<boolean | UrlTree>;

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const result = await resultPromise;
    expect(result).toBe(true);
  });

  it('redirects to /dashboard when there is a session', async () => {
    auth.setSession({ accessToken: 'tok', user: { id: '1', email: 'a@b.c' } });

    const result = await TestBed.runInInjectionContext(() => guestGuard(route, state));
    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/dashboard');
  });

  it('restores the session and redirects to /dashboard when the refresh succeeds', async () => {
    const resultPromise = TestBed.runInInjectionContext(() => guestGuard(route, state)) as Promise<boolean | UrlTree>;

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ accessToken: 'new-tok' });

    const result = await resultPromise;
    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/dashboard');
  });
});
