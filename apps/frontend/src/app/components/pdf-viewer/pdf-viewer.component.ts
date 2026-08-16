import { Component, ElementRef, OnDestroy, computed, effect, input, output, signal, viewChild } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.min.mjs';

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

@Component({
  selector: 'app-pdf-viewer',
  imports: [],
  template: `
    <div class="pdf-viewer">
      <div class="toolbar">
        <button type="button" class="toolbar-btn" (click)="previousPage()" [disabled]="currentPage() <= 1" aria-label="Página anterior">‹</button>
        <span class="page-indicator">
          <input
            type="number"
            class="page-input"
            [value]="currentPage()"
            (change)="goToPage($event)"
            [disabled]="loading() || pageCount() === 0"
            aria-label="Página actual"
            min="1"
            [max]="pageCount()"
          />
          <span>/ {{ pageCount() }}</span>
        </span>
        <button type="button" class="toolbar-btn" (click)="nextPage()" [disabled]="currentPage() >= pageCount()" aria-label="Página siguiente">›</button>
        <span class="separator"></span>
        <button type="button" class="toolbar-btn" (click)="zoomOut()" aria-label="Alejar">−</button>
        <span class="zoom-level">{{ zoomPercent() }}%</span>
        <button type="button" class="toolbar-btn" (click)="zoomIn()" aria-label="Acercar">+</button>
        <button type="button" class="toolbar-btn" (click)="fitWidth()" [disabled]="!pdfBlob() || loading()">Ajustar ancho</button>
        <span class="separator"></span>
        <button type="button" class="toolbar-btn" (click)="downloadRequested.emit()" [disabled]="!pdfBlob() || loading()">Descargar</button>
      </div>
      <div class="canvas-container" #container>
        @if (loading()) {
          <p class="viewer-state">Cargando PDF…</p>
        } @else if (error()) {
          <p class="viewer-state error">{{ error() }}</p>
        } @else if (pdfBlob()) {
          <div class="pdf-frame">
            <canvas #canvas></canvas>
            <div class="pdf-overlay" #overlay></div>
          </div>
        } @else {
          <p class="viewer-state">Sin PDF para mostrar</p>
        }
      </div>
    </div>
  `,
  styles: `
    .pdf-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #fff;
      border-bottom: 1px solid #ddd;
    }

    .toolbar-btn {
      padding: 0.25rem 0.75rem;
      border: 1px solid #ccc;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .toolbar-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .page-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: #555;
    }

    .page-input {
      width: 3.5rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 0.875rem;
      text-align: center;
    }

    .zoom-level {
      min-width: 3rem;
      text-align: center;
      font-size: 0.875rem;
      color: #555;
    }

    .separator {
      flex: 1;
    }

    .canvas-container {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 1rem;
      background: #f2f2f2;
    }

    .canvas-container canvas {
      box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
      background: #fff;
    }

    .pdf-frame {
      position: relative;
      line-height: 0;
    }

    .pdf-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .pdf-overlay .highlight {
      position: absolute;
      background: rgb(255 213 79 / 45%);
      border-radius: 2px;
    }

    .viewer-state {
      margin: auto;
      color: #777;
      font-size: 0.875rem;
    }

    .viewer-state.error {
      color: #b00020;
    }
  `,
})
export class PdfViewerComponent implements OnDestroy {
  readonly pdfBlob = input<Blob | null>(null);
  readonly navigateTo = input<{ pageNumber: number; text: string } | null>(null);
  readonly downloadRequested = output<void>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly overlay = viewChild<ElementRef<HTMLDivElement>>('overlay');

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pageCount = signal(0);
  readonly currentPage = signal(1);
  readonly scale = signal(1);
  readonly zoomPercent = computed(() => Math.round(this.scale() * 100));
  readonly highlight = signal<{ pageNumber: number; text: string } | null>(null);
  private readonly renderedPage = signal<number | null>(null);
  private highlightVersion = 0;

  private readonly documentSignal = signal<pdfjsLib.PDFDocumentProxy | null>(null);
  private renderTask: pdfjsLib.RenderTask | null = null;

  private readonly loadEffect = effect(() => {
    void this.loadPdf(this.pdfBlob());
  });

