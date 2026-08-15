import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Document, DocumentPage, DocumentsService } from '../../documents/documents.service';

@Component({
  selector: 'app-document-detail-page',
  imports: [RouterLink],
  template: `
    <section class="page detail">
      <a routerLink="/documents" class="back">← Mis documentos</a>

      @if (document()) {
        <header>
          <h1>{{ document()!.name }}</h1>
          <p class="meta">
            {{ document()!.originalName }}
            @if (document()!.pageCount) { · {{ document()!.pageCount }} páginas }
            @if (document()!.title) { · {{ document()!.title }} }
            @if (document()!.author) { · {{ document()!.author }} }
          </p>
          <span class="status" [class]="statusClass(document()!.status)">{{ statusLabel(document()!.status) }}</span>
          @if (document()!.status === 'FAILED' && document()!.errorMessage) {
            <p class="error">{{ document()!.errorMessage }}</p>
          }
        </header>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <h2>Páginas</h2>
      @if (pages().length === 0 && !error()) {
        <p class="empty">Este documento aún no tiene texto extraído.</p>
      }
      @for (page of pages(); track page.pageNumber) {
        <article class="page-block">
          <h3>Página {{ page.pageNumber }}</h3>
          <pre>{{ page.text || 'Sin texto' }}</pre>
        </article>
      }
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
      margin-bottom: 1.5rem;
    }

    .detail h1 {
      margin: 0 0 0.25rem;
    }

    .detail .meta {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      color: #777;
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
  `,
})
export class DocumentDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly documentsService = inject(DocumentsService);

  readonly document = signal<Document | null>(null);
  readonly pages = signal<DocumentPage[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.documentsService.getOne(id).subscribe({
      next: (document) => this.document.set(document),
      error: () => this.error.set('No se pudo cargar el documento'),
    });

    this.documentsService.getPages(id).subscribe({
      next: (pages) => this.pages.set(pages),
      error: () => this.error.set('No se pudieron cargar las páginas'),
    });
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
