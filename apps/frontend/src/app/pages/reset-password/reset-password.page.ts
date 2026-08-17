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
import { AuthService } from '../../auth/auth.service';

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card">
      <h1>Document Analyzer</h1>
      <h2>Restablecer contraseña</h2>

      @if (missingToken()) {
        <p class="error">Falta el token de restablecimiento.</p>
        <nav>
          <a routerLink="/forgot-password">Solicitar un nuevo link</a>
        </nav>
      } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <label>
            Nueva contraseña
            <input type="password" formControlName="password" autocomplete="new-password" />
          </label>
          <label>
            Confirmar contraseña
            <input type="password" formControlName="confirmPassword" autocomplete="new-password" />
          </label>

          @if (form.errors?.['mismatch'] && form.get('confirmPassword')?.touched) {
            <p class="error">Las contraseñas no coinciden.</p>
          }
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">Restablecer</button>
        </form>
      }
    </section>
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

  private token: string | null = null;

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
