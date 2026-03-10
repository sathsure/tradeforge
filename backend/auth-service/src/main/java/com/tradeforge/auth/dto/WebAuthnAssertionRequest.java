package com.tradeforge.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * WHY a record?
 * WebAuthnAssertionRequest carries the browser's authentication assertion response.
 * Immutable, no builder needed — all deserialized from JSON in one shot.
 *
 * WHY these fields?
 * These are the fields returned by navigator.credentials.get() — the WebAuthn
 * authentication ceremony. The browser signs a challenge with the private key
 * stored in the authenticator, and sends back these fields for server verification.
 *
 * Full verification flow (in production with webauthn4j):
 * 1. Decode clientDataJSON → verify challenge matches Redis, verify origin.
 * 2. Decode authenticatorData → verify rpIdHash, check user presence/verification flags.
 * 3. Verify ECDSA signature over authData + clientDataHash using stored public key.
 * 4. Check signCount > stored count (replay/clone detection).
 *
 * In dev mode: we accept any assertion if the challenge exists in Redis.
 *
 * WHY @NotBlank on the core fields?
 * tempToken, credentialId, clientDataJSON, authenticatorData, and signature are all
 * mandatory for even our simplified dev-mode verification.
 * userHandle is nullable — some authenticators send it, others don't.
 */
public record WebAuthnAssertionRequest(

        /**
         * Short-lived JWT from the 2FA challenge response (twoFactorPending:true).
         * Identifies the pending login session in Redis.
         */
        @NotBlank(message = "Temp token is required")
        String tempToken,

        /**
         * The credential ID of the authenticator being used.
         * base64url-encoded, matches WebAuthnCredential.credentialId in DB.
         * Used to look up the correct public key to verify against.
         */
        @NotBlank(message = "Credential ID is required")
        String credentialId,

        /**
         * base64url-encoded client data JSON from the browser.
         * Contains: type="webauthn.get", challenge, origin.
         * WHY verify origin? Ensures the assertion came from our site, not a phishing page.
         */
        @NotBlank(message = "Client data JSON is required")
        String clientDataJSON,

        /**
         * base64url-encoded authenticator data from the authenticator.
         * Contains: rpIdHash, flags (user present, user verified), signCount.
         * WHY signCount? Detects cloned authenticators (count should always increase).
         */
        @NotBlank(message = "Authenticator data is required")
        String authenticatorData,

        /**
         * base64url-encoded ECDSA or RSA signature over authData + clientDataHash.
         * In production: verified against the stored public key using java.security.Signature.
         * In dev mode: existence check only (signature not cryptographically verified).
         */
        @NotBlank(message = "Signature is required")
        String signature,

        /**
         * Optional user handle (base64url-encoded user.id from the registration).
         * WHY nullable? Resident-key credentials include it; server-side credentials don't.
         * Can be used as a cross-check that the credential belongs to the right user.
         */
        String userHandle,

        /**
         * If true, set the tf_dt HttpOnly cookie to trust this device for 30 days.
         * WHY false default? Safer default — explicit opt-in to trust.
         */
        boolean trustDevice
) {}
