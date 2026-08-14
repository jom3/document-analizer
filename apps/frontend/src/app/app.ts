import { Component, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type Health = { status: string; db: string };

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly health = signal<Health | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.checkHealth();
  }

  checkHealth(): void {
    this.error.set(null);
    this.http.get<Health>('/api/health').subscribe({
      next: (health) => this.health.set(health),
      error: (err) => {
        this.health.set(null);
        this.error.set(err.statusText ?? 'Network error');
      }
    });
  }
}
