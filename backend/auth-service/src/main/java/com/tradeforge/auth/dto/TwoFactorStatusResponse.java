package com.tradeforge.auth.dto;

/**
 * WHY a separate response DTO for 2FA status?
 * The settings page (GET /api/auth/2fa/status) needs to show the user their
 * current 2FA configuration without exposing internal entity details.
 * This DTO is a clean projection — only what Angular needs to render the settings UI.
 *
 * Fields:
 * - method: "NONE", "EMAIL", "SMS", or "WEBAUTHN" — drives which UI tab to highlight.
 * - enabled: whether 2FA is currently active for this account.
 * - phoneVerified: whether the phone number has been verified for SMS 2FA.
 * - emailVerified: whether email has been verified for email 2FA.
 *
 * WHY not a record? Builder pattern is cleaner for constructing response objects
 * from entity fields. Records require all fields in the constructor call.
 *
 * WHY no Lombok? Consistent with rest of the project.
 */
public class TwoFactorStatusResponse {

    // WHY String instead of TwoFactorMethod enum?
    // Angular receives JSON — "EMAIL" is more useful than a raw enum ordinal.
    // String also decouples the frontend from the backend enum definition.
    private String method;

    private boolean enabled;

    // WHY phoneVerified / emailVerified in the response?
    // Angular uses these to show "verified" badges in the settings UI.
    // Example: "Email 2FA - verified ✓" vs "SMS 2FA - not verified ✗"
    private boolean phoneVerified;
    private boolean emailVerified;

    // WHY no-arg constructor? Jackson needs it for (de)serialization.
    public TwoFactorStatusResponse() {}

    private TwoFactorStatusResponse(String method, boolean enabled,
                                     boolean phoneVerified, boolean emailVerified) {
        this.method = method;
        this.enabled = enabled;
        this.phoneVerified = phoneVerified;
        this.emailVerified = emailVerified;
    }

    // ── Getters & Setters ──────────────────────────────────────────────────
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isPhoneVerified() { return phoneVerified; }
    public void setPhoneVerified(boolean phoneVerified) { this.phoneVerified = phoneVerified; }

    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }

    // ── Builder ────────────────────────────────────────────────────────────
    // WHY builder? Allows constructing this in one fluent chain in the controller.
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String method;
        private boolean enabled;
        private boolean phoneVerified;
        private boolean emailVerified;

        public Builder method(String m) { this.method = m; return this; }
        public Builder enabled(boolean e) { this.enabled = e; return this; }
        public Builder phoneVerified(boolean p) { this.phoneVerified = p; return this; }
        public Builder emailVerified(boolean e) { this.emailVerified = e; return this; }

        public TwoFactorStatusResponse build() {
            return new TwoFactorStatusResponse(method, enabled, phoneVerified, emailVerified);
        }
    }
}
