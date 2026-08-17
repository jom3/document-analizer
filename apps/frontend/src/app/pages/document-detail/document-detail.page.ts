import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { PdfViewerComponent } from '../../components/pdf-viewer/pdf-viewer.component';
import { DocumentChatComponent } from '../../components/document-chat/document-chat.component';
import {
  Document,
  DocumentAnalysis,
  DocumentPage,
  DocumentsService,
} from '../../documents/documents.service';

@Component({
  selector: 'app-document-detail-page',
  imports: [PdfViewerComponent, DocumentChatComponent, StatusBadgeComponent, EmptyStateComponent],
  template: `
    <section class="page detail">
      @if (loadingDocument()) {
        <p class="muted">Cargando documento…</p>
      } @else if (error()) {
        <app-empty-state
          title="No se pudo cargar el documento"
          message="Revisá tu conexión e intentá de nuevo."
          variant="error"
        />
      } @else if (document()) {
        <header class="detail-header">
          <h1>{{ document()!.name }}</h1>
          <app-status-badge [status]="document()!.status" />
        </header>

        <div class="detail-layout">
          <div class="viewer-pane">
            <div class="view-tabs">
              <button type="button" class="btn btn-secondary" [class.active]="viewMode() === 'pdf'" (click)="switchView('pdf')">Ver PDF</button>
              <button type="button" class="btn btn-secondary" [class.active]="viewMode() === 'text'" (click)="switchView('text')">Texto extraído</button>
              <button type="button" class="btn btn-secondary" [class.active]="viewMode() === 'chat'" (click)="switchView('chat')">Chat</button>
            </div>

            @if (viewMode() === 'pdf') {
              <div class="pdf-host">
                @if (pdfLoading()) {
                  <p class="muted">Cargando PDF…</p>
                } @else if (pdfError()) {
                  <p class="error">{{ pdfError() }}</p>
                } @else {
                  <app-pdf-viewer [pdfBlob]="pdfBlob()" [navigateTo]="pdfNavigateTarget()" (downloadRequested)="download()" />
                }
              </div>
            } @else if (viewMode() === 'text') {
              @if (pages().length === 0) {
                @if (loadingPages()) {
                  <p class="muted">Cargando texto…</p>
                } @else {
                  <app-empty-state
                    title="Sin texto extraído"
                    message="Este documento aún no tiene texto extraído."
                  />
                }
              }
              @for (page of pages(); track page.pageNumber) {
                <article class="page-block">
                  <h3>Página {{ page.pageNumber }}</h3>
                  <pre>{{ page.text || 'Sin texto' }}</pre>
                </article>
              }
            } @else {
              @if (document()) {
                <div class="chat-host">
                  <app-document-chat [documentId]="document()!.id" (sourceSelected)="onSourceSelected($event)" />
                </div>
              }
            }
          </div>

          <aside class="analysis-pane">
            @if (document()) {
              <section class="panel">
                <h2>Información</h2>
                <dl class="info-list">
                  <dt>Archivo</dt><dd>{{ document()!.originalName }}</dd>
                  <dt>Tamaño</dt><dd>{{ formatSize(document()!.size) }}</dd>
                  <dt>Páginas</dt><dd>{{ document()!.pageCount ?? '—' }}</dd>
                  <dt>Estado</dt><dd><app-status-badge [status]="document()!.status" /></dd>
                  @if (document()!.job; as job) {
                    <dt>Procesamiento</dt>
                    <dd>
                      <app-status-badge [status]="job.status" /> · intento {{ job.attempts }}
                      @if (job.failReason) {
                        <span class="error">{{ job.failReason }}</span>
                      }
                    </dd>
                  }
                  <dt>Subido</dt><dd>{{ formatDate(document()!.createdAt) }}</dd>
                </dl>
                @if (document()!.status === 'FAILED' && document()!.errorMessage) {
                  <p class="error">{{ document()!.errorMessage }}</p>
                }
              </section>
            }

            <section class="panel">
              <h2>Análisis IA</h2>
              @if (loadingAnalysis()) {
                <p class="muted">Cargando análisis…</p>
              } @else if (analysis()) {
                @if (analysis()!.status === 'FAILED') {
                  <p class="error">{{ analysis()!.errorMessage }}</p>
                } @else {
                  <p class="analysis-summary">{{ analysis()!.summary }}</p>
                  <p class="meta">
                    <span class="type">{{ typeLabel(analysis()!.documentType) }}</span>
                    · Confidencia: {{ analysis()!.confidence }}%
                    ({{ confidenceLabel(analysis()!.confidence) }})
                    @if (analysis()!.truncated) {
                      · <span class="warn">Texto truncado al analizar</span>
                    }
                  </p>
                  @if (keyEntries(analysis()!).length > 0) {
                    <table class="key-info">
                      @for (entry of keyEntries(analysis()!); track entry[0]) {
                        @if (isObjectList(entry[1])) {
                          <tr>
                            <td>{{ keyLabel(entry[0]) }}</td>
                            <td>
                              @for (item of objectList(entry[1]); track $index) {
                                <div class="key-item">
                                  @for (sub of itemEntries(item); track sub[0]) {
                                    <span class="key-sub"><strong>{{ keyLabel(sub[0]) }}:</strong> {{ sub[1] }}</span>
                                  }
                                </div>
                              }
                            </td>
                          </tr>
                        } @else {
                          <tr>
                            <td>{{ keyLabel(entry[0]) }}</td>
                            <td>{{ formatScalar(entry[1]) }}</td>
                          </tr>
                        }
                      }
                    </table>
                  }
                }
              } @else {
                <app-empty-state
                  title="Sin análisis"
                  message="Este documento aún no tiene análisis."
                />
              }
            </section>
          </aside>
        </div>
      }
    </section>
  `,
  styles: `
    .detail-header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }

    .detail-header h1 {
      margin: 0;
    }

    .muted {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .detail-layout {
      display: flex;
      gap: var(--space-5);
      align-items: flex-start;
    }

    .viewer-pane {
      flex: 1;
      min-width: 0;
    }

    .view-tabs {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .view-tabs .btn {
      border-radius: var(--radius-full);
    }

    .view-tabs .btn.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .pdf-host {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      height: 72vh;
    }

    .chat-host {
      height: 72vh;
    }

    .analysis-pane {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .panel {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      box-shadow: var(--shadow-sm);
    }

    .panel h2 {
      margin: 0 0 var(--space-3);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .info-list {
      margin: 0;
      font-size: var(--text-sm);
    }

    .info-list dt {
      font-weight: var(--weight-semibold);
      color: var(--color-text-muted);
      margin-top: var(--space-2);
    }

    .info-list dd {
      margin: 0;
      word-break: break-word;
    }

    .analysis-summary {
      background: var(--color-surface-muted);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      font-size: var(--text-sm);
      line-height: var(--leading-base);
    }

    .type {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      background: var(--color-status-queued-bg);
      color: var(--color-status-queued-fg);
    }

    .meta {
      margin: var(--space-2) 0;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .warn {
      color: var(--color-warning);
    }

    .key-info {
      width: 100%;
      border-collapse: collapse;
      margin-top: var(--space-4);
      font-size: var(--text-sm);
    }

    .key-info td {
      border: 1px solid var(--color-border);
      padding: 0.5rem 0.75rem;
      text-align: left;
    }

    .key-info td:first-child {
      width: 40%;
      background: var(--color-surface-muted);
      color: var(--color-text-muted);
      font-weight: var(--weight-semibold);
    }

    .key-item {
      padding: 0.25rem 0;
    }

    .key-item + .key-item {
      border-top: 1px solid var(--color-border);
    }

    .key-sub {
      display: block;
      font-size: var(--text-sm);
    }

    .page-block {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .page-block h3 {
      margin: 0 0 var(--space-2);
      font-size: var(--text-sm);
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      line-height: var(--leading-base);
    }

    @media (max-width: 900px) {
      .detail-layout {
        flex-direction: column;
      }

      .analysis-pane {
        width: 100%;
      }
    }
  `,
})
export class DocumentDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documentsService = inject(DocumentsService);

  readonly document = signal<Document | null>(null);
  readonly pages = signal<DocumentPage[]>([]);
  readonly analysis = signal<DocumentAnalysis | null>(null);
  readonly error = signal<string | null>(null);

  readonly loadingDocument = signal(true);
  readonly loadingPages = signal(true);
  readonly loadingAnalysis = signal(false);

  readonly pdfBlob = signal<Blob | null>(null);
  readonly pdfLoading = signal(false);
  readonly pdfError = signal<string | null>(null);
  readonly pdfNavigateTarget = signal<{ pageNumber: number; text: string } | null>(null);
  readonly viewMode = signal<'pdf' | 'text' | 'chat'>('pdf');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.documentsService.getOne(id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.loadingDocument.set(false);
        this.loadPdf(document);
        if (document.status === 'COMPLETED') {
          this.loadingAnalysis.set(true);
          this.documentsService.getAnalysis(id).subscribe({
            next: (analysis) => {
              this.analysis.set(analysis);
              this.loadingAnalysis.set(false);
            },
            error: () => this.loadingAnalysis.set(false),
          });
        }
      },
      error: () => {
        this.error.set('No se pudo cargar el documento');
        this.loadingDocument.set(false);
      },
    });

    this.documentsService.getPages(id).subscribe({
      next: (pages) => {
        this.pages.set(pages);
        this.loadingPages.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las páginas');
        this.loadingPages.set(false);
      },
    });
  }

  download(): void {
    const doc = this.document();
    if (!doc) return;
    this.documentsService.download(doc).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.originalName;
        link.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  switchView(mode: 'pdf' | 'text' | 'chat'): void {
    this.viewMode.set(mode);
    this.pdfNavigateTarget.set(null);
  }

  onSourceSelected(target: { pageNumber: number; text: string }): void {
    this.pdfNavigateTarget.set(target);
    this.viewMode.set('pdf');
  }

  private loadPdf(document: Document): void {
    this.pdfLoading.set(true);
    this.pdfError.set(null);
    this.documentsService.download(document).subscribe({
      next: (blob) => {
        this.pdfBlob.set(blob);
        this.pdfLoading.set(false);
      },
      error: () => {
        this.pdfError.set('No se pudo cargar el PDF');
        this.pdfLoading.set(false);
      },
    });
  }

  typeLabel(type: string | null): string {
    switch (type) {
      case 'invoice':
        return 'Factura';
      case 'resume':
        return 'Currículum';
      case 'contract':
        return 'Contrato';
      case 'generic':
        return 'Documento genérico';
      default:
        return type ?? 'Desconocido';
    }
  }

  confidenceLabel(confidence: number | null): string {
    if (confidence === null) return 'desconocida';
    if (confidence >= 80) return 'alta';
    if (confidence >= 50) return 'media';
    return 'baja';
  }

  keyEntries(analysis: DocumentAnalysis): [string, unknown][] {
    return Object.entries(analysis.keyInfo ?? {}).filter(
      ([, value]) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0),
    );
  }

  isObjectList(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object';
  }

  objectList(value: unknown): object[] {
    return Array.isArray(value) ? (value as object[]) : [];
  }

  itemEntries(item: unknown): [string, unknown][] {
    return Object.entries(item as Record<string, unknown>).filter(
      ([, value]) => value !== null && value !== '',
    );
  }

  formatScalar(value: unknown): string {
    if (Array.isArray(value)) {
      return (value as unknown[]).map(String).join(', ');
    }
    return String(value);
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  keyLabel(key: string): string {
    const labels: Record<string, string> = {
      invoiceNumber: 'Nº factura',
      date: 'Fecha',
      supplier: 'Proveedor',
      customer: 'Cliente',
      subtotal: 'Subtotal',
      tax: 'Impuestos',
      total: 'Total',
      currency: 'Moneda',
      fullName: 'Nombre',
      email: 'Email',
      skills: 'Habilidades',
      experience: 'Experiencia',
      education: 'Educación',
      company: 'Empresa',
      role: 'Rol',
      institution: 'Institución',
      degree: 'Título',
      year: 'Año',
      parties: 'Partes',
      startDate: 'Fecha inicio',
      endDate: 'Fecha fin',
      paymentTerms: 'Términos de pago',
      terminationConditions: 'Condiciones de terminación',
    };
    return labels[key] ?? key;
  }
}