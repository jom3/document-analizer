import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { DocumentStats, DocumentsService } from '../../documents/documents.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  template: `
    <section class="dashboard">
      <header class="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p class="welcome">Bienvenido, {{ user()?.email }}</p>
        </div>
        <nav class="header-actions">
          <a routerLink="/documents">Mis documentos</a>
          <button type="button" (click)="load()" [disabled]="loading()">Actualizar</button>
          <button type="button" (click)="logout()">Cerrar sesión</button>
        </nav>
      </header>

      @if (loading()) {
        <div class="kpi-grid">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="card skeleton"></div>
          }
        </div>
        <div class="card skeleton skeleton-tall"></div>
      } @else if (error()) {
        <div class="state">
          <p>No se pudo cargar el dashboard.</p>
          <button type="button" (click)="load()">Reintentar</button>
        </div>
      } @else if (stats()?.total === 0) {
        <div class="state">
          <h2>Sin documentos</h2>
          <p>Subí tu primer documento para ver tus estadísticas.</p>
          <a routerLink="/documents">Ir a Mis documentos</a>
        </div>
      } @else {
        <div class="kpi-grid">
          <div class="card kpi">
            <span class="kpi-label">Total</span>
            <span class="kpi-value">{{ stats()!.total }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Procesados</span>
            <span class="kpi-value">{{ stats()!.processed }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">En curso</span>
            <span class="kpi-value">{{ stats()!.processing }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Fallidos</span>
            <span class="kpi-value">{{ stats()!.failed }}</span>
          </div>
        </div>

        <section class="card">
          <h2>Documentos recientes</h2>
          @for (doc of stats()!.recent; track doc.id) {
            <a class="recent-row" routerLink="/documents/{{ doc.id }}">
              <span class="recent-name">{{ doc.name }}</span>
              <span class="recent-meta">{{ formatDate(doc.createdAt) }}</span>
              <span class="status" [class]="statusClass(doc.status)">{{ statusLabel(doc.status) }}</span>
            </a>
          } @empty {
            <p class="empty">No hay documentos recientes</p>
          }
        </section>

        <div class="stats-grid">
          <section class="card">
            <h2>Distribución por estado</h2>
            <div class="bar-list">
              <div class="bar-row">
                <span class="bar-label">Procesados</span>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="percent(stats()!.processed, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.processed }}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">En curso</span>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="percent(stats()!.processing, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.processing }}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">Fallidos</span>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="percent(stats()!.failed, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.failed }}</span>
              </div>
            </div>
          </section>

          <section class="card">
            <h2>Actividad semanal</h2>
            <div class="activity-chart">
              @for (week of stats()!.activity; track week.weekStart) {
                <div class="activity-col">
                  <div class="activity-bar-area">
                    <div class="activity-bar" [style.height.%]="activityHeight(week.count)"></div>
                  </div>
                  <span class="activity-value">{{ week.count }}</span>
                  <span class="activity-label">{{ weekLabel(week.weekStart) }}</span>
                </div>
              }
            </div>
          </section>
        </div>

        <section class="card">
          <h2>Desglose por tipo</h2>
          <div class="bar-list">
            @for (type of stats()!.byType; track type.type) {
              <div class="bar-row">
                <span class="bar-label">{{ typeLabel(type.type) }}</span>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="percent(type.count, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ type.count }}</span>
              </div>
            }
          </div>
        </section>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .dashboard {
      max-width: 1100px;
      margin: 6vh auto;
      padding: 0 1rem;
    }

    .dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .dashboard-header h1 {
      margin: 0 0 0.25rem;
    }

    .welcome {
      margin: 0;
      font-size: 0.9rem;
      color: #555;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .header-actions a {
      font-size: 0.875rem;
      color: #1a73e8;
      text-decoration: none;
    }

    .dashboard button {
      padding: 0.5rem 0.75rem;
      border: none;
      border-radius: 6px;
      background: #1a73e8;
      color: #fff;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .dashboard button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .card h2 {
      margin: 0 0 1rem;
      font-size: 1rem;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .kpi {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .kpi-label {
      font-size: 0.75rem;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .kpi-value {
      font-size: 1.75rem;
      font-weight: 600;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stats-grid .card {
      margin-bottom: 0;
    }

    .skeleton {
      min-height: 90px;
      border: 1px solid #eee;
      background: linear-gradient(90deg, #eee 25%, #f6f6f6 50%, #eee 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
    }

    .skeleton-tall {
      min-height: 180px;
    }

    @keyframes shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }

    .state {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 2rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .state h2 {
      margin: 0 0 0.5rem;
    }

    .state p {
      margin: 0 0 1rem;
      color: #555;
    }

    .state a {
      color: #1a73e8;
      text-decoration: none;
    }

    .recent-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid #eee;
      text-decoration: none;
      color: #1a1a1a;
    }

    .recent-row:last-child {
      border-bottom: none;
    }

    .recent-name {
      font-size: 0.9rem;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .recent-meta {
      font-size: 0.75rem;
      color: #777;
    }

    .status {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: #e8eaed;
      color: #444;
    }

    .status.completed {
      background: #e0f2e1;
      color: #0b6e0b;
    }

    .status.failed {
      background: #fdecea;
      color: #b00020;
    }

    .status.processing {
      background: #fff4e5;
      color: #8a5300;
    }

    .status.queued {
      background: #e8f0fe;
      color: #1a73e8;
    }

    .bar-list {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 110px 1fr 2rem;
      align-items: center;
      gap: 0.5rem;
    }

    .bar-label {
      font-size: 0.8rem;
      color: #444;
    }

    .bar-track {
      height: 0.6rem;
      background: #eef0f2;
      border-radius: 999px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: #1a73e8;
      border-radius: 999px;
    }

    .bar-value {
      font-size: 0.8rem;
      color: #555;
      text-align: right;
    }

    .activity-chart {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
    }

    .activity-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .activity-bar-area {
      width: 100%;
      height: 120px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .activity-bar {
      width: 70%;
      max-width: 2.5rem;
      background: #1a73e8;
      border-radius: 4px 4px 0 0;
      min-height: 2px;
    }

    .activity-value {
      font-size: 0.7rem;
      color: #555;
    }

    .activity-label {
      font-size: 0.65rem;
      color: #777;
    }

    .empty {
      margin: 0;
      color: #777;
      font-size: 0.875rem;
    }

    @media (max-width: 720px) {
      .dashboard-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .kpi-grid,
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly documents = inject(DocumentsService);

  readonly user = this.auth.user;

  readonly stats = signal<DocumentStats | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  ngOnInit(): void {
    this.auth.me().subscribe({
      error: () => undefined,
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.documents.stats().subscribe({
      next: (result) => {
        this.stats.set(result);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }

  percent(count: number, total: number): number {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  activityHeight(count: number): number {
    const activity = this.stats()?.activity ?? [];
    const max = activity.reduce((acc, week) => Math.max(acc, week.count), 1);
    return Math.round((count / max) * 100);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'UPLOADED':
        return 'Subido';
      case 'QUEUED':
        return 'En cola';
      case 'PROCESSING':
        return 'Procesando';
      case 'COMPLETED':
        return 'Completado';
      case 'FAILED':
        return 'Fallido';
      default:
        return status;
    }
  }

  statusClass(status: string): string {
    return status.toLowerCase();
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'invoice':
        return 'Factura';
      case 'resume':
        return 'Currículum';
      case 'contract':
        return 'Contrato';
      case 'generic':
        return 'Genérico';
      case 'unclassified':
        return 'Sin clasificar';
      default:
        return type;
    }
  }

  weekLabel(weekStart: string): string {
    const [, month, day] = weekStart.split('-');
    return `${day}/${month}`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}
