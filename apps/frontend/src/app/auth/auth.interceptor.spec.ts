import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it('attaches the Bearer token when a session exists', () => {
    auth.setSession({ accessToken: 'tok-123', user: { id: '1', email: 'a@b.c' } });

    http.get('/api/auth/me').subscribe();
    const req = httpTesting.expectOne('/api/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
    req.flush({ id: '1', email: 'a@b.c' });
  });

  it('does not attach the Bearer token when there is no session', () => {
    http.get('/api/auth/me').subscribe();
    const req = httpTesting.expectOne('/api/auth/me');
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush({ id: '1', email: 'a@b.c' });
  });

  it('refreshes the token and retries once on a 401', () => {
    auth.setSession({ accessToken: 'expired-token', user: { id: '1', email: 'a@b.c' } });

    http.get('/api/auth/me').subscribe();
    const initial = httpTesting.expectOne('/api/auth/me');
    initial.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ accessToken: 'new-token' });

    const retry = httpTesting.expectOne('/api/auth/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ id: '1', email: 'a@b.c' });
  });

  it('clears the session when the refresh fails', () => {
    auth.setSession({ accessToken: 'expired-token', user: { id: '1', email: 'a@b.c' } });

    http.get('/api/auth/me').subscribe({ error: () => undefined });
    const initial = httpTesting.expectOne('/api/auth/me');
    initial.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = httpTesting.expectOne('/api/auth/refresh');
    refresh.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('does not trigger a refresh on a 401 from the login endpoint', () => {
    http.post('/api/auth/login', { email: 'a@b.c', password: 'x' }).subscribe({ error: () => undefined });
    const login = httpTesting.expectOne('/api/auth/login');
    login.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    httpTesting.verify();
  });
});
