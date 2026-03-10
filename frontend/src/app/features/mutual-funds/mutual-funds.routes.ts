import { Routes } from '@angular/router';

export const MUTUAL_FUNDS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./mutual-funds.component').then(m => m.MutualFundsComponent),
    title: 'Mutual Funds — TradeForge'
  }
];