  private readonly renderEffect = effect(() => {
    const doc = this.documentSignal();
    const page = this.currentPage();
    const scale = this.scale();
    if (doc && !this.loading()) {
      void this.renderPage();
    }
  });

  private readonly navigateEffect = effect(() => {
    const target = this.navigateTo();
    if (!target) {
      this.highlight.set(null);
      return;
    }
    this.highlight.set({ pageNumber: target.pageNumber, text: target.text });
    if (this.currentPage() !== target.pageNumber) {
      this.currentPage.set(target.pageNumber);
      void this.fitWidthScale().then((scale) => {
        if (this.currentPage() === target.pageNumber) {
          this.scale.set(scale);
        }
      });
    }
  });

  private readonly highlightEffect = effect(() => {
    const highlight = this.highlight();
    const page = this.currentPage();
    const scale = this.scale();
    if (highlight && page === highlight.pageNumber && this.renderedPage() === page) {
      void this.applyHighlight(highlight, scale);
    } else {
      this.clearHighlight();
    }
  });

  private async applyHighlight(
    highlight: { pageNumber: number; text: string },
    scale: number,
  ): Promise<void> {
    const highlightVersion = ++this.highlightVersion;
    this.clearHighlight();
    const doc = this.documentSignal();
    if (!doc) return;
    const page = await doc.getPage(highlight.pageNumber);
    const content = await page.getTextContent();
    if (this.highlightVersion !== highlightVersion || this.currentPage() !== highlight.pageNumber) {
      return;
    }

    const items = content.items.filter((item) => 'str' in item) as PdfTextItem[];

    const { text, itemOffsets } = this.buildNormalizedText(items);
    const fragment = this.normalizeText(highlight.text);
    const match = this.findMatch(text, fragment);
    if (!match) return;

    const viewport = page.getViewport({ scale });
    const rects: HighlightRect[] = [];
    for (let index = 0; index < itemOffsets.length; index++) {
      const offset = itemOffsets[index];
      if (offset.end <= match.start || offset.start >= match.end) {
        continue;
      }
      const overlapStart = Math.max(offset.start, match.start);
      const overlapEnd = Math.min(offset.end, match.end);
      const item = items[index];
      const full = this.itemRect(item, viewport);
      if (!full) continue;
      const itemLength = offset.end - offset.start;
      if (itemLength <= 0) continue;
      const fractionStart = (overlapStart - offset.start) / itemLength;
      const fractionEnd = (overlapEnd - offset.start) / itemLength;
      rects.push({
        left: full.left + full.width * fractionStart,
        top: full.top,
        width: full.width * (fractionEnd - fractionStart),
        height: full.height,
      });
    }

    this.drawHighlightRects(rects);
  }

