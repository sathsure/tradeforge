package com.tradeforge.auth.dto;

import jakarta.validation.constraints.*;

/**
 * WHY a Java record for RegisterRequest?
 * Java 21 records are the ideal DTO:
 * - Immutable: once created, fields can't change (security property)
 * - Compact: ONE line per field replaces 5 lines of getter/setter/constructor
 * - Auto-generated: constructor, getters, equals, hashCode, toString
 *
 * WHY separate file instead of keeping in AuthDtos.java?
 * Java rule: only ONE public type per file, filename must match the public type.
 * AuthController imports "com.tradeforge.auth.dto.RegisterRequest" —
 * Java resolves this to RegisterRequest.java in that package.
 * A public type in a wrongly-named file = COMPILE ERROR.
 *
 * VALIDATION:
 * @Valid in AuthController triggers Bean Validation on this record.
 * Without @Valid, these annotations are IGNORED — request arrives unvalidated.
 * Defense in depth: frontend validates too, but backend MUST validate independently.
 */
public record RegisterRequest(

    @NotBlank(message = "Full name is required")
    @Size(min = 2, max = 100, message = "Name must be 2-100 characters")
    String fullName,

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    // WHY @Email? Prevents garbage data and email header injection attacks.
    // Example injection: "victim@domain.com\nBcc: attacker@evil.com"
    // @Email rejects strings containing newlines.
    String email,

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    @Pattern(
        regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]+$",
        message = "Password must contain uppercase, lowercase, number, and special character"
    )
    // WHY this regex? Enforces password strength at the API boundary.
    // Even if frontend validation is bypassed (Postman, curl), backend rejects weak passwords.
    // This is the real validation layer — frontend validation is just UX.
    String password,

    @Pattern(regexp = "^[+]?[0-9]{10,15}$", message = "Invalid phone number")
    // WHY nullable? Phone is optional — user may not provide it.
    // @Pattern on null value is VALID (Bean Validation skips null for @Pattern by default).
    // Only validates IF the phone field is provided.
    String phone

) {}
