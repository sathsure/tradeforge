import { Routes } from '@angular/router';

export const ALERTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./alerts.component').then(m => m.AlertsComponent),
    title: 'Price Alerts — TradeForge'
  }
];
