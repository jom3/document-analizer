import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../components/empty-state/empty-state.component';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { Document, DocumentsService, SearchResultItem } from '../../documents/documents.service';

const LIMIT = 10;

@Component({
  selector: 'app-documents-page',
  imports: [RouterLink, StatusBadgeComponent, EmptyStateComponent],
  template: `
    <section class="page documents">
      <h1>Mis documentos</h1>

      <div class="card upload">
        <div
          class="file-picker"
          [class.is-dragging]="dragging()"
          role="button"
          tabindex="0"
          (click)="openFilePicker()"
          (keydown.enter)="openFilePicker()"
          (keydown.space)="openFilePicker()"
          (dragenter)="onDragEnter($event)"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          <input
            #fileInput
            type="file"
            class="file-input"
            (change)="onFileChange($event)"
            accept=".pdf,application/pdf"
          />

          @if (selectedFile()) {
            <div class="file-info">
              <span class="file-name">{{ selectedFile()!.name }}</span>
              <span class="file-size">{{ formatSize(selectedFile()!.size) }}</span>
              <button type="button" class="btn btn-ghost file-clear" (click)="clearFile($event)">Quitar</button>
            </div>
          } @else {
            <div class="file-placeholder">
              <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <strong>Elegí un archivo PDF</strong>
              <span class="file-hint">o arrastrá y soltalo acá</span>
            </div>
          }
        </div>

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

        <button type="button" class="btn btn-primary" (click)="onSubmit()" [disabled]="submitting() || !canUpload()">
          {{ submitting() ? 'Subiendo…' : 'Subir' }}
        </button>
      </div>

      <div class="search">
        <input type="text" placeholder="Buscar en tus documentos…" [value]="searchQuery()" (input)="onSearchQueryChange($event)" (keyup.enter)="onSearch()" />
        <button type="button" class="btn btn-primary" (click)="onSearch()" [disabled]="searching() || !searchQuery().trim()">
          {{ searching() ? 'Buscando…' : 'Buscar' }}
        </button>
      </div>

      @if (searchError()) {
        <p class="error">{{ searchError() }}</p>
      }

      @if (searchResults().length > 0) {
        <div class="table-wrap">
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
        </div>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      @if (documents().length === 0) {
        <app-empty-state
          title="Sin documentos"
          message="Subí tu primer documento para empezar."
          [actions]="true"
        >
          <button type="button" class="btn btn-primary" (click)="openFilePicker()">
            Subir un documento
          </button>
        </app-empty-state>
      } @else {
        <div class="table-wrap">
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
                    <div class="doc-cell">
                      <span class="doc-name">{{ doc.name }}</span>
                      @if (doc.title || doc.author) {
                        <span class="doc-meta">{{ doc.title ?? '—' }}{{ doc.author ? ' · ' + doc.author : '' }}</span>
                      }
                    </div>
                    @if (doc.status === 'FAILED' && doc.errorMessage) {
                      <p class="error doc-error">{{ doc.errorMessage }}</p>
                    }
                  </td>
                  <td>{{ formatSize(doc.size) }}</td>
                  <td>{{ doc.pageCount ?? '—' }}</td>
                  <td><app-status-badge [status]="doc.status" /></td>
                  <td>{{ formatDate(doc.createdAt) }}</td>
                  <td class="actions">
                    <a class="view" routerLink="/documents/{{ doc.id }}">Ver páginas</a>
                    <button class="btn btn-secondary" (click)="download(doc)">Descargar</button>
                    <button class="btn btn-danger" (click)="remove(doc)">Eliminar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <button class="btn btn-secondary" (click)="previous()" [disabled]="page() <= 1">Anterior</button>
          <span>Página {{ page() }} de {{ totalPages() }}</span>
          <button class="btn btn-secondary" (click)="next()" [disabled]="page() >= totalPages()">Siguiente</button>
        </div>
      }
    </section>
  `,
  styles: `
    .documents h1 {
      margin: 0 0 var(--space-4);
    }

    .documents .upload {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .documents .checkbox {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .documents .file-picker {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-5);
      border: 1.5px dashed var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface-muted);
      cursor: pointer;
      transition:
        border-color var(--motion-fast),
        background var(--motion-fast);
    }

    .documents .file-picker:hover,
    .documents .file-picker.is-dragging {
      border-color: var(--color-primary);
    }

    .documents .file-picker.is-dragging {
      background: var(--color-highlight-soft);
    }

    .documents .file-picker:focus-within {
      outline: 2px solid var(--color-highlight);
      outline-offset: 2px;
    }

    .documents .file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .documents .file-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      color: var(--color-text-muted);
    }

    .documents .file-placeholder strong {
      color: var(--color-text);
      font-weight: var(--weight-medium);
    }

    .documents .file-icon {
      width: 2.25rem;
      height: 2.25rem;
      color: var(--color-primary);
      margin-bottom: var(--space-1);
    }

    .documents .file-hint {
      font-size: var(--text-xs);
    }

    .documents .file-info {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
    }

    .documents .file-name {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .documents .file-size {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .documents .file-clear {
      margin-left: auto;
    }

    .documents .search {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .documents .search input {
      flex: 1;
    }

    .documents .table-wrap {
      overflow-x: auto;
      border-radius: var(--radius-lg);
    }

    .documents table {
      width: 100%;
      border-collapse: collapse;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .documents th,
    .documents td {
      padding: 0.6rem 0.75rem;
      text-align: left;
      font-size: var(--text-sm);
      border-bottom: 1px solid var(--color-border);
    }

    .documents th {
      background: var(--color-surface-muted);
      font-weight: var(--weight-semibold);
      color: var(--color-text-muted);
    }

    .documents tbody tr:last-child td {
      border-bottom: none;
    }

    .documents .actions {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
      align-items: center;
      white-space: nowrap;
    }

    .documents .actions .view {
      color: var(--color-primary);
      font-size: var(--text-sm);
    }

    .documents .actions .btn {
      padding: 0.3rem 0.6rem;
      font-size: var(--text-xs);
    }

    .documents .pagination {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      margin-top: var(--space-4);
    }

    .documents .pagination span {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .documents .doc-cell {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      max-width: 360px;
      min-width: 0;
    }

    .documents .doc-name,
    .documents .doc-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .documents .doc-meta {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .documents .doc-error {
      margin: 0.25rem 0 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class DocumentsPage implements OnInit, OnDestroy {
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
  readonly dragging = signal(false);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / LIMIT)));

  readonly canUpload = computed(() => {
    if (!this.selectedFile()) return false;
    if (!this.keepOriginalName() && !this.customName().trim()) return false;
    return true;
  });

  private pollingTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.load();
    this.pollingTimer = setInterval(() => this.poll(), 3000);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
  }

  private poll(): void {
    const pending = this.documents().some(
      (doc) => doc.status === 'QUEUED' || doc.status === 'PROCESSING',
    );
    if (pending) {
      this.load();
    }
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
    this.setFile(input.files?.[0] ?? null);
  }

  setFile(file: File | null): void {
    this.selectedFile.set(file);
    this.uploadError.set(null);
    this.successMessage.set(null);
  }

  clearFile(event: Event): void {
    event.stopPropagation();
    this.setFile(null);
    if (this.fileInput()?.nativeElement) {
      this.fileInput()!.nativeElement.value = '';
    }
  }

  openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.setFile(file);
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
}