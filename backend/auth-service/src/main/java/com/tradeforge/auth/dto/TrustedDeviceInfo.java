package com.tradeforge.auth.dto;

/**
 * WHY a record for TrustedDeviceInfo?
 * This is a read-only projection sent to Angular for the settings page.
 * Records are ideal for immutable data transfer objects — compact, final fields.
 *
 * WHY String for id (not UUID)?
 * JSON doesn't have a UUID type. String is the standard representation.
 * Angular uses this as the id for DELETE /api/auth/2fa/trusted-devices/{id}.
 *
 * WHY String for expiresAt (not LocalDateTime)?
 * Sending a formatted string ("2026-04-07T14:30:00") is simpler than configuring
 * Jackson's date-time serialization on both sides.
 * Angular can directly display this or parse it with new Date(expiresAt).
 *
 * SECURITY: Do NOT include deviceToken in this response.
 * The device token is the fingerprint used for trust — exposing it in the API
 * would let a compromised session read and replay device tokens.
 */
public record TrustedDeviceInfo(

        /**
         * UUID of the TrustedDevice DB record (for DELETE revocation).
         * WHY String? JSON-safe. Angular passes it back in DELETE /trusted-devices/{id}.
         */
        String id,

        /**
         * Human-readable device label: "MacBook Chrome", "iPhone Safari", etc.
         * Set by TrustedDeviceService based on User-Agent parsing.
         */
        String deviceName,

        /**
         * IP address from which the device was trusted.
         * WHY expose? Security audit — user can see "I don't recognize that IP address".
         */
        String ipAddress,

        /**
         * ISO-8601 formatted expiry timestamp.
         * Angular shows "Expires: April 7, 2026" to help users decide whether to revoke.
         */
        String expiresAt
) {}
