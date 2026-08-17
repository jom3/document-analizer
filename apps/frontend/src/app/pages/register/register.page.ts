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
import { AuthService } from '../../auth/auth.service';

function confirmPasswordValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-card">
      <h1>Document Analyzer</h1>
      <h2>Crear cuenta</h2>

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" />
        </label>
        <label>
          Contraseña
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

        <button type="submit" class="btn btn-primary" [disabled]="form.invalid || submitting()">Registrarme</button>
      </form>

      <nav>
        <a routerLink="/login">Ya tengo cuenta</a>
      </nav>
    </section>
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
