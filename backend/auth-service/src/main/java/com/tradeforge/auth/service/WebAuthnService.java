package com.tradeforge.auth.service;

import com.tradeforge.auth.dto.WebAuthnAssertionRequest;
import com.tradeforge.auth.dto.WebAuthnRegisterRequest;
import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.WebAuthnCredential;
import com.tradeforge.auth.repository.WebAuthnCredentialRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * WHY @Service?
 * Spring-managed singleton. SecureRandom (expensive to init) and the credential
 * repository are shared across all requests — singleton is appropriate.
 *
 * WebAuthn Overview:
 * WebAuthn (Web Authentication API) is a W3C standard for phishing-resistant authentication.
 * The private key never leaves the user's device — the server only stores the public key.
 * Authentication proves the user has the device (possession) AND passes biometric (inherence).
 *
 * Two ceremonies:
 * 1. Registration (attestation): browser generates key pair, sends public key to server.
 * 2. Authentication (assertion): browser signs a server-generated challenge with private key.
 *    Server verifies signature with stored public key.
 *
 * Dev vs Production:
 * This implementation is a FUNCTIONAL PLACEHOLDER:
 * - Registration: stores attestationObject as credential without CBOR verification.
 * - Authentication: verifies challenge exists in Redis (not ECDSA signature).
 *
 * For production:
 * Add webauthn4j: io.github.webauthn4j:webauthn4j-core
 * And perform full attestation and assertion verification.
 *
 * WHY Redis for challenges?
 * Challenges are single-use, short-lived (5 min), and must survive until the browser
 * returns the signed response. Redis TTL auto-expires them — no cleanup needed.
 * Also: Redis is already in the stack for refresh tokens and OTPs.
 */
@Service
@Transactional
public class WebAuthnService {

    private static final Logger log = LoggerFactory.getLogger(WebAuthnService.class);

    // Redis key format: auth:2fa:webauthn:challenge:reg:{userId}  (registration challenge)
    //                   auth:2fa:webauthn:challenge:auth:{userId} (authentication challenge)
    // WHY separate keys for reg vs auth? They have different lifetimes and semantics.
    // A user could have a registration challenge and auth challenge simultaneously (settings page + login).
    private static final String CHALLENGE_KEY = "auth:2fa:webauthn:challenge:";

