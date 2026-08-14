import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Document {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  status: string;
  createdAt: string;
}

export interface DocumentList {
  data: Document[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 10): Observable<DocumentList> {
    return this.http.get<DocumentList>('/api/documents', { params: { page, limit } });
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

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/documents/${id}`);
  }
}
