// WHY NgRx Effects?
// Effects handle SIDE EFFECTS — operations that interact with the outside world:
// - HTTP API calls
// - localStorage reads/writes
// - Navigation (Router)
//
// WHY keep side effects OUT of reducers?
// Reducers must be PURE — same input, same output, no side effects.
// Testing a reducer: pass state + action → check returned state. Simple.
// Testing a component: just check what actions it dispatches. Simple.
// Effects handle the messy async world.
//
// FLOW: Component dispatches action → Effect intercepts → calls API → dispatches success/failure action
//       Reducer handles success/failure → updates state → Component re-renders via selector

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { catchError, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthActions } from './auth.actions';
import { AuthService } from '../../../core/services/auth.service';
import { TwoFactorService } from '../../../core/services/two-factor.service';
import { selectRegistrationTempToken } from './auth.selectors';
import { PortfolioActions } from '../../portfolio/state/portfolio.actions';
import { OrderActions } from '../../orders/state/order.actions';

@Injectable()
// WHY not providedIn: 'root' here?
// Effects are registered via provideEffects([AuthEffects]) in app.config.ts.
// That's the correct way. Providing in root would register them twice.
export class AuthEffects {

  // Inject via inject() — modern Angular functional injection
  private readonly actions$ = inject(Actions);
  private readonly authService = inject(AuthService);
  private readonly twoFactorService = inject(TwoFactorService);
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  // ── Login Effect ──────────────────────────────────────────────────────────
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      // WHY ofType? Filters the global action stream to ONLY login actions.
      // Without this, every action dispatched in the app would trigger this effect.

