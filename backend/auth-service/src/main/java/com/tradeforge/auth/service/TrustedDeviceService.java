package com.tradeforge.auth.service;

import com.tradeforge.auth.dto.TrustedDeviceInfo;
import com.tradeforge.auth.entity.TrustedDevice;
import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.repository.TrustedDeviceRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * WHY @Service?
 * Spring singleton. TrustedDeviceRepository is injected once and reused.
 *
 * WHY @Transactional?
 * isDeviceTrusted, trustDevice, revokeDevice all need consistent DB reads.
 * Without a transaction, two reads in the same request might see different data.
 *
 * Trusted Device Flow:
 * 1. User logs in with 2FA on their home laptop.
 * 2. Checks "Trust this device for 30 days".
 * 3. Server: computeFingerprint(userId, request) → SHA-256 hash.
 * 4. Server: saves TrustedDevice record, sets tf_dt cookie with fingerprint.
 * 5. Next login from same browser: tf_dt cookie sent automatically.
 * 6. Server: reads cookie, calls isDeviceTrusted(userId, fingerprint).
 * 7. If trusted: skip 2FA, issue access token directly.
 *
 * WHY SHA-256 fingerprint and not a random UUID?
 * Same device+browser will always produce the same fingerprint.
 * This means you can detect "this is already trusted" before saving a duplicate record.
 * The cookie value itself IS the fingerprint — idempotent.
 *
 * WHY HttpOnly cookie?
 * JavaScript cannot read HttpOnly cookies — XSS attacks can't steal the device token.
 * The browser sends it automatically on every request to our domain.
 */
@Service
@Transactional
public class TrustedDeviceService {

    private static final Logger log = LoggerFactory.getLogger(TrustedDeviceService.class);

    private final TrustedDeviceRepository repo;

    // WHY 30 days? Balance between security (shorter = more 2FA) and UX (longer = less friction).
    // 30 days is a common industry standard (GitHub, Google use similar periods).
    private static final int TRUST_DAYS = 30;

    // WHY this cookie name? "tf" = TradeForge, "dt" = device token.
    // Short names reduce cookie header size slightly. Also not obvious what it is.
    private static final String COOKIE_NAME = "tf_dt";

    // WHY this salt? Prevents fingerprint collisions across different deployments.
    // Also: if an attacker somehow predicts the User-Agent, they'd still need this salt.
    // In production: move to application.yml / environment variable.
    private static final String DEVICE_SALT = "tradeforge-device-salt-2024";

    // WHY DateTimeFormatter? ISO_LOCAL_DATE_TIME gives us "2026-04-07T14:30:00" — parseable by Angular.
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public TrustedDeviceService(TrustedDeviceRepository repo) {
        this.repo = repo;
    }

