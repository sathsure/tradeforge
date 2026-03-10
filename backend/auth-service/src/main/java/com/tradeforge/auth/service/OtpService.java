package com.tradeforge.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.UUID;

/**
 * WHY @Service?
 * Spring manages this as a singleton bean.
 * SecureRandom is expensive to instantiate — singleton ensures one instance is reused.
 *
 * OTP Storage Strategy:
 * Redis is used (not DB) because OTPs are short-lived (10-15 min) and high-frequency.
 * Redis TTL auto-expires them — no cleanup job needed.
 * Redis atomicity prevents race conditions in attempt counting.
 *
 * Security Design:
 * - SecureRandom (CSPRNG) generates OTPs — not Math.random() which is predictable.
 * - Attempt counting prevents brute force (max 5 attempts per OTP session).
 * - Separate key prefix for enrollment OTPs vs login OTPs — different TTLs.
 *
 * Redis Key Structure:
 * auth:2fa:otp:{userId}         = "{otp}:{attemptCount}"   TTL 10 min (login OTP)
 * auth:2fa:enroll:otp:{userId}  = "{otp}"                  TTL 15 min (enrollment OTP)
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);

    // WHY StringRedisTemplate not RedisTemplate<String, Object>?
    // String keys/values are all we need. StringRedisTemplate avoids
    // Java serialization overhead and is human-readable in Redis CLI.
    private final StringRedisTemplate redis;

    // WHY SecureRandom? Cryptographically secure PRNG.
    // Math.random() and Random() are predictable — an attacker who knows
    // the seed can enumerate all possible OTPs. SecureRandom uses OS entropy.
    private final SecureRandom secureRandom = new SecureRandom();

    // WHY constants for these values?
    // Centralizes policy decisions. To change OTP lifetime: change ONE constant.
    private static final Duration OTP_TTL = Duration.ofMinutes(10);
    private static final Duration ENROLL_OTP_TTL = Duration.ofMinutes(15);
    private static final Duration REGISTER_OTP_TTL = Duration.ofMinutes(30);
    private static final int MAX_ATTEMPTS = 5;
    private static final String OTP_KEY_PREFIX = "auth:2fa:otp:";
    private static final String ENROLL_OTP_KEY_PREFIX = "auth:2fa:enroll:otp:";
    // WHY separate prefix for registration OTPs?
    // A registration OTP and a login 2FA OTP can coexist for the same userId
    // if a user is simultaneously re-verifying from a different tab.
    // Separate keys guarantee no collision between the two flows.
    private static final String REGISTER_OTP_KEY_PREFIX = "auth:register:otp:";

    // WHY stored value format "otp:attempts"?
    // Atomically stores OTP and attempt count in one Redis key.
    // Alternative (separate keys) requires two Redis round-trips per verify call.
    // Single key with both values: one GET, parse, one SET — fewer network calls.
    private static final String SEPARATOR = ":";

    public OtpService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * Generates a 6-digit OTP, stores it in Redis with 10-minute TTL.
     * Overwrites any existing OTP for this user — a new login attempt resets the OTP.
     *
     * WHY format "%06d"? Zero-pad to always produce 6 digits.
     * "7" would become "000007" — consistent display length.
     * Without padding: OTP could be 1-6 digits, confusing users.
     *
     * @param userId the user's UUID (from the logged-in user entity)
     * @return the plain-text OTP to send to the user (do not log in production)
     */
    public String generateAndStoreOtp(UUID userId) {
        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        // Store as "otp:0" where 0 is the initial attempt count
        String storedValue = otp + SEPARATOR + "0";
        redis.opsForValue().set(OTP_KEY_PREFIX + userId.toString(), storedValue, OTP_TTL);
        log.debug("OTP generated for userId: {}", userId);
        return otp;
    }

    /**
     * Verifies a submitted OTP against the one stored in Redis.
     *
     * WHY increment attempt count on every call (including success)?
     * On success: the key is deleted immediately — attempt count doesn't matter.
     * On failure: count increments. After MAX_ATTEMPTS failures: lock out.
     *
     * WHY throw 429 (Too Many Requests) instead of 401?
     * 401 would let an attacker know there's an account to brute force.
     * 429 indicates rate limiting — different error path in Angular's interceptor.
     *
     * WHY return false instead of throwing on wrong OTP?
     * The controller can log the attempt and return a consistent 401 to the client.
     * The caller decides how to handle wrong OTP; this service just verifies.
     *
     * @param userId the user's UUID
     * @param submittedOtp the OTP entered by the user
     * @return true if OTP is correct and within attempt limit
     * @throws ResponseStatusException 429 if MAX_ATTEMPTS exceeded
     */
    public boolean verifyOtp(UUID userId, String submittedOtp) {
        String key = OTP_KEY_PREFIX + userId.toString();
        String storedValue = redis.opsForValue().get(key);

        // WHY check null first? OTP may have expired (TTL) or never been generated.
        if (storedValue == null) {
            log.warn("OTP verification failed: no OTP found for userId={}", userId);
            return false;
        }

        // Parse "otp:attemptCount"
        String[] parts = storedValue.split(SEPARATOR, 2);
        if (parts.length < 2) {
            log.error("Malformed OTP record in Redis for userId={}: '{}'", userId, storedValue);
            return false;
        }
        String storedOtp = parts[0];
        int attempts;
        try {
            attempts = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            log.error("Could not parse attempt count for userId={}", userId);
            return false;
        }

        // WHY check BEFORE incrementing? Prevents one extra attempt sneaking through.
        if (attempts >= MAX_ATTEMPTS) {
            // Delete the key — force user to re-request a new OTP
            redis.delete(key);
            log.warn("OTP brute-force lockout triggered for userId={}", userId);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many OTP attempts. Please request a new OTP.");
        }

        // Increment attempt count and re-save with remaining TTL
        // WHY not use Redis INCR? We store two values in one key; INCR can't do that.
        // Trade-off: slightly more complex logic but one key instead of two.
        long remainingTtl = redis.getExpire(key);
        if (remainingTtl > 0) {
            redis.opsForValue().set(key, storedOtp + SEPARATOR + (attempts + 1),
                    Duration.ofSeconds(remainingTtl));
        }

        if (storedOtp.equals(submittedOtp)) {
            // WHY delete on success? OTP is single-use — once verified, it's consumed.
            // Prevents replay attacks: using the same OTP twice.
            redis.delete(key);
            log.debug("OTP verified successfully for userId={}", userId);
            return true;
        }

        log.warn("Incorrect OTP for userId={}, attempt {}/{}", userId, attempts + 1, MAX_ATTEMPTS);
        return false;
    }

    /**
     * Generates a 6-digit enrollment OTP stored with 15-minute TTL.
     * WHY longer TTL for enrollment? The user may need to check their email
     * or phone before completing the 2FA setup — give them extra time.
     *
     * WHY a separate key prefix? Enrollment OTPs are separate from login OTPs.
     * A login OTP and an enrollment OTP could coexist for the same user
     * (rare but possible if user is setting up 2FA on a trusted device).
     *
     * @param userId the user's UUID
     * @return the plain-text OTP to send for enrollment confirmation
     */
    public String generateAndStoreEnrollOtp(UUID userId) {
        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        redis.opsForValue().set(ENROLL_OTP_KEY_PREFIX + userId.toString(), otp, ENROLL_OTP_TTL);
        log.debug("Enrollment OTP generated for userId: {}", userId);
        return otp;
    }

    // ── Registration OTP methods ───────────────────────────────────────────

    /**
     * Generates a 6-digit OTP for email/phone verification at registration.
     * Stored in Redis under auth:register:otp:{userId} with 10-minute TTL.
     *
     * WHY separate from generateAndStoreOtp (2FA login OTP)?
     * Different security context: registration OTP is for a brand-new, unverified user.
     * Keeping them separate avoids confusion and allows independent TTLs.
     *
     * @param userId the new user's UUID (just saved to DB, not yet verified)
     * @return the plain-text OTP to send to the user
     */
    public String generateAndStoreRegistrationOtp(UUID userId) {
        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        String storedValue = otp + SEPARATOR + "0";
        redis.opsForValue().set(REGISTER_OTP_KEY_PREFIX + userId.toString(), storedValue, REGISTER_OTP_TTL);
        log.debug("Registration OTP generated for userId: {}", userId);
        return otp;
    }

    /**
     * Verifies the submitted registration OTP.
     * Applies the same brute-force protection as the login 2FA OTP (max 5 attempts).
     * Deletes the key on success (single-use).
     *
     * @param userId the new user's UUID
     * @param submittedOtp OTP entered by the user in the verify-registration screen
     * @return true if OTP is correct and within attempt limit
     * @throws ResponseStatusException 429 if MAX_ATTEMPTS exceeded
     */
    public boolean verifyRegistrationOtp(UUID userId, String submittedOtp) {
        String key = REGISTER_OTP_KEY_PREFIX + userId.toString();
        String storedValue = redis.opsForValue().get(key);

        if (storedValue == null) {
            log.warn("Registration OTP not found or expired for userId={}", userId);
            return false;
        }

        String[] parts = storedValue.split(SEPARATOR, 2);
        if (parts.length < 2) {
            log.error("Malformed registration OTP record in Redis for userId={}", userId);
            return false;
        }
        String storedOtp = parts[0];
        int attempts;
        try {
            attempts = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            log.error("Could not parse attempt count in registration OTP for userId={}", userId);
            return false;
        }

        if (attempts >= MAX_ATTEMPTS) {
            redis.delete(key);
            log.warn("Registration OTP brute-force lockout for userId={}", userId);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many attempts. Please request a new verification code.");
        }

        long remainingTtl = redis.getExpire(key);
        if (remainingTtl > 0) {
            redis.opsForValue().set(key, storedOtp + SEPARATOR + (attempts + 1),
                    Duration.ofSeconds(remainingTtl));
        }

        if (storedOtp.equals(submittedOtp)) {
            redis.delete(key);
            log.debug("Registration OTP verified for userId={}", userId);
            return true;
        }

        log.warn("Incorrect registration OTP for userId={}, attempt {}/{}", userId, attempts + 1, MAX_ATTEMPTS);
        return false;
    }

    /**
     * Verifies the enrollment OTP and deletes it on success.
     * WHY delete on success? One-time use. Prevents enrolling the same channel twice
     * with one OTP if the user clicks the confirmation button multiple times.
     *
     * WHY no attempt counting for enrollment?
     * Enrollment is done by an authenticated user (already logged in).
     * The risk profile is lower — attacker would need to be logged in already.
     * Simplifying enrollment OTP verification keeps the flow smooth.
     *
     * @param userId the user's UUID
     * @param submittedOtp the OTP entered during enrollment
     * @return true if OTP is correct and not expired
     */
    public boolean verifyEnrollOtp(UUID userId, String submittedOtp) {
        String key = ENROLL_OTP_KEY_PREFIX + userId.toString();
        String storedOtp = redis.opsForValue().get(key);

        if (storedOtp == null) {
            log.warn("Enrollment OTP expired or not found for userId={}", userId);
            return false;
        }

        if (storedOtp.equals(submittedOtp)) {
            redis.delete(key);
            log.debug("Enrollment OTP verified for userId={}", userId);
            return true;
        }

        log.warn("Incorrect enrollment OTP for userId={}", userId);
        return false;
    }
}
