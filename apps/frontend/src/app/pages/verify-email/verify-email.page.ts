import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink, AuthLayoutComponent],
  template: `
    <app-auth-layout
      heading="Verificá tu email"
      text="Confirmá tu cuenta para empezar a analizar documentos."
      [panelVariant]="'compact'"
    >
      <h1>Verificación de email</h1>
      <p class="auth-sub">Confirmá tu cuenta para empezar a analizar documentos.</p>

      <section class="auth-form-card">
        @switch (state()) {
          @case ('verifying') {
            <p>Verificando tu cuenta...</p>
          }
          @case ('success') {
            <p class="info">Tu email fue verificado. Ya podés iniciar sesión.</p>
            <a routerLink="/login">Ir a iniciar sesión</a>
          }
          @case ('error') {
            <p class="error">{{ error() }}</p>
            <a routerLink="/register">Volver a registrarte</a>
          }
        }
      </section>
    </app-auth-layout>
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly state = signal<'verifying' | 'success' | 'error'>('verifying');
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.state.set('error');
      this.error.set('Falta el token de verificación.');
      return;
    }

    this.auth.verifyEmail(token).subscribe({
      next: () => this.state.set('success'),
      error: (err) => {
        this.state.set('error');
        this.error.set(err.error?.message ?? 'Token inválido o expirado.');
      },
    });
  }
}
