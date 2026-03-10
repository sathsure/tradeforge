package com.tradeforge.auth.dto;

/**
 * WHY a separate TwoFactorChallengeResponse instead of reusing AuthResponse?
 * When 2FA is required, the server cannot issue real tokens yet.
 * This response tells the Angular frontend:
 * 1. "2FA is required" (requiresTwoFactor=true)
 * 2. Which method to use (EMAIL/SMS/WEBAUTHN)
 * 3. A short-lived temp token to identify the pending session
 * 4. How long the session is valid (10 minutes)
 *
 * Angular checks: if (response.requiresTwoFactor) → navigate to /2fa-verify
 * Otherwise → response is an AuthResponse with real tokens.
 *
 * WHY not Lombok? Consistent with rest of the project — no Lombok used.
 * WHY not a record? Builder pattern is cleaner for constructing response objects.
 *
 * HTTP status: 202 Accepted (not 200 OK — the login is "accepted but not complete").
 */
public class TwoFactorChallengeResponse {

    /**
     * WHY always true here?
     * Angular discriminates on this field: if (res.requiresTwoFactor) → show OTP screen.
     * Having it explicit in the response prevents Angular needing to check for null tokens.
     */
    private boolean requiresTwoFactor = true;

    /**
     * Short-lived JWT (10 minutes) with twoFactorPending:true claim.
     * Angular sends this as the body in POST /api/auth/2fa/verify-otp.
     * JwtAuthenticationFilter REJECTS this token for any other endpoint.
     */
    private String tempToken;

    /**
     * The 2FA method configured for this user: EMAIL, SMS, or WEBAUTHN.
     * Angular uses this to decide which UI to show:
     * - EMAIL/SMS: show OTP input field
     * - WEBAUTHN: call navigator.credentials.get() immediately
     */
    private String method;

    /**
     * Milliseconds until the temp token (and the OTP) expires.
     * 600000 = 10 minutes. Angular shows a countdown timer in the OTP UI.
     */
    private long expiresIn = 600_000L;

    // WHY no-arg constructor? Jackson needs it to serialize/deserialize.
    public TwoFactorChallengeResponse() {}

    private TwoFactorChallengeResponse(boolean requiresTwoFactor, String tempToken,
                                        String method, long expiresIn) {
        this.requiresTwoFactor = requiresTwoFactor;
        this.tempToken = tempToken;
        this.method = method;
        this.expiresIn = expiresIn;
    }

    // ── Getters & Setters ──────────────────────────────────────────────────
    public boolean isRequiresTwoFactor() { return requiresTwoFactor; }
    public void setRequiresTwoFactor(boolean requiresTwoFactor) { this.requiresTwoFactor = requiresTwoFactor; }

    public String getTempToken() { return tempToken; }
    public void setTempToken(String tempToken) { this.tempToken = tempToken; }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public long getExpiresIn() { return expiresIn; }
    public void setExpiresIn(long expiresIn) { this.expiresIn = expiresIn; }

    // ── Builder ────────────────────────────────────────────────────────────
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private boolean requiresTwoFactor = true;
        private String tempToken;
        private String method;
        private long expiresIn = 600_000L;

        public Builder requiresTwoFactor(boolean r) { this.requiresTwoFactor = r; return this; }
        public Builder tempToken(String t) { this.tempToken = t; return this; }
        public Builder method(String m) { this.method = m; return this; }
        public Builder expiresIn(long e) { this.expiresIn = e; return this; }

        public TwoFactorChallengeResponse build() {
            return new TwoFactorChallengeResponse(requiresTwoFactor, tempToken, method, expiresIn);
        }
    }
}
