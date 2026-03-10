package com.tradeforge.auth.dto;

/**
 * WHY a dedicated RegistrationChallengeResponse?
 * After POST /api/auth/register, if email/phone verification is required,
 * the backend returns HTTP 202 (Accepted) with this body instead of 201 with AuthResponse.
 *
 * 202 signals to the frontend: "Account created, but not ready — verification pending."
 * The tempToken carries the session across the two HTTP requests:
 *   1. POST /register  → returns this DTO
 *   2. POST /verify-registration (submits tempToken + OTP) → returns real AuthResponse
 *
 * WHY Builder pattern?
 * Follows the same pattern as TwoFactorChallengeResponse for consistency.
 * Static factory method prevents accidental instantiation with all-null fields.
 *
 * WHY maskedContact?
 * Shows the user where the OTP was sent without revealing the full address.
 * "We sent a code to t***r@gmail.com" is both informative and privacy-preserving.
 */
public class RegistrationChallengeResponse {

    private final boolean requiresVerification = true;
    // WHY final + always true? This field is the discriminator Angular checks.
    // Angular sees requiresVerification:true → show verify screen instead of dashboard.

    private final String tempToken;
    // Short-lived JWT (10 min) with registrationPending:true claim.
    // Angular sends this back in POST /verify-registration so the backend
    // can look up which userId to verify without a server-side session.

    private final String verificationMethod;
    // "EMAIL" or "PHONE" — tells Angular which icon/text to show in the UI.

    private final String maskedContact;
    // Partially masked: "t***@gmail.com" or "+91****7890"
    // Shows where the OTP was sent without revealing the full address.

    private final long expiresIn;
    // Milliseconds until the tempToken expires (600_000 = 10 minutes).
    // Angular can show a countdown: "Code expires in X:XX"

    private RegistrationChallengeResponse(String tempToken, String verificationMethod,
                                          String maskedContact, long expiresIn) {
        this.tempToken = tempToken;
        this.verificationMethod = verificationMethod;
        this.maskedContact = maskedContact;
        this.expiresIn = expiresIn;
    }

    public boolean isRequiresVerification() { return requiresVerification; }
    public String getTempToken() { return tempToken; }
    public String getVerificationMethod() { return verificationMethod; }
    public String getMaskedContact() { return maskedContact; }
    public long getExpiresIn() { return expiresIn; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String tempToken;
        private String verificationMethod;
        private String maskedContact;
        private long expiresIn = 600_000L;

        public Builder tempToken(String t) { this.tempToken = t; return this; }
        public Builder verificationMethod(String m) { this.verificationMethod = m; return this; }
        public Builder maskedContact(String c) { this.maskedContact = c; return this; }
        public Builder expiresIn(long ms) { this.expiresIn = ms; return this; }

        public RegistrationChallengeResponse build() {
            return new RegistrationChallengeResponse(tempToken, verificationMethod, maskedContact, expiresIn);
        }
    }
}
