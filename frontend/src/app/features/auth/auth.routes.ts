// WHY AUTH_ROUTES as a separate file?
// Lazy loaded: this entire module is downloaded ONLY when user hits /auth/*
// If user is already logged in, they never load this code.
// Result: smaller initial bundle = faster first page load for logged-in users.

import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
    // WHY redirect? /auth itself has no component. Default to login.
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then(m => m.LoginComponent),
    // WHY loadComponent with dynamic import?
    // LoginComponent is lazy-loaded within the already-lazy-loaded auth module.
    // Ultra-fine-grained splitting: login and register are separate chunks.
    // Register component is never downloaded by returning users.
    title: 'Login — TradeForge'
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.component').then(m => m.RegisterComponent),
    title: 'Create Account — TradeForge'
  },
  {
    path: 'two-factor',
    loadComponent: () =>
      import('./two-factor/two-factor-verify.component').then(m => m.TwoFactorVerifyComponent),
    // WHY no authGuard here? The component itself guards by checking twoFactorTempToken.
    // If there's no pending 2FA, it redirects to /auth/login.
    title: 'Verify Identity — TradeForge'
  },
  {
    path: 'verify-registration',
    loadComponent: () =>
      import('./verify-registration/verify-registration.component')
        .then(m => m.VerifyRegistrationComponent),
    // WHY no authGuard? The component itself guards by checking registrationPending state.
    // If there's no pending registration, it redirects to /auth/register.
    title: 'Verify Your Email — TradeForge'
  }
];
