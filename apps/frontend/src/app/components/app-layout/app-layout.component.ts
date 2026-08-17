import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ThemeService } from '../../theme/theme.service';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="app-header">
      <div class="header-inner">
        <a class="brand" routerLink="/dashboard">
          <span class="brand-mark"></span>
          <span class="brand-name">Document Analyzer</span>
        </a>

        <nav class="nav" aria-label="Principal">
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/documents" routerLinkActive="active">Mis documentos</a>
        </nav>

        <div class="header-right">
          @if (user()) {
            <span class="user-email">{{ user()!.email }}</span>
          }
          <button type="button" class="btn btn-ghost" (click)="toggleTheme()">
            {{ theme() === 'dark' ? 'Claro' : 'Oscuro' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="logout()">Cerrar sesión</button>
        </div>
      </div>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
    }

    .app-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
    }

    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-5);
      flex-wrap: wrap;
      min-height: 3.5rem;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text);
      font-family: var(--font-display);
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .brand-mark {
      width: 1.6rem;
      height: 1.6rem;
      border-radius: var(--radius-sm);
      background: var(--color-highlight-soft);
      position: relative;
      flex-shrink: 0;
    }

    .brand-mark::after {
      content: '';
      position: absolute;
      left: 22%;
      right: 22%;
      top: 42%;
      height: 0.3rem;
      background: var(--color-highlight);
      border-radius: var(--radius-full);
      transform: rotate(-8deg);
    }

    .nav {
      display: flex;
      gap: var(--space-4);
    }

    .nav a {
      padding: 0.35rem 0.5rem;
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .nav a:hover {
      color: var(--color-text);
      background: var(--color-surface-muted);
    }

    .nav a.active {
      color: var(--color-primary);
      background: var(--color-surface-muted);
    }

    .header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .user-email {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    @media (max-width: 640px) {
      .header-inner {
        padding-top: var(--space-2);
        padding-bottom: var(--space-2);
      }

      .header-right {
        margin-left: 0;
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
      }

      .user-email {
        display: none;
      }
    }
  `,
})
export class AppLayoutComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly theme = this.themeService.theme;

  ngOnInit(): void {
    this.auth.me().subscribe({ error: () => undefined });
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}