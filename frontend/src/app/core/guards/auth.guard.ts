// WHY route guards?
// Without guards: any user can navigate to /dashboard by typing the URL directly.
// The API calls would fail with 401, but the empty page would flash first — bad UX.
//
// With guards: unauthenticated users are redirected to /auth/login BEFORE
// the component even loads. No flash of unauthorized content.
//
// SECURITY NOTE: Guards are UI protection only.
// They prevent accidental navigation — NOT malicious access.
// Your backend APIs must ALWAYS validate JWT independently.
// A user can bypass Angular guards by manipulating the browser directly.
// Backend is the real security layer. Guards are for UX only.

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { map } from 'rxjs';
import { selectIsAuthenticated } from '../../features/auth/state/auth.selectors';

export const authGuard: CanActivateFn = (route, state) => {
  const store = inject(Store);
  const router = inject(Router);

  return store.select(selectIsAuthenticated).pipe(
    map(isAuthenticated => {
      if (isAuthenticated) {
        return true; // Allow navigation
      }
      // WHY preserve the attempted URL in query params?
      // After login, Angular redirects to the original destination.
      // User tried /portfolio → redirected to login → after login → /portfolio
      // Much better UX than always going to dashboard after login.
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url }
      });
    })
  );
};
