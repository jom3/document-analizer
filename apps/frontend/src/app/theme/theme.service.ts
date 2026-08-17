import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'document-analyzer:theme';

function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Sin acceso a localStorage; se resuelve por preferencia del sistema.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal = signal<Theme>(initialTheme());

  readonly theme = this.themeSignal.asReadonly();

  constructor() {
    this.apply(this.themeSignal());
  }

  setTheme(theme: Theme): void {
    if (theme === this.themeSignal()) return;
    this.themeSignal.set(theme);
    this.apply(theme);
  }

  toggle(): void {
    this.setTheme(this.themeSignal() === 'light' ? 'dark' : 'light');
  }

  private apply(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // El tema queda aplicado solo en la sesión actual.
    }
  }
}