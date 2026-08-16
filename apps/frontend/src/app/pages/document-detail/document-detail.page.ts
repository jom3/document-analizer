import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  imports: [RouterLink, PdfViewerComponent, DocumentChatComponent],
  template: `
    <section class="page detail">
      <a routerLink="/documents" class="back">← Mis documentos</a>

      @if (document()) {
        <header>
          <h1>{{ document()!.name }}</h1>
          <span class="status" [class]="statusClass(document()!.status)">{{ statusLabel(document()!.status) }}</span>
        </header>
      } @else if (loadingDocument()) {
        <p class="empty">Cargando documento…</p>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <div class="detail-layout">
        <div class="viewer-pane">
          <div class="view-tabs">
            <button type="button" [class.active]="viewMode() === 'pdf'" (click)="viewMode.set('pdf')">Ver PDF</button>
            <button type="button" [class.active]="viewMode() === 'text'" (click)="viewMode.set('text')">Texto extraído</button>
            <button type="button" [class.active]="viewMode() === 'chat'" (click)="viewMode.set('chat')">Chat</button>
          </div>

          @if (viewMode() === 'pdf') {
            <div class="pdf-host">
              @if (pdfLoading()) {
                <p class="empty">Cargando PDF…</p>
              } @else if (pdfError()) {
                <p class="error">{{ pdfError() }}</p>
              } @else {
                <app-pdf-viewer [pdfBlob]="pdfBlob()" (downloadRequested)="download()" />
              }
            </div>
          } @else if (viewMode() === 'text') {
            @if (pages().length === 0) {
              @if (loadingPages()) {
                <p class="empty">Cargando texto…</p>
              } @else {
                <p class="empty">Este documento aún no tiene texto extraído.</p>
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
                <app-document-chat [documentId]="document()!.id" />
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
                <dt>Estado</dt><dd>{{ statusLabel(document()!.status) }}</dd>
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
              <p class="empty">Cargando análisis…</p>
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
              <p class="empty">Este documento aún no tiene análisis.</p>
            }
          </section>
        </aside>
      </div>
    </section>
  `,
  styles: `
    .detail .back {
      display: inline-block;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #1a73e8;
      text-decoration: none;
    }

    .detail header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .detail h1 {
      margin: 0;
    }

    .detail .status {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: #e8eaed;
      color: #444;
    }

    .detail .status.completed {
      background: #e0f2e1;
      color: #0b6e0b;
    }

    .detail .status.failed {
      background: #fdecea;
      color: #b00020;
    }

    .detail .status.processing {
      background: #fff4e5;
      color: #8a5300;
    }

    .detail .error {
      color: #b00020;
      font-size: 0.875rem;
    }

    .detail .empty {
      color: #777;
      font-size: 0.875rem;
    }

    .detail .detail-layout {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }

    .detail .viewer-pane {
      flex: 1;
      min-width: 0;
    }

    .detail .view-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .detail .view-tabs button {
      padding: 0.4rem 1rem;
      border: 1px solid #ccc;
      border-radius: 999px;
      background: #fff;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .detail .view-tabs button.active {
      background: #1a73e8;
      border-color: #1a73e8;
      color: #fff;
    }

    .detail .pdf-host {
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
      height: 72vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .detail .chat-host {
      height: 72vh;
    }

    .detail .analysis-pane {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .detail .panel {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 1rem;
    }

    .detail .panel h2 {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #555;
    }

    .detail .info-list {
      margin: 0;
      font-size: 0.8125rem;
    }

    .detail .info-list dt {
      font-weight: 600;
      color: #555;
      margin-top: 0.4rem;
    }

    .detail .info-list dd {
      margin: 0;
      word-break: break-word;
    }

    .detail .analysis-summary {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 1rem;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .detail .type {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: #e8f0fe;
      color: #1a73e8;
    }

    .detail .meta {
      margin: 0.5rem 0;
      font-size: 0.875rem;
      color: #777;
    }

    .detail .warn {
      color: #8a5300;
    }

    .detail .key-info {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.875rem;
    }

    .detail .key-info td {
      border: 1px solid #ddd;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }

    .detail .key-info td:first-child {
      width: 40%;
      background: #f7f7f7;
      color: #555;
      font-weight: 600;
    }

    .detail .key-item {
      padding: 0.25rem 0;
    }

    .detail .key-item + .key-item {
      border-top: 1px solid #eee;
    }

    .detail .key-sub {
      display: block;
      font-size: 0.8125rem;
    }

    .detail .page-block {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .detail .page-block h3 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
    }

    .detail pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    @media (max-width: 900px) {
      .detail .detail-layout {
        flex-direction: column;
      }

      .detail .analysis-pane {
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

  statusLabel(status: string): string {
    switch (status) {
      case 'UPLOADED':
        return 'Subido';
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
}
