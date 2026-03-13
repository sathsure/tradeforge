// WHY a Reducer?
// The reducer is a PURE FUNCTION that takes current state + action → returns new state.
// Pure = same input ALWAYS produces same output. No API calls, no side effects.
//
// WHY immutability? (returning new objects with spread syntax)
// Angular's change detection uses reference equality.
// If you mutate state in place, the reference doesn't change → Angular misses the update.
// The spread syntax {...state, field: newValue} creates a new object → new reference → UI updates.
//
// WHY createReducer instead of a switch statement?
// Type-safe. No 'default' case needed. No fall-through bugs.
// Better TypeScript inference on action payload types.

import { createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { UserInfo, TwoFactorMethod } from '../../../core/models/auth.models';

// WHY export the interface?
// The selectors file needs to know the shape of this state slice.
// The app-level state type will compose all feature states.
export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;    // Short-lived JWT (15 min) — kept in memory only
  refreshToken: string | null;   // Long-lived token — also persisted in localStorage by effects
  user: UserInfo | null;         // Current user's profile info
  loading: boolean;              // true while API call is in-flight — shows spinner
  error: string | null;          // Last error message — shown below the login form
  // WHY 2FA fields in auth state? They are part of the login flow session.
  // twoFactorPending=true means the user passed password but not yet 2FA.
  // tempToken is a short-lived backend token exchanged for real tokens after OTP.
  twoFactorPending: boolean;
  twoFactorTempToken: string | null;
  twoFactorMethod: TwoFactorMethod | null;
  // WHY registration verification fields?
  // After register(), the backend returns HTTP 202 with a tempToken.
  // The user must confirm their email/phone OTP before getting real tokens.
  // These fields persist the pending state across the two HTTP requests.
  registrationPending: boolean;
  registrationTempToken: string | null;
  registrationMethod: string | null;     // "EMAIL" or "PHONE"
  registrationMaskedContact: string | null; // "t****r@gmail.com" for UI display
}

// WHY separate initial state?
// Explicitly documents what the state looks like before any action.
// Also used in logoutSuccess reducer to reset to clean slate.
const initialState: AuthState = {
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  user: null,
  loading: false,
  error: null,
  twoFactorPending: false,
  twoFactorTempToken: null,
  twoFactorMethod: null,
  registrationPending: false,
  registrationTempToken: null,
  registrationMethod: null,
  registrationMaskedContact: null,
};

