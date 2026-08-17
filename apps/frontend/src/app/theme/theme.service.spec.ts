import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, Theme, ThemeService } from './theme.service';

function mockMatchMedia(dark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: dark,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe('ThemeService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  function createService(): ThemeService {
    return TestBed.inject(ThemeService);
  }

  it('defaults to light without a stored preference or dark scheme', () => {
    mockMatchMedia(false);
    const service = createService();

    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('defaults to dark when prefers-color-scheme is dark', () => {
    mockMatchMedia(true);
    const service = createService();

    expect(service.theme()).toBe('dark');
  });

  it('reads the stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const service = createService();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('setTheme applies data-theme and persists the choice', () => {
    const service = createService();

    service.setTheme('dark');

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('ignores setting the same theme again', () => {
    const service = createService();
    const initial = service.theme();

    service.setTheme(initial);

    expect(service.theme()).toBe(initial);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(initial);
  });

  it('toggle switches between light and dark', () => {
    const service = createService();
    const initial = service.theme();
    const expected: Theme = initial === 'light' ? 'dark' : 'light';

    service.toggle();

    expect(service.theme()).toBe(expected);
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
  });
});