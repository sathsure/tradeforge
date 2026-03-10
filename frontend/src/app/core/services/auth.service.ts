// WHY a dedicated AuthService?
// Centralizes ALL HTTP calls to the auth-service backend.
// Components and NgRx Effects call this service — they never use HttpClient directly.
//
// BENEFIT: If the API URL changes from /api/auth to /v2/auth,
// we change it in ONE place, not in every component.
//
// SEPARATION OF CONCERNS:
// - AuthService: knows HOW to call the API (HTTP, headers, URL)
// - NgRx Effects: knows WHEN to call the API (in response to actions)
// - Components: know WHAT to display (reactive to NgRx store state)

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { LoginRequest, RegisterRequest, AuthResponse, RegistrationVerifyRequest } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
// WHY providedIn: 'root'?
// Creates a SINGLETON — one instance shared across the entire app.
// NgRx effects, interceptors, and components all share the SAME service instance.
// If provided in a component, a new instance is created per component — breaks singleton.
export class AuthService {

  // WHY inject() function instead of constructor injection?
  // Angular 14+ functional injection: cleaner syntax, works outside constructor.
  // Equivalent to: constructor(private http: HttpClient) {}
  // But more composable — can be used in standalone functions, not just class constructors.
  private readonly http = inject(HttpClient);

  // Base URL from environment — swaps between localhost (dev) and real API (prod)
  // WHY include /api/auth here? DRY — don't repeat this prefix in every method.
  private readonly baseUrl = `${environment.apiUrl}/api/auth`;

  /**
   * Authenticates an existing user.
   * Called by NgRx AuthEffects in response to AuthActions.login()
   *
   * WHY return Observable<AuthResponse> not Promise?
   * Observables integrate with NgRx effects (ofType, switchMap),
   * can be cancelled, composed, retried, and support multiple values.
   * Promises cannot be cancelled — important for preventing stale responses.
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, request);
    // WHY post<AuthResponse>? The generic type tells Angular HttpClient to
    // deserialize the JSON response body into AuthResponse type.
    // Without it, the response type is Object — no type safety.
  }

  /**
   * Creates a new trader account.
   * On success, backend auto-logs in and returns tokens (no separate login step).
   */
  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register`, request);
  }

  /**
   * Submits the email/phone OTP to verify a newly registered account.
   * On success, backend returns full JWT tokens — user is immediately logged in.
   * Called by NgRx AuthEffects in response to AuthActions.verifyRegistration()
   */
  verifyRegistration(request: RegistrationVerifyRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/verify-registration`, request);
  }

  /**
   * Requests a new registration OTP using the existing tempToken.
   * Called when the user clicks "Resend code" on the verify-registration screen.
   * Returns a new AuthResponse-shaped object with fresh tempToken and maskedContact.
   */
  resendRegistrationOtp(tempToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/resend-registration-otp`, { tempToken });
  }

  /**
   * Exchanges refresh token for a new access token.
   * Called by auth.interceptor.ts when a 401 response is received.
   *
   * WHY return Observable<string> not Observable<AuthResponse>?
   * The interceptor only needs the new access token to retry the failed request.
   * We map the full response to just the token for a cleaner API.
   *
   * WHY X-Refresh-Token header?
   * The backend reads the token from this custom header.
   * Using a header instead of body prevents accidental logging of the token.
   */
  refreshToken(): Observable<string> {
    const token = localStorage.getItem('refreshToken') ?? '';
    return this.http
      .post<AuthResponse>(
        `${this.baseUrl}/refresh`,
        {},
        { headers: { 'X-Refresh-Token': token } }
      )
      .pipe(
        map(response => response.accessToken)
        // WHY map here? Transform Observable<AuthResponse> → Observable<string>
        // The interceptor expects Observable<string> to set the Authorization header.
      );
  }

  /**
   * Invalidates refresh token on the server.
   * Called by NgRx AuthEffects in response to AuthActions.logout()
   * Even if this fails (network error), we still clear local state.
   */
  logout(refreshToken: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/logout`,
      {},
      { headers: { 'X-Refresh-Token': refreshToken } }
    );
  }
}
