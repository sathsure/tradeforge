package com.tradeforge.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * WHY a record?
 * WebAuthnRegisterRequest carries the browser's attestation response data.
 * Immutable, no builder needed — all set at JSON deserialization time.
 *
 * WHY these three fields?
 * These are the three pieces of data the browser returns from
 * navigator.credentials.create() (the WebAuthn registration ceremony):
 *
 * - deviceName: user-provided label ("My MacBook"), stored for the settings page.
 *   The browser does not supply this — Angular must ask the user.
 *
 * - attestationObject: CBOR-encoded attestation statement from the authenticator.
 *   Contains the public key, credential ID, and authenticator data.
 *   In production: verify this with webauthn4j.
 *   In dev (attestation=none): we trust the client-supplied public key.
 *
 * - clientDataJSON: base64url-encoded JSON containing the challenge, origin, and type.
 *   We verify the challenge matches what we stored in Redis.
 *   This prevents replay attacks from other origins.
 *
 * WHY @NotBlank on all three?
 * All three are required to register a WebAuthn credential.
 * Fail fast at the HTTP layer if any are missing.
 */
public record WebAuthnRegisterRequest(

        /**
         * Human-readable device label set by the user.
         * Example: "Work Laptop", "iPhone 15", "YubiKey 5C NFC"
         * Shown in the settings trusted-devices list.
         */
        @NotBlank(message = "Device name is required")
        String deviceName,

        /**
         * base64url-encoded attestation object from the authenticator.
         * Contains: authData (credential ID + public key) + attestation statement.
         * WHY base64url? Binary data from the authenticator — must be encoded for JSON transport.
         */
        @NotBlank(message = "Attestation object is required")
        String attestationObject,

        /**
         * base64url-encoded client data JSON from the browser.
         * Contains: type, challenge, origin, crossOriginStatus.
         * WHY verify challenge here? Ensures this registration was initiated by OUR server.
         * Without challenge verification, an attacker could replay a credential from another site.
         */
        @NotBlank(message = "Client data JSON is required")
        String clientDataJSON
) {}
