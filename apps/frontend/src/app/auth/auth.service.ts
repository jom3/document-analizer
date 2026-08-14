import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly token = this.accessToken.asReadonly();
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  register(email: string, password: string): Observable<{ id: string; email: string; emailVerified: boolean }> {
    return this.http.post<{ id: string; email: string; emailVerified: boolean }>('/api/auth/register', { email, password });
  }

  verifyEmail(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/verify-email', { token });
  }

  login(email: string, password: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>('/api/auth/login', { email, password }).pipe(
      tap((tokens) => this.setSession(tokens)),
    );
  }

  refresh(): Observable<{ accessToken: string }> {
    return this.http.post<{ accessToken: string }>('/api/auth/refresh', {}).pipe(
      tap((response) => this.accessToken.set(response.accessToken)),
    );
  }

  logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/logout', {}).pipe(
      tap(() => this.clearSession()),
    );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/reset-password', { token, password });
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/me');
  }

  setSession(tokens: AuthTokens): void {
    this.accessToken.set(tokens.accessToken);
    this.currentUser.set(tokens.user);
  }

  clearSession(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
  }
}
