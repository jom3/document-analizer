import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { AuthService } from '../../auth/auth.service';

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
    <app-auth-layout
      heading="Empezá a analizar"
      accent="tus documentos."
      text="Creá tu cuenta para subir PDFs y obtener análisis, resúmenes y respuestas con fuentes."
    >
      <h1>Crear cuenta</h1>
      <p class="auth-sub">Empezá hoy a iluminar tus documentos.</p>

      <section class="auth-form-card">
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
                autocomplete="new-password"
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
          <label>
            Confirmar contraseña
            <span class="password-wrap">
              <input
                [type]="showConfirm() ? 'text' : 'password'"
                formControlName="confirmPassword"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="password-toggle"
                (click)="toggleConfirm()"
                [attr.aria-label]="showConfirm() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                aria-hidden="false"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke-linejoin="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </span>
          </label>

          @if (form.errors?.['mismatch'] && form.get('confirmPassword')?.touched) {
            <p class="error">Las contraseñas no coinciden.</p>
          }
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">
            Registrarme
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </form>

        <nav>
          <a routerLink="/login">Ya tengo cuenta</a>
        </nav>
      </section>
    </app-auth-layout>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup(
    {
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: confirmPasswordValidator },
  );

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  toggleConfirm(): void {
    this.showConfirm.update((value) => !value);
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.register(email, password).subscribe({
      next: () => this.router.navigate(['/login'], { queryParams: { registered: '1' } }),
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Error al registrar la cuenta');
      },
    });
  }
}
