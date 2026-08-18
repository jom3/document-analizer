import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
    <app-auth-layout
      heading="Recuperá tu acceso"
      text="Te enviamos un link para restablecer tu contraseña."
      [panelVariant]="'compact'"
    >
      <h1>Recuperar contraseña</h1>
      <p class="auth-sub">Ingresá tu email y te enviamos un link para restablecerla.</p>

      <section class="auth-form-card">
        @if (sent()) {
          <p class="info">Si el email existe, enviamos un link para restablecer tu contraseña.</p>
        }

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <label>
            Email
            <input type="email" formControlName="email" autocomplete="email" />
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">
            Enviar link
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </form>

        <nav>
          <a routerLink="/login">Volver a iniciar sesión</a>
        </nav>
      </section>
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly sent = signal(false);

  onSubmit(): void {
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);
    const { email } = this.form.getRawValue();

    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Error al enviar el link de recuperación');
      },
    });
  }
}
