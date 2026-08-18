import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { DocumentStats, DocumentsService } from '../../documents/documents.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, StatusBadgeComponent, EmptyStateComponent],
  template: `
    <section class="dashboard">
      <header class="dashboard-header">
        <div>
          <p class="dashboard-eyebrow">Panel de control</p>
          <h1>{{ greeting() }}</h1>
          <p class="dashboard-sub">Resumen de tu actividad documental.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="load()" [disabled]="loading()">
          Actualizar
        </button>
      </header>

      @if (loading()) {
        <div class="kpi-grid">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="skeleton kpi-skeleton"></div>
          }
        </div>
        <div class="skeleton skeleton-tall"></div>
      } @else if (error()) {
        <app-empty-state
          title="No se pudo cargar el dashboard"
          message="Revisá tu conexión e intentá de nuevo."
          variant="error"
          [actions]="true"
        >
          <button type="button" class="btn btn-primary" (click)="load()">Reintentar</button>
        </app-empty-state>
      } @else if (stats()?.total === 0) {
        <app-empty-state
          title="Sin documentos"
          message="Subí tu primer documento para ver tus estadísticas."
          [actions]="true"
        >
          <a class="btn btn-primary" routerLink="/documents">Ir a Mis documentos</a>
        </app-empty-state>
      } @else {
        <div class="kpi-grid">
          <div class="kpi-card lift">
            <span class="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M8 8h8M8 12h8M8 16h5" stroke-linecap="round" />
              </svg>
            </span>
            <span class="kpi-value">{{ stats()!.total }}</span>
            <span class="kpi-label">Total</span>
          </div>
          <div class="kpi-card kpi-success lift">
            <span class="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 12.5l2.5 2.5 5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="kpi-value">{{ stats()!.processed }}</span>
            <span class="kpi-label">Procesados</span>
          </div>
          <div class="kpi-card kpi-warning lift">
            <span class="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="kpi-value">{{ stats()!.processing }}</span>
            <span class="kpi-label">En curso</span>
          </div>
          <div class="kpi-card kpi-danger lift">
            <span class="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 4l9 16H3z" stroke-linejoin="round" />
                <path d="M12 10v4M12 17v.5" stroke-linecap="round" />
              </svg>
            </span>
            <span class="kpi-value">{{ stats()!.failed }}</span>
            <span class="kpi-label">Fallidos</span>
          </div>
        </div>

        <section class="card lift">
          <h2>Documentos recientes</h2>
          @for (doc of stats()!.recent; track doc.id) {
            <a class="recent-row" routerLink="/documents/{{ doc.id }}">
              <span class="recent-name">{{ doc.name }}</span>
              <span class="recent-meta">{{ formatDate(doc.createdAt) }}</span>
              <app-status-badge [status]="doc.status" />
            </a>
          } @empty {
            <p class="empty">No hay documentos recientes</p>
          }
        </section>

        <div class="stats-grid">
          <section class="card lift">
            <h2>Distribución por estado</h2>
            <div class="bar-list">
              <div class="bar-row">
                <span class="bar-label">Procesados</span>
                <div class="bar-track">
                  <div class="bar-fill success" [style.width.%]="percent(stats()!.processed, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.processed }}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">En curso</span>
                <div class="bar-track">
                  <div class="bar-fill warning" [style.width.%]="percent(stats()!.processing, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.processing }}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">Fallidos</span>
                <div class="bar-track">
                  <div class="bar-fill danger" [style.width.%]="percent(stats()!.failed, stats()!.total)"></div>
                </div>
                <span class="bar-value">{{ stats()!.failed }}</span>
              </div>
            </div>
          </section>

          <section class="card lift">
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

        <section class="card lift">
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
    .dashboard {
      max-width: 1100px;
      margin: var(--space-6) auto;
      padding: 0 var(--space-4);
    }

    .dashboard-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-6);
    }

    .dashboard-header h1 {
      margin: 0;
      font-size: var(--text-3xl);
    }

    .dashboard-eyebrow {
      margin: 0 0 var(--space-1);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-primary);
    }

    .dashboard-sub {
      margin: var(--space-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .dashboard .card {
      margin-bottom: var(--space-4);
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .kpi-skeleton {
      min-height: 132px;
    }

    .skeleton-tall {
      min-height: 180px;
    }

    .recent-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: var(--space-3);
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text);
    }

    .recent-row:last-child {
      border-bottom: none;
    }

    .recent-row:hover {
      background: var(--color-surface-muted);
    }

    .recent-name {
      font-size: var(--text-sm);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .recent-meta {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .stats-grid .card {
      margin-bottom: 0;
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
      gap: var(--space-2);
    }

    .bar-label {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .bar-track {
      height: 0.7rem;
      background: var(--color-surface-muted);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: var(--radius-full);
      background: linear-gradient(90deg, var(--color-primary), var(--color-primary-hover));
    }

    .bar-fill.success {
      background: linear-gradient(90deg, var(--color-success), var(--color-primary));
    }

    .bar-fill.warning {
      background: var(--color-warning);
    }

    .bar-fill.danger {
      background: var(--color-danger);
    }

    .bar-value {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      text-align: right;
    }

    .activity-chart {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
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
      min-height: 2px;
      border-radius: 4px 4px 0 0;
      background: linear-gradient(to top, var(--color-primary-hover), var(--color-primary));
    }

    .activity-value {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .activity-label {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .empty {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
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
  private readonly documents = inject(DocumentsService);
  private readonly auth = inject(AuthService);

  readonly stats = signal<DocumentStats | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly greeting = computed(() => {
    const email = this.auth.user()?.email;
    return email ? `Hola, ${email.split('@')[0]}` : 'Hola';
  });

  ngOnInit(): void {
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

  percent(count: number, total: number): number {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  activityHeight(count: number): number {
    const activity = this.stats()?.activity ?? [];
    const max = activity.reduce((acc, week) => Math.max(acc, week.count), 1);
    return Math.round((count / max) * 100);
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