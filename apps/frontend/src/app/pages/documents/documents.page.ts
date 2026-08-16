import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Document, DocumentsService, SearchResultItem } from '../../documents/documents.service';

const LIMIT = 10;

@Component({
  selector: 'app-documents-page',
  imports: [RouterLink],
  template: `
    <section class="page documents">
      <a routerLink="/dashboard" class="back">← Volver</a>
      <h1>Mis documentos</h1>

      <div class="upload">
        <label>
          Archivo
          <input #fileInput type="file" (change)="onFileChange($event)" accept=".pdf,application/pdf" />
        </label>

        <label class="checkbox">
          <input type="checkbox" [checked]="keepOriginalName()" (change)="onKeepOriginalNameChange($event)" />
          Conservar nombre original
        </label>

        @if (!keepOriginalName()) {
          <label>
            Nombre
            <input type="text" [value]="customName()" (input)="onNameChange($event)" maxlength="30" />
          </label>
        }

        @if (uploadError()) {
          <p class="error">{{ uploadError() }}</p>
        }

        @if (successMessage()) {
          <p class="success">{{ successMessage() }}</p>
        }

        <button type="button" (click)="onSubmit()" [disabled]="submitting() || !canUpload()">
          {{ submitting() ? 'Subiendo…' : 'Subir' }}
        </button>
      </div>

      <div class="search">
        <input type="text" placeholder="Buscar en tus documentos…" [value]="searchQuery()" (input)="onSearchQueryChange($event)" (keyup.enter)="onSearch()" />
        <button type="button" (click)="onSearch()" [disabled]="searching() || !searchQuery().trim()">
          {{ searching() ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>

      @if (searchError()) {
        <p class="error">{{ searchError() }}</p>
      }

      @if (searchResults().length > 0) {
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Página</th>
              <th>Fragmento</th>
              <th>Similitud</th>
            </tr>
          </thead>
          <tbody>
            @for (result of searchResults(); track result.chunkId) {
              <tr>
                <td>{{ result.documentName }}</td>
                <td>{{ result.pageNumber }}</td>
                <td>{{ result.text }}</td>
                <td>{{ formatScore(result.score) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tamaño</th>
            <th>Páginas</th>
            <th>Estado</th>
            <th>Subido</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (doc of documents(); track doc.id) {
            <tr>
              <td>
                {{ doc.name }}
                @if (doc.title || doc.author) {
                  <p class="meta">
                    {{ doc.title ?? '—' }}{{ doc.author ? ' · ' + doc.author : '' }}
                  </p>
                }
                @if (doc.status === 'FAILED' && doc.errorMessage) {
                  <p class="error">{{ doc.errorMessage }}</p>
                }
              </td>
              <td>{{ formatSize(doc.size) }}</td>
              <td>{{ doc.pageCount ?? '—' }}</td>
              <td><span class="status" [class]="statusClass(doc.status)">{{ statusLabel(doc.status) }}</span></td>
              <td>{{ formatDate(doc.createdAt) }}</td>
              <td class="actions">
                <a class="view" routerLink="/documents/{{ doc.id }}">Ver páginas</a>
                <button (click)="download(doc)">Descargar</button>
                <button class="danger" (click)="remove(doc)">Eliminar</button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="empty">No hay documentos todavía</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="pagination">
        <button (click)="previous()" [disabled]="page() <= 1">Anterior</button>
        <span>Página {{ page() }} de {{ totalPages() }}</span>
        <button (click)="next()" [disabled]="page() >= totalPages()">Siguiente</button>
      </div>
    </section>
  `,
  styles: `
    .documents .back {
      display: inline-block;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #1a73e8;
      text-decoration: none;
    }

    .documents .upload {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      margin-bottom: 1rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
    }

    .documents label {
      font-size: 0.875rem;
    }

    .documents input[type='text'] {
      width: 100%;
      padding: 0.5rem 0.6rem;
      margin-top: 0.25rem;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 1rem;
    }

    .documents .search {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .documents .search input {
      flex: 1;
      padding: 0.5rem 0.6rem;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 1rem;
    }

    .documents .checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .documents button {
      padding: 0.5rem 0.75rem;
      border: none;
      border-radius: 6px;
      background: #1a73e8;
      color: #fff;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .documents button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .documents button.danger {
      background: #b00020;
    }

    .documents table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
    }

    .documents th,
    .documents td {
      padding: 0.6rem;
      text-align: left;
      font-size: 0.875rem;
      border-bottom: 1px solid #eee;
    }

    .documents th {
      background: #f5f6f8;
      font-weight: 600;
    }

    .documents .actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      align-items: center;
    }

    .documents .actions .view {
      font-size: 0.875rem;
      color: #1a73e8;
      text-decoration: none;
    }

    .documents .empty {
      text-align: center;
      color: #777;
      padding: 1.5rem;
    }

    .documents .pagination {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
    }

    .documents .pagination span {
      font-size: 0.875rem;
    }

    .documents .error {
      color: #b00020;
      font-size: 0.875rem;
    }

    .documents .meta {
      margin: 0.25rem 0 0;
      font-size: 0.75rem;
      color: #777;
    }

    .documents .status {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: #e8eaed;
      color: #444;
    }

    .documents .status.completed {
      background: #e0f2e1;
      color: #0b6e0b;
    }

    .documents .status.failed {
      background: #fdecea;
      color: #b00020;
    }

    .documents .status.processing {
      background: #fff4e5;
      color: #8a5300;
    }

    .documents .success {
      color: #0b6e0b;
      font-size: 0.875rem;
    }
  `,
})
export class DocumentsPage implements OnInit {
  private readonly documentsService = inject(DocumentsService);

