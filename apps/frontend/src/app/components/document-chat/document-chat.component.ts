import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import {
  ChatCitation,
  ChatMessage,
  ChatSession,
  DocumentsService,
} from '../../documents/documents.service';

@Component({
  selector: 'app-document-chat',
  imports: [],
  template: `
    @if (loading()) {
      <p class="empty">Cargando chat…</p>
    } @else if (noIndex()) {
      <div class="no-index">
        <p class="warn">Este documento aún no está indexado. Reindexalo para poder chatear.</p>
        <button type="button" (click)="reindex()" [disabled]="reindexing()">
          {{ reindexing() ? 'Reindexando…' : 'Reindexar' }}
        </button>
      </div>
    } @else {
      <div class="chat-layout">
        <aside class="sessions">
          <button class="new" type="button" (click)="createSession()">+ Nueva conversación</button>

          @for (session of sessions(); track session.id) {
            <div class="session" [class.active]="session.id === activeSessionId()">
              @if (editingId() === session.id) {
                <input
                  type="text"
                  [value]="editTitle()"
                  (input)="onEditInput($event)"
                  (keyup.enter)="saveRename()"
                  (keyup.escape)="cancelRename()"
                  (blur)="cancelRename()"
                />
              } @else {
                <button class="title" type="button" (click)="selectSession(session.id)">
                  {{ session.title }}
                </button>
                <button class="icon" type="button" title="Renombrar" (click)="startRename(session)">✎</button>
                <button class="icon" type="button" title="Eliminar" (click)="removeSession(session)">✕</button>
              }
            </div>
          } @empty {
            <p class="empty">Sin conversaciones todavía.</p>
          }
        </aside>

        <section class="thread">
          @if (!activeSessionId()) {
            <p class="empty">Elegí o creá una conversación para empezar.</p>
          } @else {
            <div class="messages">
              @for (message of messages(); track message.id) {
                <article class="message" [class.user]="message.role === 'USER'">
                  <p class="bubble">{{ message.content || '…' }}</p>
                  @if (message.role === 'ASSISTANT' && message.errorMessage) {
                    <p class="error">{{ message.errorMessage }}</p>
                  }
                  @if (message.role === 'ASSISTANT' && message.citations?.length) {
                    <details class="sources">
                      <summary>Fuentes ({{ message.citations.length }})</summary>
                      @for (source of message.citations; track source.chunkId) {
                        <button
                          type="button"
                          class="source"
                          (click)="onSourceClick(source)"
                        >
                          Página {{ source.pageNumber }} · score {{ source.score }}: {{ source.text }}
                        </button>
                      }
                    </details>
                  }
                </article>
              }

              @if (sending()) {
                <article class="message">
                  <p class="bubble">{{ streamText() || '…' }}</p>
                  @if (streamError()) {
                    <p class="error">{{ streamError() }}</p>
                  }
                  @if (streamSources().length) {
                    <details class="sources">
                      <summary>Fuentes ({{ streamSources().length }})</summary>
                      @for (source of streamSources(); track source.chunkId) {
                        <button
                          type="button"
                          class="source"
                          (click)="onSourceClick(source)"
                        >
                          Página {{ source.pageNumber }} · score {{ source.score }}: {{ source.text }}
                        </button>
                      }
                    </details>
                  }
                </article>
              }
            </div>

            <div class="composer">
              <input
                type="text"
                [value]="inputText()"
                (input)="onInput($event)"
                (keyup.enter)="sendMessage()"
                placeholder="Preguntá sobre el documento…"
                [disabled]="sending()"
              />
              <button type="button" (click)="sendMessage()" [disabled]="sending() || !inputText().trim()">
                Enviar
              </button>
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    .chat-layout {
      display: flex;
      gap: 1rem;
      height: 100%;
    }

    .sessions {
      width: 220px;
      flex-shrink: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow-y: auto;
      max-height: 62vh;
    }

    .sessions .new {
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--color-primary);
      cursor: pointer;
      font-size: var(--text-sm);
    }

    .sessions .new:hover {
      background: var(--color-surface-muted);
    }

    .sessions .session {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 8px;
    }

    .sessions .session.active {
      background: var(--color-surface-muted);
    }

    .sessions .session .title {
      flex: 1;
      min-width: 0;
      text-align: left;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 0.8125rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sessions .session .icon {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 0.75rem;
      color: var(--color-text-muted);
      padding: 0.15rem 0.25rem;
    }

    .sessions .session input {
      flex: 1;
      min-width: 0;
      font-size: var(--text-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 0.25rem;
    }

    .thread {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      max-height: 50vh;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .message {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .message.user {
      align-items: flex-end;
    }

    .bubble {
      max-width: 80%;
      margin: 0;
      padding: 0.6rem 0.85rem;
      border-radius: 12px;
      background: var(--color-surface-muted);
      color: var(--color-text);
      font-size: var(--text-sm);
      line-height: var(--leading-base);
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message.user .bubble {
      background: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .sources {
      margin-top: 0.35rem;
      font-size: 0.75rem;
      color: var(--color-text-muted);
      max-width: 80%;
    }

    .sources summary {
      cursor: pointer;
      color: var(--color-primary);
    }

    .source {
      display: block;
      margin: 0.25rem 0;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--color-border);
      border-left: 2px solid var(--color-primary);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      text-align: left;
      font-size: inherit;
      cursor: pointer;
      line-height: 1.4;
      max-width: 100%;
    }

    .source:hover {
      background: var(--color-surface-muted);
    }

    .composer {
      display: flex;
      gap: 0.5rem;
    }

    .composer input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      font-size: var(--text-sm);
    }

    .composer button {
      padding: 0.5rem 1.25rem;
      border: none;
      border-radius: var(--radius-full);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
      cursor: pointer;
      font-size: var(--text-sm);
    }

    .composer button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .empty {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .error {
      color: var(--color-danger);
      font-size: var(--text-sm);
      margin: 0.25rem 0 0;
    }

    .no-index {
      border: 1px solid var(--color-status-failed-bg);
      background: var(--color-status-failed-bg);
      border-radius: var(--radius-lg);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .no-index .warn {
      margin: 0;
      color: var(--color-warning);
    }

    .no-index button {
      align-self: flex-start;
      padding: 0.4rem 1rem;
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      color: var(--color-warning);
      cursor: pointer;
      font-size: var(--text-sm);
    }
  `,
})
export class DocumentChatComponent implements OnInit {
  readonly documentId = input.required<string>();
  readonly sourceSelected = output<{ pageNumber: number; text: string }>();