      switchMap(({ request }) =>
        // WHY switchMap not mergeMap?
        // If user clicks Login twice, switchMap CANCELS the first HTTP call.
        // mergeMap would fire both — could cause duplicate login attempts.
        // For login, the latest attempt is what matters.
        this.authService.login(request).pipe(
          map(response =>
            // WHY check requiresVerification first?
            // If the user registered but never verified, login also returns 202 with
            // requiresVerification:true. This takes priority over 2FA.
            response.requiresVerification
              ? AuthActions.registerVerificationRequired({
                  tempToken: response.tempToken!,
                  method: response.verificationMethod!,
                  maskedContact: response.maskedContact!
                })
              // WHY check requiresTwoFactor? Backend returns HTTP 202 with this flag set when
              // the account has 2FA enabled. We navigate to the verify screen instead of dashboard.
              : response.requiresTwoFactor
                ? AuthActions.loginTwoFactorRequired({
                    tempToken: response.tempToken!,
                    method: response.twoFactorMethod!
                  })
                : AuthActions.loginSuccess({ response })
          ),
          // WHY map? Transforms the HTTP response into an NgRx success action.
          // The action goes to the reducer (updates state) AND the loginSuccess$ effect below.

          catchError(error => {
            // WHY catchError inside switchMap?
            // If we put catchError outside, any error would kill the effect permanently.
            // Inside switchMap: effect survives errors and handles future login attempts.
            const message = error?.error?.message ?? 'Login failed. Please try again.';
            return of(AuthActions.loginFailure({ error: message }));
            // WHY of()? catchError must return an Observable.
            // of() wraps a single value in an Observable that completes immediately.
          })
        )
      )
    )
  );

  // ── Login Success Effect ──────────────────────────────────────────────────
  loginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(({ response }) => {
          // Persist refresh token for session restoration after page reload
          // WHY localStorage? Only this token survives page refresh.
          // Access token is kept only in NgRx memory (lost on refresh) — intentional.
          // Short-lived (15min) access tokens in memory are safer than localStorage.
          localStorage.setItem('refreshToken', response.refreshToken);

          // Navigate to dashboard after successful login
          this.router.navigate(['/dashboard']);
        })
      ),
    { dispatch: false }
  );

  // WHY dispatch loadPortfolio on loginSuccess?
  // Ensures the portfolio state is always fresh for the logged-in user.
  // Without this, stale data from a previous session's NgRx store would show
  // if the user switches accounts without a full page refresh.
  loginSuccessLoadPortfolio$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginSuccess),
      map(() => PortfolioActions.loadPortfolio())
    )
  );

  // ── Register Effect ───────────────────────────────────────────────────────
  register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      switchMap(({ request }) =>
        this.authService.register(request).pipe(
          map(response =>
            // WHY check requiresVerification?
            // Backend returns HTTP 202 with requiresVerification:true when the account
            // was created but needs email/phone OTP confirmation before login is granted.
            // We navigate to /auth/verify-registration instead of the dashboard.
            response.requiresVerification
              ? AuthActions.registerVerificationRequired({
                  tempToken: response.tempToken!,
                  method: response.verificationMethod!,
                  maskedContact: response.maskedContact!
                })
              : AuthActions.registerSuccess({ response })
          ),
          catchError(error => {
            const message = error?.error?.message ?? 'Registration failed. Please try again.';
            return of(AuthActions.registerFailure({ error: message }));
          })
        )
      )
    )
  );

  // ── Register Success Effect ───────────────────────────────────────────────
  registerSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.registerSuccess),
        tap(({ response }) => {
          localStorage.setItem('refreshToken', response.refreshToken);
          this.router.navigate(['/dashboard']);
        })
      ),
    { dispatch: false }
  );

  // ── Register Verification Required Effect ─────────────────────────────────
  // Navigate to the verify-registration page so user can enter the OTP.
  registerVerificationRequired$ = createEffect(
    () => this.actions$.pipe(
      ofType(AuthActions.registerVerificationRequired),
      tap(() => this.router.navigate(['/auth/verify-registration']))
    ),
    { dispatch: false }
  );

  // ── Verify Registration Effect ────────────────────────────────────────────
  verifyRegistration$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyRegistration),
      switchMap(({ request }) =>
        this.authService.verifyRegistration(request).pipe(
          map(response => AuthActions.verifyRegistrationSuccess({ response })),
          catchError(error => of(AuthActions.verifyRegistrationFailure({
            error: error?.error?.message ?? 'Invalid or expired code. Please try again.'
          })))
        )
      )
    )
  );

  // ── Verify Registration Success Effect ───────────────────────────────────
  verifyRegistrationSuccess$ = createEffect(
    () => this.actions$.pipe(
      ofType(AuthActions.verifyRegistrationSuccess),
      tap(({ response }) => {
        localStorage.setItem('refreshToken', response.refreshToken);
        this.router.navigate(['/dashboard']);
      })
    ),
    { dispatch: false }
  );

  // Load fresh portfolio immediately after registration — new user gets clean empty state
  verifyRegistrationSuccessLoadPortfolio$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyRegistrationSuccess),
      map(() => PortfolioActions.loadPortfolio())
    )
  );

  // ── Resend Registration OTP Effect ────────────────────────────────────────
  // When the user clicks "Resend code", read the current tempToken from state
  // and call the resend API, which issues a fresh OTP + new tempToken.
  resendRegistrationOtp$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.resendRegistrationOtp),
      withLatestFrom(this.store.select(selectRegistrationTempToken)),
      // WHY withLatestFrom? We need the tempToken currently in state without
      // the user having to pass it explicitly in the action payload.
      // withLatestFrom reads the latest emitted value from the selector synchronously.
      switchMap(([, tempToken]) => {
        if (!tempToken) {
          return of(AuthActions.verifyRegistrationFailure({
            error: 'Verification session expired. Please register again.'
          }));
        }
        return this.authService.resendRegistrationOtp(tempToken).pipe(
          map(response => AuthActions.registerVerificationRequired({
            tempToken: response.tempToken!,
            method: response.verificationMethod!,
            maskedContact: response.maskedContact!
          })),
          catchError(error => of(AuthActions.verifyRegistrationFailure({
            error: error?.error?.message ?? 'Failed to resend code. Please try again.'
          })))
        );
      })
    )
  );

  // ── Logout Effect ─────────────────────────────────────────────────────────
  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      switchMap(() => {
        const refreshToken = localStorage.getItem('refreshToken') ?? '';
        return this.authService.logout(refreshToken).pipe(
          map(() => AuthActions.logoutSuccess()),
          catchError(() => of(AuthActions.logoutSuccess()))
          // WHY always logoutSuccess even on error?
          // If the server call fails (network down), we still log out locally.
          // Better UX: user's session clears even if server is unavailable.
          // Security: don't leave user logged in just because network failed.
        );
      })
    )
  );

  // ── Logout Success Effect ─────────────────────────────────────────────────
  logoutSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logoutSuccess),
        tap(() => {
          localStorage.removeItem('refreshToken');
          this.router.navigate(['/auth/login']);
        })
      ),
    { dispatch: false }
  );

  // WHY clear portfolio and orders on logout?
  // NgRx state persists in memory across route navigations.
  // Without this, a second user logging in on the same browser tab would briefly
  // see the previous user's portfolio and orders — a data privacy issue.
  logoutClearPortfolio$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logoutSuccess),
      map(() => PortfolioActions.clearPortfolio())
    )
  );

  logoutClearOrders$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logoutSuccess),
      map(() => OrderActions.clearOrders())
    )
  );

  // ── Two-Factor Effects ────────────────────────────────────────────────────

  loginTwoFactorRequired$ = createEffect(
    () => this.actions$.pipe(
      ofType(AuthActions.loginTwoFactorRequired),
      // WHY dispatch: false? Navigation is a side effect — does not produce a new action.
      tap(() => this.router.navigate(['/auth/two-factor']))
    ),
    { dispatch: false }
  );

  verifyOtp$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyOtp),
      switchMap(({ request }) =>
        this.twoFactorService.verifyOtp(request).pipe(
          map(response => AuthActions.verifyOtpSuccess({ response })),
          catchError(error => of(AuthActions.verifyOtpFailure({
            error: error?.error?.message ?? 'Invalid code. Please try again.'
          })))
        )
      )
    )
  );

  verifyOtpSuccess$ = createEffect(
    () => this.actions$.pipe(
      ofType(AuthActions.verifyOtpSuccess),
      tap(({ response }) => {
        localStorage.setItem('refreshToken', response.refreshToken);
        this.router.navigate(['/dashboard']);
      })
    ),
    { dispatch: false }
  );

  verifyWebauthn$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyWebauthn),
      switchMap(({ payload }) =>
        this.twoFactorService.verifyWebAuthn(payload).pipe(
          map(response => AuthActions.verifyWebauthnSuccess({ response })),
          catchError(error => of(AuthActions.verifyWebauthnFailure({
            error: error?.error?.message ?? 'Biometric verification failed.'
          })))
        )
      )
    )
  );

  verifyWebauthnSuccess$ = createEffect(
    () => this.actions$.pipe(
      ofType(AuthActions.verifyWebauthnSuccess),
      tap(({ response }) => {
        localStorage.setItem('refreshToken', response.refreshToken);
        this.router.navigate(['/dashboard']);
      })
    ),
    { dispatch: false }
  );
}
