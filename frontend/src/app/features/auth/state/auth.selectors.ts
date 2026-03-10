// WHY Selectors?
// Selectors are PURE FUNCTIONS that derive data from the NgRx store state.
//
// WHY not access store state directly?
// 1. MEMOIZATION: createSelector caches results. If state didn't change,
//    the component doesn't re-render. Critical for a trading UI with rapid price updates.
// 2. ENCAPSULATION: Components don't know the store shape — only selectors do.
//    If you rename AuthState.isAuthenticated to AuthState.loggedIn,
//    you update ONE selector, not every component.
// 3. TESTING: Selectors are pure functions — trivial to unit test.
//
// USAGE IN COMPONENTS:
//   loading$ = this.store.select(selectAuthLoading);
//   <mat-spinner *ngIf="loading$ | async">

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.reducer';

// createFeatureSelector — creates a selector for the top-level state slice.
// WHY 'auth'? Matches the key in provideStore({ auth: authReducer }) in app.config.ts
// If these don't match, selector returns undefined — silent bug.
const selectAuthState = createFeatureSelector<AuthState>('auth');

// ── Public Selectors ───────────────────────────────────────────────────────

export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (state) => state.isAuthenticated
  // Used by: authGuard (route protection), Shell component (show/hide logout)
);

export const selectAccessToken = createSelector(
  selectAuthState,
  (state) => state.accessToken
  // Used by: auth.interceptor.ts to attach Bearer token to HTTP requests
);

export const selectRefreshToken = createSelector(
  selectAuthState,
  (state) => state.refreshToken
);

export const selectCurrentUser = createSelector(
  selectAuthState,
  (state) => state.user
  // Used by: ShellComponent (show "Hello, Sathish"), Dashboard (personalized greeting)
);

export const selectAuthLoading = createSelector(
  selectAuthState,
  (state) => state.loading
  // Used by: LoginComponent, RegisterComponent (show spinner, disable submit button)
);

export const selectAuthError = createSelector(
  selectAuthState,
  (state) => state.error
  // Used by: LoginComponent (show error message below form)
);

// ── Derived Selectors ──────────────────────────────────────────────────────
// Derived selectors combine multiple pieces of state for complex UI logic.

export const selectUserRole = createSelector(
  selectCurrentUser,
  (user) => user?.role ?? null
  // WHY optional chaining?
  // user is null when logged out. Accessing user.role would throw.
  // ?? null: if undefined, return null (never undefined in our state).
);

export const selectIsAdmin = createSelector(
  selectUserRole,
  (role) => role === 'ADMIN'
  // WHY derived selector? Admin-only UI elements use this.
  // If role logic changes, update here — not in every component.
);

// ── Two-Factor Selectors ────────────────────────────────────────────────────

export const selectTwoFactorPending = createSelector(
  selectAuthState,
  (s) => s.twoFactorPending
  // Used by: TwoFactorVerifyComponent guard (redirect if no pending 2FA)
);

export const selectTwoFactorMethod = createSelector(
  selectAuthState,
  (s) => s.twoFactorMethod
  // Used by: TwoFactorVerifyComponent to show correct UI (OTP boxes vs biometric button)
);

export const selectTwoFactorTempToken = createSelector(
  selectAuthState,
  (s) => s.twoFactorTempToken
  // Used by: TwoFactorVerifyComponent to include in OTP/WebAuthn verify request
);

// ── Registration Verification Selectors ─────────────────────────────────────

export const selectRegistrationPending = createSelector(
  selectAuthState,
  (s) => s.registrationPending
  // Used by: VerifyRegistrationComponent guard (redirect if no pending verification)
);

export const selectRegistrationTempToken = createSelector(
  selectAuthState,
  (s) => s.registrationTempToken
  // Used by: VerifyRegistrationComponent to include in verify/resend requests
);

export const selectRegistrationMethod = createSelector(
  selectAuthState,
  (s) => s.registrationMethod
  // Used by: VerifyRegistrationComponent to show correct icon/text (email vs phone)
);

export const selectRegistrationMaskedContact = createSelector(
  selectAuthState,
  (s) => s.registrationMaskedContact
  // Used by: VerifyRegistrationComponent to show where the OTP was sent
);
