package com.tradeforge.auth.dto;

/**
 * WHY a separate AuthResponse class?
 * This is what the Angular frontend receives after login or registration.
 * Contains JWT tokens + safe user info.
 *
 * WHY no Lombok (@Data @Builder)?
 * Lombok uses internal javac APIs that are incompatible with Java 25.
 * Explicit getters/setters/builder is more transparent for a learning project.
 *
 * WHY NOT a record here?
 * Records are immutable — you set all fields in the constructor.
 * Builder pattern works better for constructing response objects step by step.
 *
 * SECURITY:
 * This class contains tokens — NEVER log the full object.
 * Anyone with the accessToken can impersonate the user for 15 minutes.
 */
public class AuthResponse {

    /**
     * Short-lived JWT access token (15 minutes).
     * Sent in Authorization: Bearer <token> header with every API request.
     */
    private String accessToken;

    /**
     * Long-lived refresh token (7 days).
     * Stored in Angular's localStorage. Used ONLY to get a new access token.
     * Stored in Redis server-side — can be revoked instantly (logout).
     */
    private String refreshToken;

    /**
     * Milliseconds until access token expires.
     * Angular uses this to schedule silent token refresh before expiry.
     */
    private long expiresIn;

    /**
     * Safe user information — only non-sensitive fields.
     * Never include password hash or internal IDs you don't want exposed.
     */
    private UserInfo user;

    // ── 2FA challenge fields (nullable — only set when HTTP 202 is returned) ──

    /**
     * WHY nullable Boolean (not primitive boolean)?
     * For normal logins (200 OK) this field is null/absent.
     * For 2FA logins (202 Accepted) this is true.
     * Angular checks: if (res.requiresTwoFactor) → show OTP screen.
     * Using Boolean (not boolean) lets Jackson omit the field entirely on normal logins.
     *
     * NOTE: For 2FA challenge responses, prefer TwoFactorChallengeResponse.
     * These fields exist here for cases where AuthResponse must carry 2FA status.
     */
    private Boolean requiresTwoFactor;

    /**
     * Short-lived JWT with twoFactorPending:true claim.
     * Only set when requiresTwoFactor=true.
     * Angular sends this back in POST /api/auth/2fa/verify-otp.
     */
    private String tempToken;

    /**
     * The 2FA method for this account: "EMAIL", "SMS", or "WEBAUTHN".
     * Only set when requiresTwoFactor=true.
     * Angular uses this to display the correct verification UI.
     */
    private String twoFactorMethod;

    // WHY no-arg constructor? Jackson (JSON deserializer) needs it.
    public AuthResponse() {}

    private AuthResponse(String accessToken, String refreshToken, long expiresIn, UserInfo user,
                         Boolean requiresTwoFactor, String tempToken, String twoFactorMethod) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresIn = expiresIn;
        this.user = user;
        this.requiresTwoFactor = requiresTwoFactor;
        this.tempToken = tempToken;
        this.twoFactorMethod = twoFactorMethod;
    }

    // ── Getters & Setters ─────────────────────────────────────────────────
    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }

    public long getExpiresIn() { return expiresIn; }
    public void setExpiresIn(long expiresIn) { this.expiresIn = expiresIn; }

    public UserInfo getUser() { return user; }
    public void setUser(UserInfo user) { this.user = user; }

    public Boolean getRequiresTwoFactor() { return requiresTwoFactor; }
    public void setRequiresTwoFactor(Boolean requiresTwoFactor) { this.requiresTwoFactor = requiresTwoFactor; }

    public String getTempToken() { return tempToken; }
    public void setTempToken(String tempToken) { this.tempToken = tempToken; }

    public String getTwoFactorMethod() { return twoFactorMethod; }
    public void setTwoFactorMethod(String twoFactorMethod) { this.twoFactorMethod = twoFactorMethod; }

    // ── Builder ───────────────────────────────────────────────────────────
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String accessToken;
        private String refreshToken;
        private long expiresIn;
        private UserInfo user;
        private Boolean requiresTwoFactor;
        private String tempToken;
        private String twoFactorMethod;

        public Builder accessToken(String t) { this.accessToken = t; return this; }
        public Builder refreshToken(String t) { this.refreshToken = t; return this; }
        public Builder expiresIn(long e) { this.expiresIn = e; return this; }
        public Builder user(UserInfo u) { this.user = u; return this; }
        public Builder requiresTwoFactor(Boolean r) { this.requiresTwoFactor = r; return this; }
        public Builder tempToken(String t) { this.tempToken = t; return this; }
        public Builder twoFactorMethod(String m) { this.twoFactorMethod = m; return this; }

        public AuthResponse build() {
            return new AuthResponse(accessToken, refreshToken, expiresIn, user,
                    requiresTwoFactor, tempToken, twoFactorMethod);
        }
    }

    /**
     * WHY static inner class instead of top-level class?
     * UserInfo only makes sense in the context of AuthResponse.
     * Keeping it here: clear that it's only used for auth responses.
     */
    public static class UserInfo {
        private String id;        // UUID from DB — sent as String (JSON doesn't have UUID type)
        private String email;
        private String fullName;
        private String role;      // "TRADER" or "ADMIN" — Angular uses this for role-based UI

        public UserInfo() {}

        private UserInfo(String id, String email, String fullName, String role) {
            this.id = id;
            this.email = email;
            this.fullName = fullName;
            this.role = role;
        }

        // Getters & Setters
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getFullName() { return fullName; }
        public void setFullName(String fullName) { this.fullName = fullName; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        // Builder
        public static Builder builder() { return new Builder(); }

        public static class Builder {
            private String id;
            private String email;
            private String fullName;
            private String role;

            public Builder id(String id) { this.id = id; return this; }
            public Builder email(String e) { this.email = e; return this; }
            public Builder fullName(String n) { this.fullName = n; return this; }
            public Builder role(String r) { this.role = r; return this; }

            public UserInfo build() { return new UserInfo(id, email, fullName, role); }
        }
    }
}
