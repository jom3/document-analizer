import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card">
      <h1>Document Analyzer</h1>
      <h2>Recuperar contraseña</h2>

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

        <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">Enviar link</button>
      </form>

      <nav>
        <a routerLink="/login">Volver a iniciar sesión</a>
      </nav>
    </section>
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
