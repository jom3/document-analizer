import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-dashboard-page',
  template: `
    <section class="page">
      <h1>Dashboard</h1>
      <p>Bienvenido, {{ user()?.email }}</p>
      <button (click)="logout()">Cerrar sesión</button>
    </section>
  `,
})
export class DashboardPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;

  ngOnInit(): void {
    this.auth.me().subscribe({
      error: () => undefined,
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}