  readonly documents = signal<Document[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly error = signal<string | null>(null);

  readonly selectedFile = signal<File | null>(null);
  readonly keepOriginalName = signal(true);
  readonly customName = signal('');
  readonly submitting = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly searchResults = signal<SearchResultItem[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal<string | null>(null);

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / LIMIT)));

  readonly canUpload = computed(() => {
    if (!this.selectedFile()) return false;
    if (!this.keepOriginalName() && !this.customName().trim()) return false;
    return true;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set(null);
    this.documentsService.list(this.page(), LIMIT).subscribe({
      next: (result) => {
        this.documents.set(result.data);
        this.total.set(result.total);
      },
      error: () => this.error.set('No se pudieron cargar los documentos'),
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
    this.uploadError.set(null);
    this.successMessage.set(null);
  }

  onKeepOriginalNameChange(event: Event): void {
    this.keepOriginalName.set((event.target as HTMLInputElement).checked);
  }

  onNameChange(event: Event): void {
    this.customName.set((event.target as HTMLInputElement).value);
  }

  onSearchQueryChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onSearch(): void {
    const query = this.searchQuery().trim();
    if (!query) return;

    this.searching.set(true);
    this.searchError.set(null);
    this.documentsService.search(query).subscribe({
      next: (results) => {
        this.searching.set(false);
        this.searchResults.set(results);
      },
      error: () => {
        this.searching.set(false);
        this.searchError.set('No se pudo realizar la búsqueda');
      },
    });
  }

  formatScore(score: number): string {
    return `${(score * 100).toFixed(1)}%`;
  }

  onSubmit(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.submitting.set(true);
    this.uploadError.set(null);

    this.documentsService
      .upload(file, {
        keepOriginalName: this.keepOriginalName(),
        name: this.customName().trim(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.selectedFile.set(null);
          this.customName.set('');
          this.successMessage.set('Documento subido correctamente');
          this.fileInput()?.nativeElement && (this.fileInput()!.nativeElement.value = '');
          this.page.set(1);
          this.load();
        },
        error: (err) => {
          this.submitting.set(false);
          this.uploadError.set(err.error?.message ?? 'Error al subir el documento');
        },
      });
  }

  download(doc: Document): void {
    this.documentsService.download(doc).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.originalName;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('No se pudo descargar el documento'),
    });
  }

  remove(doc: Document): void {
    this.documentsService.remove(doc.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('No se pudo eliminar el documento'),
    });
  }

  previous(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.load();
    }
  }

  next(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.load();
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
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
