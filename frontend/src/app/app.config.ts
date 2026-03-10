// WHY app.config.ts?
// In Angular 18, this replaces AppModule entirely.
// All providers (HTTP, Router, NgRx, Animations) are registered here.
// Benefits: Better tree-shaking (unused code removed from bundle),
// no need for imports[] and declarations[] NgModule boilerplate.

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
// WHY provideAnimations (sync) not provideAnimationsAsync?
// Async animations loads the module lazily — the first render happens before the
// animation module loads, causing NG05105 "Unexpected synthetic property @fadeIn".
// Sync provideAnimations ensures animations are available immediately on bootstrap.
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { authReducer } from './features/auth/state/auth.reducer';
import { portfolioReducer } from './features/portfolio/state/portfolio.reducer';
import { marketReducer } from './features/markets/state/market.reducer';
import { settingsReducer } from './features/settings/state/settings.reducer';
import { AuthEffects } from './features/auth/state/auth.effects';
import { PortfolioEffects } from './features/portfolio/state/portfolio.effects';
import { MarketEffects } from './features/markets/state/market.effects';
import { OrderEffects } from './features/orders/state/order.effects';
import { reducer as orderReducer } from './features/orders/state/order.reducer';
import { ToastEffects } from './core/state/toast.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    // WHY provideZoneChangeDetection with eventCoalescing?
    // Zone.js triggers change detection on every event.
    // eventCoalescing batches multiple events together — fewer re-renders.
    // measurable performance improvement in data-heavy trading UIs.
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Router with two modern features:
    // withComponentInputBinding: route params (/stocks/:symbol) auto-bind to @Input()
    // withViewTransitions: smooth page transitions (Chrome's View Transitions API)
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),

    // HTTP client with our JWT interceptor
    // WHY withInterceptors (functional) vs old class-based interceptors?
    // Functional interceptors are tree-shakeable and easier to test.
    provideHttpClient(withInterceptors([authInterceptor])),

    provideAnimations(),

    // NgRx Store — global state management
    // Each reducer manages a slice of state
    provideStore({
      auth: authReducer,
      portfolio: portfolioReducer,
      market: marketReducer,
      settings: settingsReducer,
      // WHY settings in root store? Theme changes must be app-wide and instant.
      // Also rehydrated from localStorage in the reducer's initialState —
      // so settings are available before any component renders.
      orders: orderReducer,
      // WHY orders in root store? Order placement is triggered from multiple places
      // (markets watchlist, portfolio holdings, orders page). Root store makes
      // the order state available everywhere without lazy loading complexity.
    }),

    // NgRx Effects — handles side effects (API calls triggered by actions)
    // WHY separate effects from reducers?
    // Reducers must be pure functions (no side effects, same input = same output).
    // API calls are side effects. Effects handle them and dispatch result actions.
    provideEffects([AuthEffects, PortfolioEffects, MarketEffects, OrderEffects, ToastEffects]),

    // Redux DevTools — browser extension to inspect state changes
    // WHY? See every action dispatched, time-travel debug, inspect state tree.
    // logOnly in production — don't allow state manipulation in prod.
    provideStoreDevtools({
      maxAge: 50,
      logOnly: false // set true for production
    })
  ]
};
