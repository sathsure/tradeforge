import { Routes } from '@angular/router';

// WHY ADD_FUNDS_ROUTES? Lazy-loaded routes for the Add Funds feature.
// Keeps the chunk separate so users who never add funds don't download this code.
export const ADD_FUNDS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./add-funds.component').then(m => m.AddFundsComponent),
    title: 'Add Funds — TradeForge'
  }
];
