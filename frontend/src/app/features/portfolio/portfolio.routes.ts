import { Routes } from '@angular/router';

export const PORTFOLIO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./portfolio.component').then(m => m.PortfolioComponent),
    title: 'Portfolio — TradeForge'
  }
];
