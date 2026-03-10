import { Routes } from '@angular/router';

export const STOCK_DETAIL_ROUTES: Routes = [
  {
    path: ':symbol',
    loadComponent: () =>
      import('./stock-detail.component').then(m => m.StockDetailComponent),
    title: 'Stock Detail — TradeForge'
  }
];
