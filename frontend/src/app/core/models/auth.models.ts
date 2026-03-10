// WHY a dedicated models file?
// TypeScript interfaces define the SHAPE of data flowing between Angular and the backend.
// They enable:
// 1. Compile-time type checking — typos in field names caught at build, not runtime
// 2. IDE autocompletion — type 'response.' and see all available fields
// 3. Documentation — the interface IS the API contract
//
// RULE: These interfaces must EXACTLY match the Java DTOs in auth-service.
// If backend returns { accessToken, refreshToken } but we have { access_token },
// the data would be undefined at runtime — hard to debug.

/**
 * Sent to POST /api/auth/login
 * Matches Java: AuthRequest record
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Sent to POST /api/auth/register
 * Matches Java: RegisterRequest record
 */
export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  // WHY optional phone? Phone is optional in the backend (no @NotBlank).
  // TypeScript optional (?) means the field can be omitted — no need to send null.
}

/**
 * Safe user info returned in auth responses.
 * WHY "safe"? The backend never returns password, even hashed.
 * This interface only has fields that are safe for the client to know.
 * Matches Java: AuthResponse.UserInfo inner class
 */
export interface UserInfo {
  id: string;          // UUID from PostgreSQL
  email: string;
  fullName: string;
  role: 'TRADER' | 'ADMIN';
  // WHY union type? Restricts to known roles.
  // TypeScript will warn if we compare with 'SUPERADMIN' (doesn't exist).
}

/**
 * Response from POST /api/auth/login and /api/auth/register
 * Matches Java: AuthResponse class
 *
 * WHY both accessToken AND refreshToken?
 * Access token: short-lived (15min) — used on every API request
 * Refresh token: long-lived (7 days) — stored in localStorage, used only to
 *   get a new access token when the access token expires
 *
 * SECURITY: Access token stored in NgRx memory (lost on page refresh — intentional).
 * Refresh token stored in localStorage (persists) so user doesn't lose session on refresh.
 * Never store access token in localStorage — XSS attacks can steal it.
 * (But: even localStorage has risks — evaluate for your security model)
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;   // milliseconds until access token expires (900000 = 15min)
  user: UserInfo;
  // WHY optional 2FA fields? When 2FA is required, backend returns HTTP 202 with
  // requiresTwoFactor:true and a short-lived tempToken instead of the real tokens.
  requiresTwoFactor?: boolean;
  tempToken?: string;
  twoFactorMethod?: TwoFactorMethod;
  // WHY optional registration verification fields?
  // After POST /register, the backend returns HTTP 202 with requiresVerification:true
  // instead of full tokens. The user must verify their email/phone before getting real tokens.
  requiresVerification?: boolean;
  verificationMethod?: string;   // "EMAIL" or "PHONE"
  maskedContact?: string;        // e.g. "t****r@gmail.com" — where the OTP was sent
}

// Sent to POST /api/auth/verify-registration
// WHY separate from OtpVerifyRequest? Different endpoint, different claim validation server-side.
// Also no trustDevice field — device trust is only for login 2FA, not registration.
export interface RegistrationVerifyRequest {
  tempToken: string;  // registrationPending JWT from the register() response
  otp: string;        // 6-digit code from email/SMS
}

// ── Two-Factor Authentication Models ─────────────────────────────────────────

// WHY a union type? Restricts to the three methods the backend supports.
// TypeScript warns if we pass 'AUTHENTICATOR' (doesn't exist).
export type TwoFactorMethod = 'EMAIL' | 'SMS' | 'WEBAUTHN';

export interface OtpVerifyRequest {
  tempToken: string;
  otp: string;
  trustDevice: boolean;
}

export interface WebAuthnAssertionPayload {
  tempToken: string;
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string;
  trustDevice: boolean;
}

export interface TwoFactorSetupRequest {
  method: TwoFactorMethod;
  otp?: string;
}

export interface TwoFactorStatus {
  method: TwoFactorMethod | 'NONE';
  enabled: boolean;
  phoneVerified: boolean;
  emailVerified: boolean;
}

export interface TrustedDeviceInfo {
  id: string;
  deviceName: string;
  ipAddress: string;
  expiresAt: string;
}

export interface WebAuthnRegistrationRequest {
  deviceName: string;
  attestationObject: string;
  clientDataJSON: string;
}
