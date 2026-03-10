package com.tradeforge.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * WHY a record?
 * TwoFactorSetupRequest carries setup/enrollment data — immutable, no logic.
 * Reused for both send-enroll-otp and verify-enroll-otp endpoints.
 *
 * WHY not @NotBlank on otp?
 * The send-enroll-otp endpoint only needs the method (to know where to send).
 * The verify-enroll-otp endpoint needs both method and otp.
 * Making otp nullable here allows one DTO for both use cases.
 * Service methods validate otp presence when needed.
 *
 * WHY @NotBlank on method?
 * We must know the 2FA method to configure. "EMAIL", "SMS", or "WEBAUTHN".
 * Fail fast if this is missing — nothing else can proceed without it.
 */
public record TwoFactorSetupRequest(

        /**
         * The 2FA method to enroll: "EMAIL", "SMS", or "WEBAUTHN".
         * Must match TwoFactorMethod enum values (case-insensitive in service).
         */
        @NotBlank(message = "2FA method is required")
        String method,

        /**
         * The OTP entered by the user during enrollment verification.
         * WHY nullable? Not needed for the "send OTP" step — only for "verify OTP" step.
         * The verify-enroll-otp service method validates this is non-null/non-blank.
         */
        String otp
) {}
