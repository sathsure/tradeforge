import { Routes } from '@angular/router';

export const SCREENER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./screener.component').then(m => m.ScreenerComponent),
    title: 'Stock Screener — TradeForge'
  }
];