  private buildNormalizedText(
    items: PdfTextItem[],
  ): { text: string; itemOffsets: { start: number; end: number }[] } {
    let text = '';
    const itemOffsets: { start: number; end: number }[] = [];
    for (const item of items) {
      const normalized = this.normalizeText(item.str);
      if (!normalized) {
        itemOffsets.push({ start: text.length, end: text.length });
        continue;
      }
      if (text.length > 0) {
        text += ' ';
      }
      const start = text.length;
      text += normalized;
      itemOffsets.push({ start, end: text.length });
    }
    return { text, itemOffsets };
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private findMatch(
    text: string,
    fragment: string,
  ): { start: number; end: number } | null {
    if (!fragment) return null;
    const minLength = Math.min(30, fragment.length);
    for (let length = fragment.length; length >= minLength; length--) {
      const prefix = fragment.slice(0, length);
      const index = text.indexOf(prefix);
      if (index !== -1) {
        return { start: index, end: index + length };
      }
    }
    return null;
  }

  private itemRect(
    item: PdfTextItem,
    viewport: pdfjsLib.PageViewport,
  ): { left: number; top: number; width: number; height: number } | null {
    const [a, b, c, d, e, f] = item.transform;
    const advanceLength = Math.hypot(a, b);
    if (advanceLength === 0) {
      return null;
    }
    const ax = a / advanceLength;
    const ay = b / advanceLength;
    const ux = -ay;
    const uy = ax;
    const base = [
      [e, f],
      [e + ax * item.width, f + ay * item.width],
    ];
    const top = base.map(([x, y]) => [x + ux * item.height, y + uy * item.height]);
    const corners = [...base, ...top];
    const points = corners.map(([x, y]) => viewport.convertToViewportPoint(x, y));
    const lefts = points.map((p) => p[0]);
    const tops = points.map((p) => p[1]);
    const minX = Math.min(...lefts);
    const maxX = Math.max(...lefts);
    const minY = Math.min(...tops);
    const maxY = Math.max(...tops);
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }

  private drawHighlightRects(rects: HighlightRect[]): void {
    const overlay = this.overlay()?.nativeElement;
    if (!overlay) return;
    overlay.querySelectorAll('.highlight').forEach((node) => node.remove());
    for (const rect of rects) {
      const div = document.createElement('div');
      div.className = 'highlight';
      div.style.left = `${rect.left}px`;
      div.style.top = `${rect.top}px`;
      div.style.width = `${rect.width}px`;
      div.style.height = `${rect.height}px`;
      overlay.appendChild(div);
    }
  }

  private clearHighlight(): void {
    const overlay = this.overlay()?.nativeElement;
    if (!overlay) return;
    overlay.querySelectorAll('.highlight').forEach((node) => node.remove());
  }

  private async loadPdf(blob: Blob | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.renderedPage.set(null);
    // Diferir el resto tras un await para que el effect no trackee
    // lecturas de documentSignal() (evita el bucle crear/destruir).
    await Promise.resolve();
    await this.destroyCurrentDocument();
    if (!blob) {
      this.pageCount.set(0);
      this.currentPage.set(1);
      this.loading.set(false);
      return;
    }
    try {
      const data = await blob.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data }).promise;
      this.documentSignal.set(doc);
      this.pageCount.set(doc.numPages);
      this.currentPage.set(1);
      this.scale.set(await this.fitWidthScale());
    } catch {
      this.error.set('No se pudo cargar el PDF');
    } finally {
      this.loading.set(false);
    }
  }

  private async destroyCurrentDocument(): Promise<void> {
    const current = this.documentSignal();
    if (!current) return;
    this.renderTask?.cancel();
    this.renderTask = null;
    await current.loadingTask.destroy();
    this.documentSignal.set(null);
  }

  private async fitWidthScale(): Promise<number> {
    const doc = this.documentSignal();
    if (!doc) return 1;
    const page = await doc.getPage(this.currentPage());
    const viewport = page.getViewport({ scale: 1 });
    const width = this.container()?.nativeElement.clientWidth ?? 600;
    return width / viewport.width;
  }

  private async renderPage(): Promise<void> {
    try {
      const doc = this.documentSignal();
      const pageNumber = this.currentPage();
      const scale = this.scale();
      if (!doc) return;
      const page = await doc.getPage(pageNumber);
      const canvas = this.canvas()?.nativeElement;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      this.cancelRender();
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.renderTask = page.render({ canvas, canvasContext: context, viewport });
      try {
        await this.renderTask.promise;
        this.renderedPage.set(pageNumber);
      } catch {
        // Render cancelado al cambiar de página o de zoom.
      } finally {
        this.renderTask = null;
        page.cleanup();
      }
    } catch {
      // El documento se destruyó mientras se renderizaba.
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((page) => page - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.pageCount()) {
      this.currentPage.update((page) => page + 1);
    }
  }

  goToPage(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 1 && value <= this.pageCount()) {
      this.currentPage.set(value);
    }
  }

  zoomIn(): void {
    this.scale.update((scale) => Math.min(scale * 1.25, 4));
  }

  zoomOut(): void {
    this.scale.update((scale) => Math.max(scale / 1.25, 0.25));
  }

  async fitWidth(): Promise<void> {
    this.scale.set(await this.fitWidthScale());
  }

  private cancelRender(): void {
    this.renderTask?.cancel();
    this.renderTask = null;
    this.documentSignal()?.cleanup().catch(() => undefined);
  }

  async ngOnDestroy(): Promise<void> {
    this.highlightVersion++;
    this.clearHighlight();
    this.cancelRender();
    await this.documentSignal()?.loadingTask.destroy();
  }
}
