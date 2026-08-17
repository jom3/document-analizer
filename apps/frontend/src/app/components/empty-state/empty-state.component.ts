import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [],
  template: `
    <div class="empty-state" [class.error-state]="variant() === 'error'">
      @if (title()) {
        <h2>{{ title() }}</h2>
      }
      @if (message()) {
        <p>{{ message() }}</p>
      }
      @if (actions()) {
        <div class="actions">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input('');
  readonly message = input('');
  readonly variant = input<'empty' | 'error'>('empty');
  readonly actions = input(false);
}