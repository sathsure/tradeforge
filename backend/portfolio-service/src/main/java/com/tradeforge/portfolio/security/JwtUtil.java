package com.tradeforge.portfolio.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.UUID;

/**
 * WHY duplicate JwtUtil in portfolio-service?
 * Same reasoning as order-service — each service independently verifies JWTs.
 * No cross-service dependency for authentication.
 * The secret is shared via configuration (same JWT_SECRET env var).
 *
 * Sprint 3: Extract to a shared 'tradeforge-common' library if duplication
 * becomes a maintenance burden (changes to JWT logic need updating in 2+ places).
 */
@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    public UUID extractUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        // WHY get("userId")? auth-service stores email in "sub", UUID in custom "userId" claim.
        return UUID.fromString(claims.get("userId", String.class));
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = java.util.Base64.getDecoder().decode(secret);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
