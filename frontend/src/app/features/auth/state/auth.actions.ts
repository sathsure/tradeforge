// WHY NgRx Actions?
// Actions are the EVENTS of your application.
// Every user action and server response is an action:
//   "User clicked Login" → AuthActions.login
//   "Server returned token" → AuthActions.loginSuccess
//   "Server returned 401" → AuthActions.loginFailure
//
// WHY describe events, not commands?
// Actions are history — they record WHAT HAPPENED, not what to DO.
// This is what enables time-travel debugging: replay the action log
// and see exactly how state evolved.
//
// WHY createActionGroup?
// Groups related actions under one source ('Auth').
// Generates type-safe action creators automatically.
// Without it: 10+ separate createAction() calls, more boilerplate.

import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  LoginRequest, RegisterRequest, AuthResponse,
  TwoFactorMethod, OtpVerifyRequest, WebAuthnAssertionPayload,
  RegistrationVerifyRequest
} from '../../../core/models/auth.models';

export const AuthActions = createActionGroup({
  source: 'Auth',
  // WHY source: 'Auth'? Shows in Redux DevTools as "[Auth] Login", "[Auth] Login Success"
  // Makes it immediately clear which feature dispatched which action.
  events: {

    // ── LOGIN FLOW ────────────────────────────────────────────────────────────
    'Login': props<{ request: LoginRequest }>(),
    // WHY pass the full request object?
    // The effect needs email+password to call the API.
    // Passing them together in one action keeps the payload atomic.

    'Login Success': props<{ response: AuthResponse }>(),
    // WHY pass the full response?
    // Reducer stores tokens + user info. Effect navigates to dashboard.
    // Both need the full response — passing it through the action avoids duplicating the API call.

    'Login Failure': props<{ error: string }>(),
    // WHY string not Error object?
    // NgRx state must be serializable (plain JSON).
    // Error objects have non-serializable properties (stack trace).
    // Extract the message string before putting in state.

    // ── REGISTER FLOW ─────────────────────────────────────────────────────────
    'Register': props<{ request: RegisterRequest }>(),
    'Register Success': props<{ response: AuthResponse }>(),
    'Register Failure': props<{ error: string }>(),

    // ── LOGOUT FLOW ───────────────────────────────────────────────────────────
    'Logout': emptyProps(),
    // WHY emptyProps? No payload needed — effect reads refresh token from localStorage.
    'Logout Success': emptyProps(),

    // ── TOKEN REFRESH FLOW ────────────────────────────────────────────────────
    // These actions are dispatched by the HTTP interceptor via the store
    'Refresh Token': emptyProps(),
    'Refresh Token Success': props<{ accessToken: string }>(),
    'Refresh Token Failure': emptyProps(),
    // WHY dispatch failure action? Failure = session expired.
    // Reducer clears state (forces re-login). Effect redirects to /auth/login.

    // ── TWO-FACTOR FLOW ──────────────────────────────────────────────────────
    'Login Two Factor Required': props<{ tempToken: string; method: TwoFactorMethod }>(),
    // WHY a separate action? When login returns requiresTwoFactor:true (HTTP 202),
    // we do NOT authenticate the user yet. We store a tempToken and navigate to /auth/two-factor.
    // The real tokens are only set after OTP or WebAuthn verification succeeds.

    'Verify Otp': props<{ request: OtpVerifyRequest }>(),
    'Verify Otp Success': props<{ response: AuthResponse }>(),
    'Verify Otp Failure': props<{ error: string }>(),

    'Verify Webauthn': props<{ payload: WebAuthnAssertionPayload }>(),
    'Verify Webauthn Success': props<{ response: AuthResponse }>(),
    'Verify Webauthn Failure': props<{ error: string }>(),

    'Resend Otp': emptyProps(),
    // WHY emptyProps? The tempToken is already in state; effect reads it from there.
    // User clicks "Resend code" — effect calls send-enroll-otp endpoint.

    'Two Factor Cancel': emptyProps(),
    // WHY emptyProps? User clicks "Back to login" — reducer resets 2FA slice to initial state.

    // ── REGISTRATION VERIFICATION FLOW ───────────────────────────────────────
    // Triggered by register() returning HTTP 202 with requiresVerification:true.
    // The user must confirm ownership of their email (or phone) before getting real tokens.

    'Register Verification Required': props<{
      tempToken: string;
      method: string;         // "EMAIL" or "PHONE"
      maskedContact: string;  // "t****r@gmail.com" — shown in verify UI
    }>(),
    // WHY store maskedContact in state? The verify-registration component needs it to display
    // "We sent a code to t****r@gmail.com" without calling the backend again.

    'Verify Registration': props<{ request: RegistrationVerifyRequest }>(),

    'Verify Registration Success': props<{ response: AuthResponse }>(),

    'Verify Registration Failure': props<{ error: string }>(),

    'Resend Registration Otp': emptyProps(),
    // WHY emptyProps? The registrationTempToken is already in state.
    // The effect reads it and calls POST /api/auth/resend-registration-otp.

    'Registration Cancel': emptyProps(),
    // User clicks "Back to registration" from verify screen — clears pending state.
  }
});
