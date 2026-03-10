package com.tradeforge.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * WHY a Java record?
 * Registration verification has exactly two inputs: tempToken + otp.
 * Records auto-generate constructor, getters, equals, hashCode, toString.
 * Immutable by design — the request body should not be mutated after parsing.
 *
 * WHY validate otp size?
 * Guards against submissions with wrong-length codes (typos, paste errors).
 * A 4-digit or 8-digit OTP should fail fast with a 400, not proceed to Redis lookup.
 */
public record RegistrationVerifyRequest(

    @NotBlank(message = "Verification token is required")
    String tempToken,
    // WHY include tempToken instead of reading userId from a cookie/session?
    // We're stateless — no server-side session. The tempToken is a signed JWT
    // that proves the user completed the registration step and received an OTP.
    // It carries the userId safely without storing state on the server.

    @NotBlank(message = "OTP is required")
    @Size(min = 6, max = 6, message = "OTP must be exactly 6 digits")
    String otp
    // WHY exact 6 digits? Our OtpService always generates 6-digit codes.
    // Enforcing this at DTO level fails fast — no unnecessary Redis lookup.
) {}
