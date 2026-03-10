// WHY a separate routes file?
// Keeps routing definitions co-located with their feature.
// app.routes.ts just imports this — it doesn't need to know the component name.
// When we add child routes (settings/profile, settings/billing), they go here.

import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings.component').then(m => m.SettingsComponent),
    title: 'Settings — TradeForge',
    // WHY title? Sets browser tab title. User knows they're in Settings.
  }
];
