package com.tradeforge.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * WHY a separate AuthRequest record?
 * "Auth" here means "login" — authenticating an existing user.
 * (AuthRequest is a better name than LoginRequest because it matches the
 * endpoint name: POST /api/auth/login — the "auth" domain.)
 *
 * WHY only email and password (not the full RegisterRequest)?
 * Login is minimal: we only need the user's credentials to authenticate.
 * Sending fullName or phone during login would be ignored — don't send unnecessary data.
 * Minimal API surface = fewer things to go wrong.
 *
 * SECURITY NOTE: We do NOT distinguish "wrong email" from "wrong password" errors.
 * If we said "email not found" → attacker knows which emails are registered.
 * Instead: "Invalid email or password" for both cases.
 * This prevents email enumeration attacks.
 */
public record AuthRequest(

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    String email,

    @NotBlank(message = "Password is required")
    String password
    // WHY no @Size or @Pattern here?
    // During LOGIN, the password doesn't need complexity validation.
    // We compare against the stored BCrypt hash — if it matches, it matches.
    // Applying password complexity rules at login would reject users
    // who registered before the policy was strengthened.

) {}
