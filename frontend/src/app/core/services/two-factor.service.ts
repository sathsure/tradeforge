// WHY a dedicated TwoFactorService?
// Centralises all /api/auth/2fa HTTP calls in one place.
// Components and effects import one service — not scattered http.post() calls.
// If the backend URL changes, update here only.

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OtpVerifyRequest,
  WebAuthnAssertionPayload,
  TwoFactorStatus,
  TwoFactorSetupRequest,
  TrustedDeviceInfo,
  WebAuthnRegistrationRequest,
  AuthResponse
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
// WHY providedIn: 'root'? Single instance shared across the app.
// Angular tree-shakes it if nothing imports it.
export class TwoFactorService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/auth/2fa`;

  // ── Login-time verification ───────────────────────────────────────────────

  // Exchanges tempToken + 6-digit OTP for the real JWT pair
  verifyOtp(request: OtpVerifyRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/verify-otp`, request);
  }

  // Exchanges tempToken + WebAuthn assertion for the real JWT pair
  verifyWebAuthn(payload: WebAuthnAssertionPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/verify-webauthn`, payload);
  }

  // ── Status & enrollment ───────────────────────────────────────────────────

  // Returns current 2FA configuration for the logged-in user
  getStatus(): Observable<TwoFactorStatus> {
    return this.http.get<TwoFactorStatus>(`${this.base}/status`);
  }

  // Sends OTP to email/phone for enrollment (before 2FA is active)
  sendEnrollOtp(method: string): Observable<void> {
    return this.http.post<void>(`${this.base}/send-enroll-otp`, { method });
  }

  // Verifies the enrollment OTP and activates 2FA for the chosen method
  verifyEnrollOtp(request: TwoFactorSetupRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/verify-enroll-otp`, request);
  }

  // Deactivates 2FA for the account
  disable2fa(): Observable<void> {
    return this.http.post<void>(`${this.base}/disable`, {});
  }

  // ── WebAuthn registration ─────────────────────────────────────────────────

  // Returns PublicKeyCredentialCreationOptions from the server
  getWebAuthnRegisterOptions(): Observable<any> {
    return this.http.get<any>(`${this.base}/webauthn/register-options`);
  }

  // Submits attestation from navigator.credentials.create()
  registerWebAuthn(request: WebAuthnRegistrationRequest): Observable<any> {
    return this.http.post<any>(`${this.base}/webauthn/register`, request);
  }

  // Returns PublicKeyCredentialRequestOptions for the login challenge
  getWebAuthnAssertionOptions(tempToken: string): Observable<any> {
    return this.http.get<any>(`${this.base}/webauthn/assertion-options`, { params: { tempToken } });
  }

  // ── Trusted devices ───────────────────────────────────────────────────────

  // Lists devices the user has previously marked as trusted
  getTrustedDevices(): Observable<TrustedDeviceInfo[]> {
    return this.http.get<TrustedDeviceInfo[]>(`${this.base}/trusted-devices`);
  }

  // Removes a trusted device by its server-assigned ID
  revokeTrustedDevice(deviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/trusted-devices/${deviceId}`);
  }
}
