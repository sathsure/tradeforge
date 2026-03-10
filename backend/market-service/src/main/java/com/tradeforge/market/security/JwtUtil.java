package com.tradeforge.market.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.UUID;

/**
 * WHY JwtUtil in market-service?
 * PriceAlertController needs to identify WHICH user is creating or deleting alerts.
 * The userId is embedded in the JWT as a custom claim — we extract it here locally
 * without an HTTP call to auth-service (stateless, fast, zero coupling).
 *
 * WHY the same secret as auth-service?
 * All services that validate JWTs share the same HMAC-SHA256 signing key.
 * If secrets differ, token verification fails with SignatureException.
 * In production: use Vault or Kubernetes Secrets to distribute the key.
 */
@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    /**
     * Extracts the userId UUID from a JWT Bearer token.
     *
     * WHY get("userId") instead of getSubject()?
     * auth-service stores the user's email as the JWT "sub" (subject) claim.
     * The user's UUID primary key is stored separately as a custom "userId" claim.
     * UUID.fromString(email) would throw IllegalArgumentException.
     *
     * @param token raw JWT string (without "Bearer " prefix)
     * @return user UUID
     */
    public UUID extractUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.get("userId", String.class));
    }

    /**
     * WHY Keys.hmacShaKeyFor?
     * JJWT requires a typed SecretKey, not a raw string.
     * We base64-decode the configured secret string to recover the original key bytes,
     * then wrap in an HMAC key. Must match auth-service's signing approach exactly.
     */
    private SecretKey getSigningKey() {
        byte[] keyBytes = java.util.Base64.getDecoder().decode(secret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
