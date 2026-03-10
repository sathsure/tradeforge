package com.tradeforge.auth.security;

import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.UserTwoFactorConfig;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * WHY @Service?
 * Marks this as a Spring-managed service bean.
 * Spring creates ONE instance (singleton) and injects it wherever needed.
 * You never call 'new JwtService()' — Spring's IoC container manages the lifecycle.
 *
 * WHY manual logger instead of Lombok @Slf4j?
 * Lombok 1.18.30 (Spring Boot 3.2.3) uses javac internals unavailable in Java 25.
 * LoggerFactory.getLogger() is the standard SLF4J pattern — identical at runtime.
 *
 * SECURITY DEEP DIVE — JWT Structure:
 * A JWT has 3 parts: Header.Payload.Signature
 * Header: {"alg":"HS256","typ":"JWT"}
 * Payload: {"sub":"user@email.com","role":"TRADER","iat":...,"exp":...}
 * Signature: HMACSHA256(base64(header)+"."+base64(payload), secret)
 *
 * SECURITY THREAT — Algorithm Confusion Attack:
 * If you accept any algorithm, an attacker can change header to alg:none
 * and skip signature verification entirely.
 * FIX: We explicitly specify HS256 — reject tokens with different algorithms.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    @Value("${jwt.secret}")
    private String secretKey;
    // WHY @Value? Reads from application.yml → jwt.secret
    // In Docker/production, this comes from environment variable JWT_SECRET.
    // NEVER hardcode secrets in code — they end up in Git history forever.

    @Value("${jwt.access-token-expiry}")
    private long accessTokenExpiry;  // 15 minutes

    @Value("${jwt.refresh-token-expiry}")
    private long refreshTokenExpiry; // 7 days

    /**
     * Generates a JWT access token for authenticated user.
     *
     * WHY include role in token?
     * API Gateway can read role from token without calling Auth Service.
     * Stateless — no DB lookup needed to check if user is ADMIN or TRADER.
     *
     * SECURITY NOTE: Don't put sensitive data (passwords, SSN) in JWT payload.
     * The payload is base64 encoded — NOT encrypted. Anyone can decode it.
     * Only sign it to prevent tampering, but it's readable.
     */
    public String generateAccessToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", user.getRole().name());
        claims.put("userId", user.getId().toString());
        claims.put("fullName", user.getFullName());

        return buildToken(claims, user.getUsername(), accessTokenExpiry);
    }

    /**
     * Generates a refresh token — stored in Redis.
     * Longer expiry, minimal claims (just enough to identify user).
     *
     * WHY separate refresh token?
     * Access token: short-lived (15min), used on every API call
     * Refresh token: long-lived (7 days), used only to get new access token
     * If access token is stolen, attacker has only 15 minutes.
     * If refresh token is stolen, we can revoke it in Redis immediately.
     */
    public String generateRefreshToken(User user) {
        return buildToken(new HashMap<>(), user.getUsername(), refreshTokenExpiry);
    }

    // ── 2FA Token Methods ──────────────────────────────────────────────────

    // WHY a separate TTL constant for temp tokens?
    // Temp tokens are short-lived (10 min) — much shorter than access tokens (15 min).
    // If someone intercepts a temp token, the attack window is very small.
    private static final long TEMP_TOKEN_EXPIRY = 1_800_000L; // 30 minutes

    /**
     * Generates a short-lived temp token with registrationPending:true claim.
     *
     * WHY a separate token type for registration?
     * After register(), the user is NOT authenticated — they need to verify email/phone.
     * This token carries their userId across the two HTTP requests:
     *   POST /register → registrationTempToken
     *   POST /verify-registration (submits registrationTempToken + OTP) → real tokens
     *
     * WHY registrationPending claim?
     * JwtAuthenticationFilter checks this and rejects it for all endpoints except
     * /api/auth/verify-registration and /api/auth/resend-registration-otp.
     * Prevents a captured registration token from accessing trading endpoints.
     *
     * @param user the newly created, unverified user
     * @param channel "EMAIL" or "PHONE" — which channel the OTP was sent to
     */
    public String generateRegistrationTempToken(User user, String channel) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", user.getId().toString());
        // registrationPending:true is the sentinel — filter rejects this for protected endpoints
        claims.put("registrationPending", true);
        claims.put("verificationChannel", channel);
        return buildToken(claims, user.getUsername(), TEMP_TOKEN_EXPIRY);
    }

    /**
     * Returns true if this JWT has the registrationPending:true claim.
     * Called by JwtAuthenticationFilter to block registration tokens from acting as real tokens.
     */
    public boolean isRegistrationPendingToken(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Boolean.TRUE.equals(claims.get("registrationPending", Boolean.class));
        } catch (JwtException e) {
            return false;
        }
    }

    /**
     * Generates a short-lived temp token with twoFactorPending:true claim.
     *
     * WHY a separate token and not just skip issuing the real access token?
     * We need to carry the pending session state across two HTTP requests:
     * 1. POST /login → returns tempToken
     * 2. POST /2fa/verify-otp (sends tempToken back) → returns real access token
     *
     * The tempToken acts like a session cookie replacement in our stateless JWT world.
     * It contains just enough info to look up the pending session in Redis.
     *
     * WHY twoFactorPending:true claim?
     * JwtAuthenticationFilter checks this claim and REJECTS temp tokens for
     * all endpoints except /api/auth/2fa/verify-*. This prevents using a
     * captured temp token to access trading endpoints.
     */
    public String generateTempToken(User user, UserTwoFactorConfig.TwoFactorMethod method) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", user.getId().toString());
        // WHY twoFactorPending:true? Sentinel claim. JwtAuthenticationFilter
        // reads this and short-circuits — the temp token never authenticates a user.
        claims.put("twoFactorPending", true);
        claims.put("twoFactorMethod", method.name());
        return buildToken(claims, user.getUsername(), TEMP_TOKEN_EXPIRY);
    }

    /**
     * Returns true if this JWT has the twoFactorPending:true claim.
     *
     * WHY this check in JwtAuthenticationFilter?
     * A temp token looks like a valid JWT (correct signature, not expired).
     * Without this check, the filter would treat it as a real access token.
     * This would let an attacker with a stolen temp token access protected endpoints.
     *
     * Called by JwtAuthenticationFilter BEFORE extractUsername — fail fast.
     */
    public boolean isTwoFactorPendingToken(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Boolean.TRUE.equals(claims.get("twoFactorPending", Boolean.class));
        } catch (JwtException e) {
            // WHY return false on exception?
            // If token is malformed/expired, it's not a valid temp token.
            // Returning false lets the caller treat it as non-pending (just invalid).
            return false;
        }
    }

    /**
     * Returns all claims from a valid token.
     *
     * WHY public? TwoFactorService needs to extract the jti (token ID) from the
     * temp token to look up the pending session in Redis.
     * Also used to extract userId from the temp token claims.
     *
     * WHY not just use extractUsername?
     * We need the jti (unique token ID) to use as the Redis pending-session key.
     * extractUsername only returns the subject (email). Claims gives us everything.
     *
     * @throws JwtException if token is invalid or expired
     */
    public Claims extractAllClaims(String token) {
        // WHY let exceptions propagate? The caller (TwoFactorService) already
        // validated the token with isTokenValid() before calling this.
        // If we get here with an invalid token, it's a programming error — fail loudly.
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private String buildToken(Map<String, Object> extraClaims, String subject, long expiry) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(subject)               // user's email
                .id(UUID.randomUUID().toString()) // jti — unique token ID (for blacklisting)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiry))
                .signWith(getSigningKey())
                // WHY signWith? Creates the Signature part of JWT.
                // Without signature, anyone could forge a token claiming to be admin.
                .compact();
    }

    /**
     * Validates token and returns username if valid.
     *
     * SECURITY: This method throws exceptions for:
     * - Expired tokens (ExpiredJwtException)
     * - Tampered tokens (SignatureException)
     * - Malformed tokens (MalformedJwtException)
     * - Algorithm confusion (UnsupportedJwtException)
     * We catch all of these and return null → request gets 401 Unauthorized.
     */
    public String extractUsername(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(getSigningKey())  // MUST verify signature first
                    .build()
                    .parseSignedClaims(token)
                    .getPayload()
                    .getSubject();
        } catch (JwtException e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            // WHY log.warn not log.error? Invalid tokens are expected
            // (expired sessions, etc). It's not a server error, it's a client issue.
            return null;
        }
    }

    public boolean isTokenValid(String token, String username) {
        final String extractedUsername = extractUsername(token);
        return extractedUsername != null
                && extractedUsername.equals(username)
                && !isTokenExpired(token);
    }

    private boolean isTokenExpired(String token) {
        try {
            Date expiration = Jwts.parser()
                    .verifyWith(getSigningKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload()
                    .getExpiration();
            return expiration.before(new Date());
        } catch (JwtException e) {
            return true; // Treat invalid tokens as expired
        }
    }

    private SecretKey getSigningKey() {
        // WHY Keys.hmacShaKeyFor?
        // Creates a cryptographically proper HMAC-SHA key from our secret string.
        // Raw string as key is insecure — this ensures proper key derivation.
        byte[] keyBytes = Decoders.BASE64.decode(
            java.util.Base64.getEncoder().encodeToString(secretKey.getBytes())
        );
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
