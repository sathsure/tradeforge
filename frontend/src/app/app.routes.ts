// WHY app.routes.ts?
// Centralized route definitions. Each feature module loads LAZILY.
//
// WHY lazy loading? (Critical for a trading app)
// Eager loading: browser downloads ALL JS upfront — huge initial bundle.
// Lazy loading: downloads only the code for the current page.
// Dashboard module (~200KB) loads instantly. Orders module loads only when user navigates there.
// Result: 3x faster initial page load.

import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Default redirect
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },

  // Auth routes — public, no guard
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES),
    // WHY loadChildren with import()? Dynamic import — only loaded when user hits /auth/*
    // If user is already logged in, this chunk is never downloaded.
  },

  // Protected routes — require valid JWT
  {
    path: '',
    canActivate: [authGuard],
    // WHY functional guard (authGuard) vs class-based?
    // Functional guards are simpler, easier to test, Angular 18 best practice.
    // No need to create a class, implement CanActivate, register as provider.
    loadComponent: () =>
      import('./shared/components/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES),
        title: 'Dashboard — TradeForge'
        // WHY title? Sets browser tab title. Good UX + accessibility.
      },
      {
        path: 'markets',
        loadChildren: () =>
          import('./features/markets/markets.routes').then(m => m.MARKETS_ROUTES),
        title: 'Markets — TradeForge'
      },
      {
        path: 'orders',
        loadChildren: () =>
          import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
        title: 'Orders — TradeForge'
      },
      {
        // WHY separate place-order route? Dashboard "New Order" links here —
        // shows only the order form, no pending/history distractions.
        path: 'place-order',
        loadChildren: () =>
          import('./features/orders/orders.routes').then(m => m.PLACE_ORDER_ROUTES),
        title: 'Place Order — TradeForge'
      },
      {
        path: 'portfolio',
        loadChildren: () =>
          import('./features/portfolio/portfolio.routes').then(m => m.PORTFOLIO_ROUTES),
        title: 'Portfolio — TradeForge'
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES),
        title: 'Settings — TradeForge'
        // WHY lazy load? Settings visited rarely — no reason to include in main bundle.
      },
      {
        // WHY stock-detail under shell? Needs the sidebar nav + topbar chrome.
        // Uses /:symbol so markets/screener can deep-link: /stock-detail/RELIANCE
        path: 'stock-detail',
        loadChildren: () =>
          import('./features/stock-detail/stock-detail.routes').then(m => m.STOCK_DETAIL_ROUTES),
        title: 'Stock Detail — TradeForge'
      },
      {
        path: 'screener',
        loadChildren: () =>
          import('./features/screener/screener.routes').then(m => m.SCREENER_ROUTES),
        title: 'Stock Screener — TradeForge'
      },
      {
        path: 'mutual-funds',
        loadChildren: () =>
          import('./features/mutual-funds/mutual-funds.routes').then(m => m.MUTUAL_FUNDS_ROUTES),
        title: 'Mutual Funds — TradeForge'
      },
      {
        // WHY alerts under shell? Users manage alerts while logged in — needs the nav chrome.
        path: 'alerts',
        loadChildren: () =>
          import('./features/alerts/alerts.routes').then(m => m.ALERTS_ROUTES),
        title: 'Price Alerts — TradeForge'
      }
    ]
  },

  // Catch-all — 404
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
