import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-layout',
  imports: [],
  template: `
    <div class="auth-layout">
      <aside class="auth-panel">
        <svg
          class="auth-panel-watermark"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="0.8"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 8h8M8 12h8M8 16h5" stroke-linecap="round" />
        </svg>

        <div class="auth-panel-header">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">Document Analyzer</span>
        </div>

        <div class="auth-panel-body">
          <p class="auth-panel-eyebrow">Inteligencia documental</p>
          <p class="auth-panel-heading">
            {{ heading() }}
            @if (accent()) {
              <em class="auth-panel-accent">{{ accent() }}</em>
            }
          </p>
          @if (text()) {
            <p class="auth-panel-text">{{ text() }}</p>
          }
          @if (panelVariant() === 'full') {
            <ul class="auth-panel-list">
              <li>Clasificación automática</li>
              <li>Resúmenes y datos clave</li>
              <li>Preguntas con fuentes</li>
            </ul>
          }
        </div>

        <div class="auth-panel-foot">
          @if (panelVariant() === 'full') {
            <figure class="auth-panel-document" aria-hidden="true">
              <div class="doc-sheet">
                <div class="doc-head">
                  <span class="doc-dot"></span>
                  <span class="doc-filename">informe_2026.pdf</span>
                  <span class="doc-tag">clasificado</span>
                </div>
                <div class="doc-line"></div>
                <div class="doc-line"></div>
                <div class="doc-line highlight"></div>
                <div class="doc-line"></div>
              </div>
              <figcaption class="doc-caption">Un PDF, iluminado por IA</figcaption>
            </figure>
          }
          <footer class="auth-panel-footer">PDF · OCR · Resúmenes · Chat con fuentes</footer>
        </div>
      </aside>

      <main class="auth-form">
        <div class="auth-form-inner">
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly heading = input.required<string>();
  readonly accent = input('');
  readonly text = input('');
  readonly panelVariant = input<'full' | 'compact'>('full');
}