    /**
     * Computes a SHA-256 fingerprint from userId + User-Agent + salt.
     *
     * WHY combine these three?
     * - userId: fingerprint is scoped to this user only (no cross-user collision).
     * - User-Agent: identifies the browser+OS combo (Chrome on Mac vs Firefox on Windows).
     * - Salt: prevents pre-computation attacks; adds entropy even if UA is guessed.
     *
     * WHY NOT include IP address?
     * IP addresses change (mobile networks, VPNs, ISP DHCP).
     * Including IP would cause "trusted device" to fail when the user's IP changes.
     * User-Agent is stable across IP changes.
     *
     * WHY HexFormat.of().formatHex(hash)?
     * Java 17+ HexFormat produces a lowercase hex string from byte[].
     * It's the modern replacement for manual byte-to-hex loops.
     * Result: 64-char hex string (256 bits / 4 bits per hex char).
     *
     * @param userId  the user's UUID
     * @param request the HTTP request (to extract User-Agent)
     * @return 64-character SHA-256 hex fingerprint
     */
    public String computeFingerprint(UUID userId, HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        if (userAgent == null) userAgent = "unknown";

        String data = userId.toString() + userAgent + DEVICE_SALT;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            // WHY UUID fallback? SHA-256 is mandated by Java spec — this should never happen.
            // But if it somehow does, we fall back to a random token (no trust) rather than crashing.
            log.error("SHA-256 not available — falling back to random fingerprint. This should not happen.", e);
            return UUID.randomUUID().toString().replace("-", "");
        }
    }

    /**
     * Returns true if the given fingerprint exists in DB for this user AND hasn't expired.
     *
     * WHY check both userId and fingerprint?
     * If an attacker stole the tf_dt cookie value, they'd need to also know (or guess)
     * the correct userId. The DB lookup enforces the userId binding.
     *
     * WHY check expiresAt > now in the query?
     * We don't run a cleanup job every minute. Expired records may still be in DB.
     * The findByDeviceToken query retrieves the record; we then check expiry in Java.
     * Alternative: use findByUserIdAndExpiresAtAfter — but we have only the fingerprint here.
     *
     * @param userId      the user's UUID (from the JWT or loaded User)
     * @param fingerprint the SHA-256 fingerprint from the tf_dt cookie
     * @return true if the device is trusted and active
     */
    @Transactional(readOnly = true)
    public boolean isDeviceTrusted(UUID userId, String fingerprint) {
        if (fingerprint == null || fingerprint.isBlank()) return false;

        return repo.findByDeviceToken(fingerprint)
                .filter(device -> device.getUser().getId().equals(userId))
                .filter(device -> device.getExpiresAt().isAfter(LocalDateTime.now()))
                .isPresent();
    }

    /**
     * Saves a new trusted device record and sets the tf_dt HttpOnly cookie.
     *
     * WHY upsert-like logic (check existing before save)?
     * If user clicks "Trust this device" on the same machine twice,
     * we don't want duplicate DB records. Re-trust: update the expiry.
     *
     * WHY use response.addHeader for cookie (not standard Cookie API)?
     * Java's Cookie class doesn't support the SameSite attribute.
     * The SameSite=Strict attribute prevents the cookie from being sent in
     * cross-site requests — important CSRF mitigation for cookies.
     * Manual Set-Cookie header: full control over all attributes.
     *
     * Cookie attributes:
     * - HttpOnly: JS can't read it (XSS protection)
     * - Path=/: valid for all paths
     * - Max-Age=2592000: 30 days in seconds
     * - SameSite=Strict: only sent for same-origin requests (CSRF protection)
     *
     * @param user        the User entity (for device.setUser())
     * @param fingerprint the SHA-256 fingerprint to store and set in cookie
     * @param request     the HTTP request (for IP address extraction)
     * @param response    the HTTP response (to set the cookie)
     */
    public void trustDevice(User user, String fingerprint,
                            HttpServletRequest request, HttpServletResponse response) {
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(TRUST_DAYS);

        // WHY findByDeviceToken first? Prevent duplicate records for the same device.
        // If already trusted, just update the expiry (refresh the 30-day window).
        repo.findByDeviceToken(fingerprint).ifPresentOrElse(
                existing -> {
                    existing.setExpiresAt(expiresAt);
                    repo.save(existing);
                    log.debug("Refreshed trust for existing device fingerprint for userId={}", user.getId());
                },
                () -> {
                    String deviceName = extractDeviceName(request.getHeader("User-Agent"));
                    String ipAddress = extractClientIp(request);

                    TrustedDevice device = TrustedDevice.builder()
                            .user(user)
                            .deviceToken(fingerprint)
                            .deviceName(deviceName)
                            .ipAddress(ipAddress)
                            .expiresAt(expiresAt)
                            .build();
                    repo.save(device);
                    log.info("New trusted device registered for userId={}, name='{}'",
                            user.getId(), deviceName);
                }
        );

        // Set the HttpOnly cookie — browser sends it automatically on subsequent requests
        // WHY Max-Age instead of Expires? Max-Age is more reliable across browsers.
        // Expires is a date string that can have timezone issues. Max-Age is seconds — unambiguous.
        response.addHeader("Set-Cookie",
                COOKIE_NAME + "=" + fingerprint
                        + "; Path=/"
                        + "; HttpOnly"
                        + "; Max-Age=2592000"  // 30 days in seconds
                        + "; SameSite=Strict");
    }

    /**
     * Returns all active (non-expired) trusted devices for the settings page.
     * WHY readOnly=true? This is a pure SELECT — no changes needed.
     * readOnly hint allows DB to skip write transaction overhead.
     *
     * @param userId the user's UUID
     * @return list of TrustedDeviceInfo DTOs for Angular settings page
     */
    @Transactional(readOnly = true)
    public List<TrustedDeviceInfo> getActiveTrustedDevices(UUID userId) {
        return repo.findByUserIdAndExpiresAtAfter(userId, LocalDateTime.now())
                .stream()
                .map(device -> new TrustedDeviceInfo(
                        device.getId().toString(),
                        device.getDeviceName(),
                        device.getIpAddress(),
                        device.getExpiresAt().format(FORMATTER)
                ))
                .collect(Collectors.toList());
    }

    /**
     * Revokes a specific trusted device by its DB UUID.
     *
     * WHY check userId ownership before deleting?
     * A user should only be able to revoke their OWN devices.
     * Without this check, a malicious user could guess a device UUID and
     * revoke another user's trusted device (privilege escalation).
     *
     * @param deviceId the UUID of the TrustedDevice record to revoke
     * @param userId   the UUID of the requesting user (ownership check)
     * @throws ResponseStatusException 404 if device not found, 403 if not owner
     */
    public void revokeDevice(UUID deviceId, UUID userId) {
        TrustedDevice device = repo.findById(deviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Trusted device not found"));

        // WHY explicit ownership check? Even with user-scoped JWTs, defense in depth.
        if (!device.getUser().getId().equals(userId)) {
            log.warn("Unauthorized device revocation attempt: userId={} tried to revoke deviceId={}",
                    userId, deviceId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You can only revoke your own devices");
        }

        repo.delete(device);
        log.info("Trusted device revoked: deviceId={} by userId={}", deviceId, userId);
    }

    /**
     * Reads the device fingerprint from the tf_dt HttpOnly cookie.
     *
     * WHY iterate cookies instead of using a map?
     * Servlet API provides cookies as an array, not a map.
     * Simple linear scan is fine — there are rarely more than 5-10 cookies.
     *
     * @param request the HTTP request containing cookies
     * @return the fingerprint value, or null if cookie not present
     */
    public String getDeviceFingerprint(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;

        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    // ── Private Helpers ───────────────────────────────────────────────────

    /**
     * Extracts a human-readable device name from the User-Agent string.
     * WHY simplified parsing? Full UA parsing requires a library (ua-parser).
     * Simple string contains() checks cover >95% of common devices.
     * "Unknown Device" is an acceptable fallback.
     */
    private String extractDeviceName(String userAgent) {
        if (userAgent == null) return "Unknown Device";

        // WHY check OS before browser? OS is more meaningful for device identification.
        String os = "Unknown OS";
        if (userAgent.contains("Windows")) os = "Windows";
        else if (userAgent.contains("Macintosh") || userAgent.contains("Mac OS")) os = "Mac";
        else if (userAgent.contains("iPhone")) os = "iPhone";
        else if (userAgent.contains("iPad")) os = "iPad";
        else if (userAgent.contains("Android")) os = "Android";
        else if (userAgent.contains("Linux")) os = "Linux";

        String browser = "Unknown Browser";
        if (userAgent.contains("Chrome") && !userAgent.contains("Chromium")) browser = "Chrome";
        else if (userAgent.contains("Firefox")) browser = "Firefox";
        else if (userAgent.contains("Safari") && !userAgent.contains("Chrome")) browser = "Safari";
        else if (userAgent.contains("Edge")) browser = "Edge";

        return os + " / " + browser;
    }

    /**
     * Extracts the real client IP, accounting for reverse proxies.
     * WHY check X-Forwarded-For first? In production, requests pass through
     * an API Gateway / load balancer. request.getRemoteAddr() returns the
     * proxy's IP, not the client's IP. X-Forwarded-For contains the real client IP.
     * WHY split(",")[0]? X-Forwarded-For can be "clientIP, proxy1, proxy2".
     * The first entry is the original client.
     */
    private String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
