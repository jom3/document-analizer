import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
    <app-auth-layout
      heading="Iluminá"
      accent="tus documentos."
      text="Subí un PDF y dejá que la inteligencia artificial lo lea, lo clasifique y responda tus preguntas."
    >
      <h1>Iniciar sesión</h1>
      <p class="auth-sub">Bienvenido de nuevo a Document Analyzer.</p>

      <section class="auth-form-card">
        @if (justRegistered()) {
          <p class="info">Revisá tu email y verificá tu cuenta antes de entrar.</p>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <label>
            Email
            <input type="email" formControlName="email" autocomplete="email" />
          </label>
          <label>
            Contraseña
            <span class="password-wrap">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="password-toggle"
                (click)="togglePassword()"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                aria-hidden="false"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke-linejoin="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </span>
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">
            Entrar
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </form>

        <nav>
          <a routerLink="/register">Crear cuenta</a>
          <a routerLink="/forgot-password">Olvidé mi contraseña</a>
        </nav>
      </section>
    </app-auth-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly justRegistered = signal(false);
  readonly showPassword = signal(false);

  constructor() {
    this.justRegistered.set(this.route.snapshot.queryParamMap.get('registered') === '1');
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Error al iniciar sesión');
      },
    });
  }
}