  private readonly documentsService = inject(DocumentsService);

  readonly loading = signal(true);
  readonly noIndex = signal(false);
  readonly reindexing = signal(false);

  readonly sessions = signal<ChatSession[]>([]);
  readonly activeSessionId = signal<string | null>(null);
  readonly messages = signal<ChatMessage[]>([]);

  readonly inputText = signal('');
  readonly sending = signal(false);
  readonly streamText = signal('');
  readonly streamSources = signal<ChatCitation[]>([]);
  readonly streamError = signal<string | null>(null);

  readonly editingId = signal<string | null>(null);
  readonly editTitle = signal('');

  ngOnInit(): void {
    this.loadSessions();
  }

  loadSessions(): void {
    this.loading.set(true);
    this.documentsService.listChatSessions(this.documentId()).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.noIndex.set(true);
        }
        this.loading.set(false);
      },
    });
  }

  createSession(): void {
    this.documentsService
      .createChatSession(this.documentId())
      .subscribe({
        next: (session) => {
          this.sessions.update((sessions) => [session, ...sessions]);
          this.selectSession(session.id);
        },
      });
  }

  selectSession(id: string): void {
    this.activeSessionId.set(id);
    this.streamText.set('');
    this.streamSources.set([]);
    this.streamError.set(null);
    this.documentsService.listChatMessages(id).subscribe({
      next: (messages) => this.messages.set(messages),
    });
  }

  startRename(session: ChatSession): void {
    this.editingId.set(session.id);
    this.editTitle.set(session.title);
  }

  onInput(event: Event): void {
    this.inputText.set((event.target as HTMLInputElement).value);
  }

  onEditInput(event: Event): void {
    this.editTitle.set((event.target as HTMLInputElement).value);
  }

  saveRename(): void {
    const id = this.editingId();
    const title = this.editTitle().trim();
    if (!id || !title) {
      this.cancelRename();
      return;
    }
    this.documentsService.renameChatSession(id, title).subscribe({
      next: (updated) => {
        this.sessions.update((sessions) =>
          sessions.map((session) => (session.id === updated.id ? updated : session)),
        );
        this.editingId.set(null);
      },
    });
  }

  cancelRename(): void {
    this.editingId.set(null);
  }

  removeSession(session: ChatSession): void {
    this.documentsService.deleteChatSession(session.id).subscribe({
      next: () => {
        this.sessions.update((sessions) =>
          sessions.filter((item) => item.id !== session.id),
        );
        if (this.activeSessionId() === session.id) {
          this.activeSessionId.set(null);
          this.messages.set([]);
        }
      },
    });
  }

  onSourceClick(source: ChatCitation): void {
    this.sourceSelected.emit({ pageNumber: source.pageNumber, text: source.text });
  }

  reindex(): void {
    this.reindexing.set(true);
    this.documentsService.reindex(this.documentId()).subscribe({
      next: () => {
        this.reindexing.set(false);
        this.noIndex.set(false);
        this.loadSessions();
      },
      error: () => {
        this.reindexing.set(false);
      },
    });
  }

  sendMessage(): void {
    const sessionId = this.activeSessionId();
    const content = this.inputText().trim();
    if (!sessionId || !content || this.sending()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      sessionId,
      role: 'USER',
      content,
      citations: null,
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };

    this.messages.update((messages) => [...messages, userMessage]);
    this.inputText.set('');
    this.sending.set(true);
    this.streamText.set('');
    this.streamSources.set([]);
    this.streamError.set(null);

    this.documentsService.streamChatMessage(sessionId, content).subscribe({
      next: (event) => {
        if (event.type === 'chunk') {
          this.streamText.update((text) => text + event.text);
        } else if (event.type === 'sources') {
          this.streamSources.set(event.sources);
        } else if (event.type === 'error') {
          this.appendAssistant(this.streamText(), this.streamSources(), event.message);
          this.streamText.set('');
          this.streamSources.set([]);
          this.streamError.set(null);
          this.sending.set(false);
        } else if (event.type === 'done') {
          this.appendAssistant(this.streamText(), this.streamSources(), null);
          this.streamText.set('');
          this.streamSources.set([]);
          this.streamError.set(null);
          this.sending.set(false);
        }
      },
      error: () => {
        this.streamError.set('No se pudo enviar el mensaje');
        this.sending.set(false);
      },
    });
  }

  private appendAssistant(
    content: string,
    citations: ChatCitation[],
    errorMessage: string | null,
  ): void {
    const sessionId = this.activeSessionId();
    if (!sessionId) {
      return;
    }
    const assistant: ChatMessage = {
      id: `local-${Date.now()}`,
      sessionId,
      role: 'ASSISTANT',
      content,
      citations: citations.length ? citations : null,
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      errorMessage,
      createdAt: new Date().toISOString(),
    };
    this.messages.update((messages) => [...messages, assistant]);
  }
}