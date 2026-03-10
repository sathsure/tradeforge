// WHY a separate routes file for Dashboard?
// Even though dashboard only has one route currently, isolating routes in their own file:
// 1. Enables future child routes (e.g., /dashboard/watchlist, /dashboard/alerts)
// 2. Keeps app.routes.ts clean — it just lists features, not component details
// 3. Each feature team can own their routing file independently

import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard.component').then(m => m.DashboardComponent),
    // WHY loadComponent even within an already-lazy-loaded feature?
    // The routes file itself is the lazy boundary. But loadComponent ensures
    // the component class is in a separate chunk from this routes metadata.
    // Reduces the routes chunk size slightly.
    title: 'Dashboard — TradeForge'
  }
];
