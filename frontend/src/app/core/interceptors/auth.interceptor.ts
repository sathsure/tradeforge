// WHY HTTP Interceptors?
// Without interceptors: every service method manually adds Authorization header.
// That's hundreds of places to forget, hundreds of places to update when token changes.
//
// With interceptor: ONE place handles JWT attachment for ALL requests automatically.
// The rest of the app doesn't know about JWT at all — separation of concerns.
//
// SECURITY: Also handles 401 responses → triggers token refresh → retries original request.
// User never sees "session expired" unless their refresh token also expires.

import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { Store } from '@ngrx/store';
import { AuthService } from '../services/auth.service';
import { selectAccessToken } from '../../features/auth/state/auth.selectors';
import { AuthActions } from '../../features/auth/state/auth.actions';

// WHY functional interceptor (HttpInterceptorFn)?
// Angular 18 recommends functional interceptors over class-based.
// No class, no inject decorator on constructor — just a function.
// Tree-shakeable: if not imported, it's not in the bundle.
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const store = inject(Store);
  const authService = inject(AuthService);

  // Skip auth endpoints — they don't need tokens (and don't have them yet).
  // WHY also skip verify-registration, resend, and 2fa? These endpoints authenticate
  // via a short-lived tempToken in the request body, not a Bearer access token.
  // A wrong OTP returns 401 — we must NOT treat that as a session expiry and logout.
  // WHY '/api/auth/2fa/' (not '/api/2fa/')? All 2FA endpoints live under /api/auth/2fa/*.
  // The old '/api/2fa/' check never matched — verify-otp 401s would trigger an unwanted
  // token refresh attempt that dispatched logout() while the user was mid-2FA flow.
  if (req.url.includes('/api/auth/login') ||
      req.url.includes('/api/auth/register') ||
      req.url.includes('/api/auth/refresh') ||
      req.url.includes('/api/auth/verify-registration') ||
      req.url.includes('/api/auth/resend-registration-otp') ||
      req.url.includes('/api/auth/2fa/')) {
    return next(req);
  }

  // Get current access token from NgRx store (synchronous snapshot)
  let accessToken: string | null = null;
  store.select(selectAccessToken).subscribe(token => accessToken = token).unsubscribe();
  // WHY immediately unsubscribe? We need a single value snapshot, not an ongoing subscription.
  // In newer Angular/NgRx you'd use toSignal() or take(1) for this.

  // Clone request with Authorization header
  // WHY clone? HttpRequest is immutable — you can't modify it.
  // Clone creates a new request with the added header.
  // Immutability prevents race conditions in concurrent requests.
  const authReq = accessToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 Unauthorized — token expired, try to refresh
      if (error.status === 401) {
        // WHY switchMap? We need to make an async call (refresh) and
        // then retry the original request. switchMap cancels previous
        // inner observable if a new one arrives — prevents duplicate refreshes.
        return authService.refreshToken().pipe(
          switchMap(newToken => {
            // Retry original request with new token
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` }
            });
            return next(retryReq);
          }),
          catchError(refreshError => {
            // Refresh also failed — force logout
            store.dispatch(AuthActions.logout());
            return throwError(() => refreshError);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