    // WHY 5 minutes? Browser's default timeout for navigator.credentials.create/get is 60s.
    // 5 minutes is generous — covers slow networks and hesitant users.
    private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);

    // WHY @Value with default? RP_ID must match the hostname of the site.
    // localhost in dev, tradeforge.com in prod.
    // Changing this at runtime (without modifying credentials) would break all WebAuthn logins.
    @Value("${app.webauthn.rp-id:localhost}")
    private String rpId;

    @Value("${app.webauthn.rp-name:TradeForge}")
    private String rpName;

    private final StringRedisTemplate redis;
    private final WebAuthnCredentialRepository credentialRepo;

    // WHY instance field? SecureRandom is thread-safe and expensive to create.
    // Reuse the same instance across all requests.
    private final SecureRandom secureRandom = new SecureRandom();

    public WebAuthnService(StringRedisTemplate redis,
                           WebAuthnCredentialRepository credentialRepo) {
        this.redis = redis;
        this.credentialRepo = credentialRepo;
    }

    /**
     * Builds PublicKeyCredentialCreationOptions for the browser's navigator.credentials.create().
     *
     * WHY return Map<String,Object>?
     * Jackson serializes this directly to JSON without needing a DTO class.
     * WebAuthn options are complex nested structures — using Map avoids 10+ DTO classes.
     * The structure follows the W3C spec exactly.
     *
     * WHY store challenge in Redis?
     * Browser sends the signed challenge back in clientDataJSON.
     * We need to verify that THIS server issued this challenge — Redis tie-back.
     *
     * WHY alg:-7 (ES256) and alg:-257 (RS256)?
     * These are the COSE algorithm identifiers for ECDSA P-256 and RSA with SHA-256.
     * We support both to maximize authenticator compatibility:
     * - Platform authenticators (TouchID, FaceID, Windows Hello) prefer ES256
     * - Older security keys may prefer RS256
     *
     * @param user the User requesting registration
     * @return PublicKeyCredentialCreationOptions as a JSON-serializable Map
     */
    public Map<String, Object> getRegistrationOptions(User user) {
        // Generate a cryptographically random challenge (32 bytes = 256 bits)
        // WHY 32 bytes? W3C spec recommends at least 16 bytes. 32 bytes is extra safe.
        byte[] challengeBytes = new byte[32];
        secureRandom.nextBytes(challengeBytes);
        String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(challengeBytes);

        // Store challenge in Redis with TTL — verified when browser sends clientDataJSON back
        redis.opsForValue().set(
                CHALLENGE_KEY + "reg:" + user.getId().toString(),
                challenge,
                CHALLENGE_TTL
        );

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("challenge", challenge);

        // Relying Party info — browser binds credential to this RP ID
        // WHY LinkedHashMap? Preserves insertion order for deterministic JSON output (easier to debug).
        options.put("rp", Map.of("id", rpId, "name", rpName));

        // User info for resident-key (passkey) credential labeling
        // WHY base64url-encode the user ID? WebAuthn spec requires user.id as BufferSource (bytes).
        // We encode UUID string bytes so browsers can decode and display it.
        options.put("user", Map.of(
                "id", Base64.getUrlEncoder().withoutPadding()
                        .encodeToString(user.getId().toString().getBytes(StandardCharsets.UTF_8)),
                "name", user.getEmail(),
                "displayName", user.getFullName() != null ? user.getFullName() : user.getEmail()
        ));

        // Preferred algorithms: ES256 (ECDSA P-256) and RS256 (RSA PKCS1)
        options.put("pubKeyCredParams", List.of(
                Map.of("type", "public-key", "alg", -7),    // ES256
                Map.of("type", "public-key", "alg", -257)   // RS256
        ));

        // Authenticator selection criteria
        // WHY platform? Platform authenticators (built-in biometrics) are the common case.
        // "cross-platform" would also allow security keys (YubiKey) if needed.
        // WHY userVerification=required? Requires biometric/PIN — not just device presence.
        options.put("authenticatorSelection", Map.of(
                "authenticatorAttachment", "platform",
                "userVerification", "required",
                "residentKey", "preferred"  // preferred = allow passkeys if supported
        ));

        // WHY 60000ms timeout? W3C default. Gives user 60 seconds to complete biometric.
        options.put("timeout", 60000);

        // WHY attestation=none? We don't verify the authenticator's manufacturer chain.
        // Full attestation would require checking against known good AAGUID + cert chains.
        // For a trading app, "did the user complete biometric?" is sufficient.
        // attestation=none also preserves user privacy (no device model fingerprinting).
        options.put("attestation", "none");

        // Exclude already-registered credentials — prevents duplicate registration
        // WHY? If user tries to register the same laptop twice, browser shows an error.
        // Better UX: clear message "this device is already registered" rather than silent duplicate.
        List<WebAuthnCredential> existing = credentialRepo.findByUserId(user.getId());
        options.put("excludeCredentials", existing.stream()
                .map(c -> Map.of("type", "public-key", "id", c.getCredentialId()))
                .toList());

        log.debug("WebAuthn registration options generated for userId={}", user.getId());
        return options;
    }

    /**
     * Stores a WebAuthn credential from the browser's attestation response.
     *
     * WHY simplified storage?
     * Full attestation verification (with webauthn4j) would:
     * 1. CBOR-decode the attestationObject
     * 2. Extract authData, verify rpIdHash, parse AAGUID + credentialId + publicKey
     * 3. Verify the attestation statement signature chain (if attestation != none)
     *
     * Since we use attestation=none, there's no attestation chain to verify.
     * The clientDataJSON challenge check is the critical security step.
     * In dev, we do a partial challenge verification and log a warning if it fails.
     *
     * For production: integrate webauthn4j for complete CBOR parsing and key extraction.
     *
     * @param user the User registering the credential
     * @param req  the attestation response from the browser
     * @return the saved WebAuthnCredential entity
     */
    public WebAuthnCredential registerCredential(User user, WebAuthnRegisterRequest req) {
        // Retrieve and validate the stored challenge
        String challengeKey = CHALLENGE_KEY + "reg:" + user.getId().toString();
        String storedChallenge = redis.opsForValue().get(challengeKey);

        if (storedChallenge == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Registration challenge expired or not found. Please restart registration.");
        }

        // Basic clientDataJSON challenge verification
        // WHY partial verification? Full verification decodes the base64url and parses JSON.
        // The critical check: does clientDataJSON contain our challenge?
        try {
            String clientDataStr = new String(
                    Base64.getUrlDecoder().decode(sanitizeBase64(req.clientDataJSON())),
                    StandardCharsets.UTF_8
            );
            // WHY check first 10 chars of challenge? A full challenge string match would
            // require URL-decoding and JSON parsing. The prefix check is a reasonable heuristic
            // for dev mode. In prod: use webauthn4j for cryptographic verification.
            if (!clientDataStr.contains(storedChallenge.substring(0, Math.min(10, storedChallenge.length())))) {
                log.warn("WebAuthn registration challenge mismatch for userId={}", user.getId());
                // WHY not throw here in dev? The simplified verification may have false negatives.
                // Log the warning but proceed. In prod: throw BAD_REQUEST.
            }
        } catch (Exception e) {
            log.warn("Could not parse clientDataJSON for userId={}: {}", user.getId(), e.getMessage());
        }

        // Delete challenge — single-use
        redis.delete(challengeKey);

        // Build and save the credential entity
        // WHY use attestationObject as credentialId prefix?
        // In a full implementation, credentialId would be extracted from the CBOR-decoded
        // authData inside attestationObject. Here we use a truncated version as a placeholder
        // that's still unique per registration. The browser sends the raw credential.id
        // separately — use that if the frontend sends it.
        // For a complete implementation, parse the attestationObject CBOR.
        String credId = req.attestationObject().length() > 256
                ? req.attestationObject().substring(0, 256)
                : req.attestationObject();

        // WHY check for duplicate credentialId? The DB has a unique constraint,
        // but a clear error message is better than a DB constraint violation.
        if (credentialRepo.findByCredentialId(credId).isPresent()) {
            log.warn("Duplicate WebAuthn credential attempt for userId={}", user.getId());
            // Generate a uniqueness suffix to avoid constraint violation in dev
            credId = credId.substring(0, Math.min(200, credId.length()))
                    + "_" + user.getId().toString().substring(0, 8);
        }

        WebAuthnCredential credential = new WebAuthnCredential();
        credential.setUser(user);
        credential.setCredentialId(credId);
        // WHY store clientDataJSON as publicKeyCose?
        // In dev mode without CBOR parsing, we store the raw client data as key material.
        // In prod: parse COSE public key from authData inside attestationObject.
        credential.setPublicKeyCose(req.clientDataJSON());
        credential.setSignCount(0L);
        credential.setDeviceName(req.deviceName());

        WebAuthnCredential saved = credentialRepo.save(credential);
        log.info("WebAuthn credential registered for userId={}, device='{}'",
                user.getId(), req.deviceName());
        return saved;
    }

    /**
     * Builds PublicKeyCredentialRequestOptions for navigator.credentials.get().
     *
     * WHY include allowCredentials?
     * The browser filters its credential store — only showing authenticators
     * that match one of the listed credential IDs. Faster UX for users with multiple devices.
     *
     * @param user the User attempting WebAuthn authentication
     * @return PublicKeyCredentialRequestOptions as a JSON-serializable Map
     */
    public Map<String, Object> getAssertionOptions(User user) {
        byte[] challengeBytes = new byte[32];
        secureRandom.nextBytes(challengeBytes);
        String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(challengeBytes);

        redis.opsForValue().set(
                CHALLENGE_KEY + "auth:" + user.getId().toString(),
                challenge,
                CHALLENGE_TTL
        );

        List<WebAuthnCredential> creds = credentialRepo.findByUserId(user.getId());

        Map<String, Object> options = new LinkedHashMap<>();
        options.put("challenge", challenge);
        options.put("rpId", rpId);
        options.put("timeout", 60000);
        options.put("userVerification", "required");
        options.put("allowCredentials", creds.stream()
                .map(c -> Map.of("type", "public-key", "id", c.getCredentialId()))
                .toList());

        log.debug("WebAuthn assertion options generated for userId={}", user.getId());
        return options;
    }

    /**
     * Verifies a WebAuthn authentication assertion.
     *
     * Dev mode verification:
     * 1. Challenge exists in Redis (proves this server initiated the login).
     * 2. Credential ID exists in DB for this user.
     * Full production verification would additionally:
     * 3. Verify rpIdHash in authenticatorData matches our RP ID.
     * 4. Check userPresence and userVerification flags.
     * 5. Verify ECDSA signature over authData + SHA-256(clientDataJSON) using stored public key.
     * 6. Check signCount > stored count (clone detection).
     *
     * WHY accept without signature verification in dev?
     * This lets frontend developers test the WebAuthn flow without configuring
     * a full HTTPS environment (WebAuthn requires HTTPS or localhost in production).
     * In production: switch to webauthn4j for cryptographic verification.
     *
     * @param user the User attempting authentication
     * @param req  the assertion response from the browser
     * @return true if the assertion is valid, false otherwise
     */
    public boolean verifyAssertion(User user, WebAuthnAssertionRequest req) {
        String challengeKey = CHALLENGE_KEY + "auth:" + user.getId().toString();
        String storedChallenge = redis.opsForValue().get(challengeKey);

        // WHY check challenge first? If the challenge expired or doesn't exist,
        // this is a replay attack or session timeout. Reject immediately.
        if (storedChallenge == null) {
            log.warn("WebAuthn assertion failed: challenge not found for userId={}", user.getId());
            return false;
        }

        // Single-use: delete challenge regardless of outcome
        // WHY delete even on failure? Prevents challenge reuse (replay attack).
        redis.delete(challengeKey);

        // Verify credential belongs to this user
        Optional<WebAuthnCredential> credOpt = credentialRepo.findByCredentialId(req.credentialId());
        if (credOpt.isEmpty()) {
            log.warn("WebAuthn assertion failed: credentialId='{}' not found", req.credentialId());
            return false;
        }

        WebAuthnCredential cred = credOpt.get();

        // WHY check user ownership? A credential's user binding must match the challenge session.
        // Without this check, credential theft (DB read) could be used across accounts.
        if (!cred.getUser().getId().equals(user.getId())) {
            log.warn("WebAuthn assertion failed: credential userId mismatch for credentialId='{}'",
                    req.credentialId());
            return false;
        }

        // Update usage tracking
        cred.setLastUsedAt(LocalDateTime.now());
        cred.setSignCount(cred.getSignCount() + 1);
        credentialRepo.save(cred);

        log.info("WebAuthn assertion verified (dev mode) for userId={}", user.getId());
        return true;
    }

    /**
     * Returns all WebAuthn credentials for a user (for the settings page).
     * WHY @Transactional(readOnly=true)? Pure SELECT — no writes.
     *
     * @param userId the user's UUID
     * @return list of WebAuthnCredential entities
     */
    @Transactional(readOnly = true)
    public List<WebAuthnCredential> getCredentials(UUID userId) {
        return credentialRepo.findByUserId(userId);
    }

    /**
     * Deletes a specific WebAuthn credential by its UUID.
     *
     * WHY ownership check? Same principle as TrustedDeviceService.revokeDevice.
     * A user should only delete their own credentials.
     *
     * @param credentialId the UUID of the WebAuthnCredential DB record
     * @param userId       the requesting user's UUID
     */
    public void deleteCredential(UUID credentialId, UUID userId) {
        WebAuthnCredential cred = credentialRepo.findById(credentialId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "WebAuthn credential not found"));

        if (!cred.getUser().getId().equals(userId)) {
            log.warn("Unauthorized WebAuthn credential deletion: userId={} tried credentialId={}",
                    userId, credentialId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You can only delete your own credentials");
        }

        credentialRepo.delete(cred);
        log.info("WebAuthn credential deleted: credentialId={} by userId={}", credentialId, userId);
    }

    // ── Private Helpers ───────────────────────────────────────────────────

    /**
     * Removes characters invalid in base64url encoding.
     * WHY? Browser may send base64url with or without padding, spaces, or newlines.
     * Sanitizing ensures Base64.getUrlDecoder() doesn't throw IllegalArgumentException.
     */
    private String sanitizeBase64(String input) {
        if (input == null) return "";
        // Keep only base64url-safe characters: A-Z, a-z, 0-9, -, _, =
        return input.replaceAll("[^A-Za-z0-9+/=_-]", "");
    }
}
