import { HttpClient, HttpDownloadProgressEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { concatMap, filter, map, Observable } from 'rxjs';

export interface DocumentJob {
  jobId: string;
  status: string;
  attempts: number;
  failReason: string | null;
  logs: unknown[] | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Document {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  status: string;
  pageCount: number | null;
  title: string | null;
  author: string | null;
  errorMessage: string | null;
  job?: DocumentJob | null;
  createdAt: string;
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface InvoiceKeyInfo {
  invoiceNumber: string | null;
  date: string | null;
  supplier: string | null;
  customer: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
}

export interface ExperienceItem {
  company: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface EducationItem {
  institution: string | null;
  degree: string | null;
  year: string | null;
}

export interface ResumeKeyInfo {
  fullName: string | null;
  email: string | null;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
}

export interface ContractKeyInfo {
  parties: string[];
  startDate: string | null;
  endDate: string | null;
  paymentTerms: string | null;
  terminationConditions: string | null;
}

export type DocumentKeyInfo =
  | InvoiceKeyInfo
  | ResumeKeyInfo
  | ContractKeyInfo
  | Record<string, never>;

export interface DocumentAnalysis {
  id: string;
  status: string;
  documentType: string | null;
  summary: string | null;
  keyInfo: DocumentKeyInfo | null;
  confidence: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  truncated: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface DocumentList {
  data: Document[];
  total: number;
  page: number;
  limit: number;
}

export interface DocumentStats {
  total: number;
  processed: number;
  processing: number;
  failed: number;
  byType: Array<{ type: string; count: number }>;
  activity: Array<{ weekStart: string; count: number }>;
  recent: Array<{
    id: string;
    name: string;
    originalName: string;
    status: string;
    documentType: string | null;
    createdAt: string;
  }>;
}

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  text: string;
  score: number;
}

export interface ChatCitation {
  chunkId: string;
  pageNumber: number;
  text: string;
  score: number;
}

export interface ChatSession {
  id: string;
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations: ChatCitation[] | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export type ChatStreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'sources'; sources: ChatCitation[] }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 10): Observable<DocumentList> {
    return this.http.get<DocumentList>('/api/documents', { params: { page, limit } });
  }

  getOne(id: string): Observable<Document> {
    return this.http.get<Document>(`/api/documents/${id}`);
  }

  stats(): Observable<DocumentStats> {
    return this.http.get<DocumentStats>('/api/documents/stats');
  }

  upload(file: File, options: { name?: string; keepOriginalName: boolean }): Observable<Document> {
    const form = new FormData();
    form.append('file', file);
    form.append('keepOriginalName', String(options.keepOriginalName));
    if (!options.keepOriginalName && options.name) {
      form.append('name', options.name);
    }
    return this.http.post<Document>('/api/documents', form);
  }

  download(document: Document): Observable<Blob> {
    return this.http.get(`/api/documents/${document.id}/download`, { responseType: 'blob' });
  }

  getPages(id: string): Observable<DocumentPage[]> {
    return this.http.get<DocumentPage[]>(`/api/documents/${id}/pages`);
  }

  getAnalysis(id: string): Observable<DocumentAnalysis> {
    return this.http.get<DocumentAnalysis>(`/api/documents/${id}/analysis`);
  }

  search(query: string, documentId?: string): Observable<SearchResultItem[]> {
    const params: Record<string, string | number> = { q: query };
    if (documentId) params['documentId'] = documentId;
    return this.http.get<SearchResultItem[]>('/api/search', { params });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/documents/${id}`);
  }

  reindex(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`/api/documents/${id}/reindex`, {});
  }

  listChatSessions(documentId: string): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>('/api/chat/sessions', {
      params: { documentId },
    });
  }

  createChatSession(documentId: string, title?: string): Observable<ChatSession> {
    return this.http.post<ChatSession>('/api/chat/sessions', { documentId, title });
  }

  renameChatSession(id: string, title: string): Observable<ChatSession> {
    return this.http.patch<ChatSession>(`/api/chat/sessions/${id}`, { title });
  }

  deleteChatSession(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/chat/sessions/${id}`);
  }

  listChatMessages(sessionId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages`);
  }

  streamChatMessage(
    sessionId: string,
    content: string,
  ): Observable<ChatStreamEvent> {
    let cursor = 0;
    return this.http
      .request('POST', `/api/chat/sessions/${sessionId}/messages`, {
        body: { content },
        responseType: 'text',
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (event): event is HttpDownloadProgressEvent =>
            event.type === HttpEventType.DownloadProgress,
        ),
        concatMap((event) => {
          const text = event.partialText ?? '';
          const parsed = this.parseSse(text.slice(cursor));
          cursor = text.length;
          return parsed;
        }),
      );
  }

  private parseSse(text: string): ChatStreamEvent[] {
    const events: ChatStreamEvent[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      try {
        events.push(JSON.parse(trimmed.slice(5).trim()) as ChatStreamEvent);
      } catch {
        // Línea SSE incompleta o malformada: se ignora.
      }
    }
    return events;
  }
}
