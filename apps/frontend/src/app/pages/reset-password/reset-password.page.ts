import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { AuthService } from '../../auth/auth.service';

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  template: `
<app-auth-layout
      heading="Restablecé tu contraseña"
      text="Elegí una contraseña nueva para volver a entrar."
      [panelVariant]="'compact'"
    >
      <h1>Restablecer contraseña</h1>
      <p class="auth-sub">Elegí una contraseña nueva para volver a entrar.</p>

      <section class="auth-form-card">
        @if (missingToken()) {
          <p class="error">Falta el token de restablecimiento.</p>
          <nav>
            <a routerLink="/forgot-password">Solicitar un nuevo link</a>
          </nav>
        } @else {
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <label>
              Nueva contraseña
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
              Restablecer
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </form>
        }
      </section>
    </app-auth-layout>
  `,
})
export class ResetPasswordPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly form = new FormGroup(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: confirmPasswordValidator },
  );

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly missingToken = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);

  private token: string | null = null;

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  toggleConfirm(): void {
    this.showConfirm.update((value) => !value);
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    this.missingToken.set(!this.token);
  }

  onSubmit(): void {
    if (this.form.invalid || !this.token) return;

    this.submitting.set(true);
    this.error.set(null);
    const { password } = this.form.getRawValue();

    this.auth.resetPassword(this.token, password).subscribe({
      next: () => this.router.navigate(['/login'], { queryParams: { reset: '1' } }),
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Token inválido o expirado.');
      },
    });
  }
}
