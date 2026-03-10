// WHY a ThemeService?
// The NgRx store holds WHAT the theme is ('dark' | 'light').
// The ThemeService handles HOW to apply it to the DOM.
// Separation of concerns: the store doesn't know about DOM APIs,
// and components don't need to know about CSS variable manipulation.
//
// MECHANISM: CSS custom properties + data-theme attribute
// styles.scss defines two variable sets:
//   :root { --tf-bg-app: #0d1117; ... }         (dark — default)
//   [data-theme="light"] { --tf-bg-app: #f6f8fa; ... } (light — override)
//
// This service sets document.documentElement.setAttribute('data-theme', value).
// The CSS cascade does the rest — no JavaScript style manipulation needed.
// Result: instant, flicker-free theme switching.

import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectTheme } from '../../features/settings/state/settings.selectors';
import { Theme } from '../../features/settings/state/settings.actions';

@Injectable({
  providedIn: 'root',
  // WHY providedIn: 'root'?
  // ThemeService must be a singleton. Two instances would race each other.
  // Root-scoped = one instance for the entire app lifecycle.
})
export class ThemeService {

  private readonly store = inject(Store);

  // WHY init() instead of constructor logic?
  // The service is instantiated lazily by Angular DI.
  // We call init() explicitly from AppComponent.ngOnInit()
  // to guarantee the theme is applied BEFORE any component renders.
  // Constructor-based subscriptions run but the DOM might not be ready.
  init(): void {
    // Subscribe to theme changes from the store.
    // Every time SettingsActions.updateTheme is dispatched, this fires.
    // On first subscribe, it immediately emits the current value
    // (loaded from localStorage in the reducer's initialState).
    this.store.select(selectTheme).subscribe(theme => {
      this.applyTheme(theme);
    });
  }

  private applyTheme(theme: Theme): void {
    const root = document.documentElement;

    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
      // WHY setAttribute? CSS selector [data-theme="light"] activates the light vars.
      // More semantic than toggling a class. Reflects the actual theme name.
    } else {
      root.removeAttribute('data-theme');
      // WHY remove instead of set 'dark'?
      // :root {} (no attribute) is the dark default.
      // Removing the attribute returns to the default dark theme.
      // This means dark works even if CSS fails to load — progressive enhancement.
    }

    // Update the meta theme-color for mobile browsers.
    // WHY? On Android, the browser chrome (address bar) matches this color.
    // Dark theme: dark address bar. Light theme: white address bar.
    // Polished detail that native apps get for free.
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#f6f8fa' : '#0d1117');
    }
  }
}
