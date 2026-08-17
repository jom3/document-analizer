import { Component, computed, input } from '@angular/core';

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: 'Subido',
  QUEUED: 'En cola',
  PROCESSING: 'Procesando',
  ACTIVE: 'Procesando',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
};

const STATUS_CLASS: Record<string, string> = {
  UPLOADED: 'uploaded',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  ACTIVE: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

@Component({
  selector: 'app-status-badge',
  imports: [],
  template: `<span [class]="'status-badge ' + className()">{{ text() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly label = input<string>();

  readonly className = computed(() => STATUS_CLASS[this.status()] ?? 'uploaded');
  readonly text = computed(() => this.label() ?? STATUS_LABELS[this.status()] ?? this.status());
}