export const authReducer = createReducer(
  initialState,

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  on(AuthActions.login, (state) => ({
    ...state,
    loading: true,
    error: null,
    // WHY clear error? Previous error message should disappear when user tries again.
    // Loading true → spinner shows while HTTP call is in-flight.
  })),

  on(AuthActions.loginSuccess, (state, { response }) => ({
    ...state,
    isAuthenticated: true,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    loading: false,
    error: null,
    // WHY isAuthenticated: true here (not just accessToken !== null)?
    // A separate boolean is explicit and safe.
    // Guards check isAuthenticated — one clear place, no null checks scattered.
  })),

  on(AuthActions.loginFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
    // Store the error message → LoginComponent's error$ observable updates → shown in template
  })),

  // ── REGISTER ──────────────────────────────────────────────────────────────
  on(AuthActions.register, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(AuthActions.registerSuccess, (state, { response }) => ({
    ...state,
    isAuthenticated: true,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    loading: false,
    error: null,
  })),

  on(AuthActions.registerFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  on(AuthActions.logout, (state) => ({
    ...state,
    loading: true,
    // Show spinner while we wait for the server to invalidate the refresh token
  })),

  on(AuthActions.logoutSuccess, () => initialState),
  // WHY return initialState directly (not spread)?
  // Completely reset all auth state. Spread could miss new fields added later.
  // initialState is the canonical "logged out" state.

  // ── TOKEN REFRESH ─────────────────────────────────────────────────────────
  on(AuthActions.refreshTokenSuccess, (state, { accessToken }) => ({
    ...state,
    accessToken,
    // WHY only update accessToken? The refresh token and user info didn't change.
    // Only the short-lived access token is replaced with a fresh one.
  })),

  on(AuthActions.refreshTokenFailure, () => initialState),
  // Refresh failed = session truly expired. Reset to logged out state.

  // ── TWO-FACTOR ─────────────────────────────────────────────────────────────
  on(AuthActions.loginTwoFactorRequired, (state, { tempToken, method }) => ({
    ...state,
    loading: false,
    error: null,
    twoFactorPending: true,
    twoFactorTempToken: tempToken,
    twoFactorMethod: method,
    // WHY not isAuthenticated:true? User is NOT authenticated yet.
    // They passed the password check but still need to pass the 2FA check.
  })),

  on(AuthActions.verifyOtp, (state) => ({ ...state, loading: true, error: null })),

  on(AuthActions.verifyOtpSuccess, (state, { response }) => ({
    ...state,
    isAuthenticated: true,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    loading: false,
    error: null,
    twoFactorPending: false,
    twoFactorTempToken: null,
    twoFactorMethod: null,
  })),

  on(AuthActions.verifyOtpFailure, (state, { error }) => ({
    ...state, loading: false, error,
  })),

  on(AuthActions.verifyWebauthn, (state) => ({ ...state, loading: true, error: null })),

  on(AuthActions.verifyWebauthnSuccess, (state, { response }) => ({
    ...state,
    isAuthenticated: true,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    loading: false,
    error: null,
    twoFactorPending: false,
    twoFactorTempToken: null,
    twoFactorMethod: null,
  })),

  on(AuthActions.verifyWebauthnFailure, (state, { error }) => ({
    ...state, loading: false, error,
  })),

  on(AuthActions.twoFactorCancel, () => initialState),
  // WHY initialState? Cancel means "start over". Wipe all auth state including tempToken.

  // ── REGISTRATION VERIFICATION ────────────────────────────────────────────────
  on(AuthActions.registerVerificationRequired, (state, { tempToken, method, maskedContact }) => ({
    ...state,
    loading: false,
    error: null,
    registrationPending: true,
    registrationTempToken: tempToken,
    registrationMethod: method,
    registrationMaskedContact: maskedContact,
    // WHY NOT isAuthenticated:true? User is NOT authenticated yet.
    // They have an unverified account — real tokens come only after OTP verification.
  })),

  on(AuthActions.verifyRegistration, (state) => ({ ...state, loading: true, error: null })),

  on(AuthActions.verifyRegistrationSuccess, (state, { response }) => ({
    ...state,
    isAuthenticated: true,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    loading: false,
    error: null,
    registrationPending: false,
    registrationTempToken: null,
    registrationMethod: null,
    registrationMaskedContact: null,
  })),

  on(AuthActions.verifyRegistrationFailure, (state, { error }) => ({
    ...state, loading: false, error,
  })),

  on(AuthActions.resendRegistrationOtp, (state) => ({ ...state, loading: true, error: null })),

  on(AuthActions.registrationCancel, () => initialState),
  // WHY initialState? Cancel means "abandon registration". Clear pending state.

  // ── SESSION RESTORE ───────────────────────────────────────────────────────
  // WHY not set loading:true on restoreSession?
  // The APP_INITIALIZER blocks the router until success/failure resolves.
  // Setting loading here would show a spinner over nothing — the router hasn't
  // activated any route yet. The existing state is fine as-is.
  on(AuthActions.restoreSessionSuccess, (state, { accessToken, user }) => ({
    ...state,
    isAuthenticated: true,
    accessToken,
    user,
    loading: false,
    error: null,
  })),
  on(AuthActions.restoreSessionFailure, () => ({
    ...initialState,
    // WHY initialState? Restore failed = no valid session. Start fresh.
    // Router will redirect to /auth/login via authGuard.
  })),
);
