package com.tradeforge.order.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.UUID;

/**
 * WHY a JwtUtil in order-service?
 * Order-service needs to know WHICH user is placing an order.
 * The userId is embedded in the JWT access token as a claim.
 * We extract it here without making an HTTP call to auth-service.
 *
 * WHY not call auth-service's /validate endpoint?
 * HTTP calls add latency and coupling. If auth-service is down, orders fail too.
 * JWT verification is stateless — just needs the secret key.
 * All services that validate JWTs share the same secret (via config or Vault).
 *
 * WHY @Component?
 * Makes it a Spring bean — injectable via constructor injection.
 * @Component is for utility classes; @Service is for business logic.
 * The distinction is semantic but follows Spring convention.
 */
@Component
public class JwtUtil {

    /**
     * WHY @Value("${jwt.secret}")?
     * The JWT secret MUST match the one used in auth-service.
     * Configuring it via application.yml means we can change it
     * without recompiling. In production, use Vault or K8s Secrets.
     */
    @Value("${jwt.secret}")
    private String secret;

    /**
     * Extracts the userId (subject) from a JWT access token.
     * Called by the controller after extracting the Bearer token from the request.
     *
     * WHY return UUID?
     * The JWT subject is stored as a UUID string (the user's primary key).
     * Returning UUID (not String) prevents callers from accidentally passing
     * the raw string to UUID-typed DB queries.
     *
     * @param token The raw JWT string (without "Bearer " prefix)
     * @return userId as UUID
     * @throws io.jsonwebtoken.JwtException if token is invalid or expired
     */
    public UUID extractUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

        // WHY get("userId")?
        // auth-service stores the email as the JWT subject ("sub") but embeds the
        // user's UUID primary key in a custom "userId" claim.
        // UUID.fromString would throw if we used getSubject() (which returns the email).
        return UUID.fromString(claims.get("userId", String.class));
    }

    /**
     * WHY Keys.hmacShaKeyFor()?
     * JJWT requires the signing key to be a SecretKey object, not a raw string.
     * Keys.hmacShaKeyFor() converts our Base64-encoded secret string to a SecretKey.
     * HMAC-SHA256 is used for signing — same algorithm as in auth-service's JwtService.
     */
    private SecretKey getSigningKey() {
        byte[] keyBytes = java.util.Base64.getDecoder().decode(secret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
