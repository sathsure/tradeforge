package com.tradeforge.auth.service;

import com.tradeforge.auth.dto.AuthResponse;
import com.tradeforge.auth.dto.OtpVerifyRequest;
import com.tradeforge.auth.dto.WebAuthnAssertionRequest;
import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.UserTwoFactorConfig;
import com.tradeforge.auth.repository.TwoFactorConfigRepository;
import com.tradeforge.auth.repository.UserRepository;
import com.tradeforge.auth.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;

/**
 * WHY @Service?
 * Spring singleton bean. Orchestrates the two-step 2FA login flow.
 *
 * WHY a separate TwoFactorService instead of putting this logic in AuthService?
 * Single Responsibility Principle:
 * - AuthService: credential validation + token generation.
 * - TwoFactorService: 2FA challenge initiation + OTP/WebAuthn verification.
 * Also: AuthService has a circular dependency with AuthenticationManager.
 * Adding more dependencies there increases the risk of circular wiring.
 *
 * CIRCULAR DEPENDENCY NOTE:
 * TwoFactorService → AuthService (for buildTokenResponse).
 * AuthService → TwoFactorService (to call initiateTwoFactor during login).
 * This is a mutual dependency. We break it by using @Lazy on TwoFactorService
 * in AuthService's constructor (see AuthService).
 *
 * The 2FA login flow:
 * Step 1 (AuthService.login):
 *   - User submits email + password → credentials verified.
 *   - 2FA is enabled → generate tempToken, call twoFactorService.initiateTwoFactor().
 *   - Return 202 TwoFactorChallengeResponse to Angular.
 *
 * Step 2 (TwoFactorService.verifyOtp or verifyWebAuthn):
 *   - Angular submits tempToken + OTP (or WebAuthn assertion).
 *   - Look up pending session in Redis by JWT ID (jti).
 *   - Verify OTP or WebAuthn signature.
 *   - Return 200 AuthResponse with real access + refresh tokens.
 *
 * Redis key: auth:2fa:pending:{jti} = userId  (TTL 10 min)
 * WHY store by jti? The jti (JWT ID) is unique per token. Using it as the Redis key
 * ties the pending session to this specific temp token. If the token expires,
 * Redis TTL also cleans up the pending session — self-consistent.
 *
 * WHY @Transactional?
 * verifyOtp and verifyWebAuthn both call userRepo.findById (DB read) and
 * may call trustedDeviceService.trustDevice (DB write). A transaction ensures
 * consistency across both operations.
 */
@Service
@Transactional
public class TwoFactorService {

    private static final Logger log = LoggerFactory.getLogger(TwoFactorService.class);

    // Redis key for pending 2FA sessions
    // Format: auth:2fa:pending:{jti}  →  userId as String
    private static final String PENDING_KEY = "auth:2fa:pending:";

    // WHY same TTL as OTP? Both the pending session and the OTP must be alive simultaneously.
    private static final Duration PENDING_TTL = Duration.ofMinutes(10);

    private static final String DEVICE_SALT = "tradeforge-device-salt-2024";

    private final StringRedisTemplate redis;
    private final JwtService jwtService;
    private final UserRepository userRepo;
    private final OtpService otpService;
    private final WebAuthnService webAuthnService;
    private final TwoFactorConfigRepository configRepo;
    private final TrustedDeviceService trustedDeviceService;

    // WHY @Lazy on AuthService? TwoFactorService → AuthService → TwoFactorService (circular).
    // @Lazy breaks the cycle by deferring AuthService proxy creation until first use.
    private final AuthService authService;

    public TwoFactorService(StringRedisTemplate redis,
                             JwtService jwtService,
                             UserRepository userRepo,
                             OtpService otpService,
                             WebAuthnService webAuthnService,
                             TwoFactorConfigRepository configRepo,
                             TrustedDeviceService trustedDeviceService,
                             @Lazy AuthService authService) {
        this.redis = redis;
        this.jwtService = jwtService;
        this.userRepo = userRepo;
        this.otpService = otpService;
        this.webAuthnService = webAuthnService;
        this.configRepo = configRepo;
        this.trustedDeviceService = trustedDeviceService;
        this.authService = authService;
    }

    /**
     * Called by AuthService after credential verification when 2FA is enabled.
     *
     * WHY store in Redis by jti?
     * The tempToken's jti is the Redis key. This binds the pending session to
     * exactly one tempToken. If an attacker somehow generates a valid JWT with the
     * same sub (email) but different jti, it will NOT have a Redis entry — rejected.
     *
     * WHY accept EmailService / SmsService as params (not inject them)?
     * These are already injected in AuthService. Passing them avoids adding more
     * dependencies to TwoFactorService's constructor, keeping the dependency graph simpler.
     *
     * @param user         the authenticated User entity
     * @param tempToken    the short-lived JWT with twoFactorPending:true
     * @param config       the user's 2FA configuration (method, enabled flag)
     * @param emailService injected by AuthService
     * @param smsService   injected by AuthService
     */
    public void initiateTwoFactor(User user, String tempToken,
                                   UserTwoFactorConfig config,
                                   EmailService emailService,
                                   SmsService smsService) {
        // Extract the JWT ID (jti) from the tempToken — use as Redis key
        String jti = jwtService.extractAllClaims(tempToken).getId();
        if (jti == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Temp token missing jti claim");
        }

        // Store pending session: jti → userId
        redis.opsForValue().set(PENDING_KEY + jti, user.getId().toString(), PENDING_TTL);
        log.debug("2FA pending session created for userId={}, method={}", user.getId(), config.getMethod());

        // Send OTP based on configured method
        switch (config.getMethod()) {
            case EMAIL -> {
                String otp = otpService.generateAndStoreOtp(user.getId());
                try {
                    emailService.sendOtp(user.getEmail(), user.getFullName(), otp);
                    log.debug("Email OTP sent to userId={}", user.getId());
                } catch (Exception e) {
                    log.warn("2FA email delivery failed for userId={} — OTP logged: {}", user.getId(), otp);
                }
            }
            case SMS -> {
                String phone = user.getPhone();
                if (phone == null || phone.isBlank()) {
                    log.error("SMS 2FA enabled but no phone number for userId={}", user.getId());
                    throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                            "No phone number configured for SMS 2FA");
                }
                String otp = otpService.generateAndStoreOtp(user.getId());
                smsService.sendOtp(phone, otp);
                log.debug("SMS OTP sent to userId={}", user.getId());
            }
            case WEBAUTHN -> {
                // WHY no OTP for WEBAUTHN? Challenge already generated and stored in Redis
                // by WebAuthnService.getAssertionOptions() in AuthService.login().
                log.debug("WebAuthn 2FA initiated for userId={}", user.getId());
            }
            default -> log.warn("Unknown 2FA method '{}' for userId={}", config.getMethod(), user.getId());
        }
    }

    /**
     * Verifies the submitted OTP against the stored Redis value.
     * Returns a complete AuthResponse (access token + refresh token) on success.
     *
     * Step-by-step:
     * 1. Validate tempToken signature and expiry.
     * 2. Confirm it has twoFactorPending:true (not a real access token being replayed).
     * 3. Extract jti → look up pending session in Redis.
     * 4. Verify OTP with OtpService (increments attempt counter, throws 429 on lockout).
     * 5. Delete pending session (one-time use).
     * 6. Load user from DB.
     * 7. Optionally trust this device (set cookie).
     * 8. Build and return full token response.
     *
     * @param req      the OtpVerifyRequest with tempToken, otp, trustDevice flag
     * @param httpReq  the HTTP request (for device fingerprinting)
     * @param httpResp the HTTP response (for setting trust cookie)
     * @return AuthResponse with access token, refresh token, user info
     */
    public AuthResponse verifyOtp(OtpVerifyRequest req,
                                   HttpServletRequest httpReq,
                                   HttpServletResponse httpResp) {
        // Step 1: Validate tempToken
        String email = jwtService.extractUsername(req.tempToken());
        if (email == null || !jwtService.isTokenValid(req.tempToken(), email)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid or expired 2FA session. Please log in again.");
        }

        // Step 2: Confirm it's a temp token (not a real access token replayed)
        if (!jwtService.isTwoFactorPendingToken(req.tempToken())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Not a valid 2FA challenge token.");
        }

        // Step 3: Look up pending session by jti
        String jti = jwtService.extractAllClaims(req.tempToken()).getId();
        String userIdStr = redis.opsForValue().get(PENDING_KEY + jti);
        if (userIdStr == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "2FA session expired or already used. Please log in again.");
        }

        UUID userId = UUID.fromString(userIdStr);

        // Step 4: Verify OTP — OtpService handles attempt counting and 429 lockout
        boolean valid = otpService.verifyOtp(userId, req.otp());
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Incorrect OTP. Please check and try again.");
        }

        // Step 5: Delete pending session — one-time use
        redis.delete(PENDING_KEY + jti);

        // Step 6: Load user from DB
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "User account not found."));

        // Step 7: Trust device if requested
        if (req.trustDevice()) {
            String fingerprint = trustedDeviceService.computeFingerprint(userId, httpReq);
            trustedDeviceService.trustDevice(user, fingerprint, httpReq, httpResp);
            log.info("Device trusted after 2FA OTP verification for userId={}", userId);
        }

        // Step 8: Build full token response — 2FA complete
        log.info("2FA OTP verification successful for userId={}", userId);
        return authService.buildTokenResponse(user);
    }

    /**
     * Verifies a WebAuthn authentication assertion.
     * Same flow as verifyOtp but delegates signature check to WebAuthnService.
     *
     * WHY a separate method for WebAuthn?
     * The verification logic is completely different (no OTP, ECDSA assertion).
     * Keeping it separate avoids a confusing conditional in one verifyTwoFactor method.
     *
     * @param req      the WebAuthn assertion response from the browser
     * @param httpReq  for device fingerprinting
     * @param httpResp for setting trust cookie
     * @return AuthResponse with access token, refresh token, user info
     */
    public AuthResponse verifyWebAuthn(WebAuthnAssertionRequest req,
                                        HttpServletRequest httpReq,
                                        HttpServletResponse httpResp) {
        // Validate tempToken is a legitimate 2FA pending token
        if (!jwtService.isTwoFactorPendingToken(req.tempToken())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Not a valid 2FA challenge token.");
        }

        String email = jwtService.extractUsername(req.tempToken());
        if (email == null || !jwtService.isTokenValid(req.tempToken(), email)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid or expired 2FA session.");
        }

        // Look up pending session
        String jti = jwtService.extractAllClaims(req.tempToken()).getId();
        String userIdStr = redis.opsForValue().get(PENDING_KEY + jti);
        if (userIdStr == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "2FA session expired or already used.");
        }

        UUID userId = UUID.fromString(userIdStr);
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "User account not found."));

        // Verify WebAuthn assertion
        boolean valid = webAuthnService.verifyAssertion(user, req);
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "WebAuthn verification failed. Please try again.");
        }

        // Single-use: delete pending session
        redis.delete(PENDING_KEY + jti);

        // Trust device if requested
        if (req.trustDevice()) {
            String fingerprint = trustedDeviceService.computeFingerprint(userId, httpReq);
            trustedDeviceService.trustDevice(user, fingerprint, httpReq, httpResp);
            log.info("Device trusted after WebAuthn verification for userId={}", userId);
        }

        log.info("2FA WebAuthn verification successful for userId={}", userId);
        return authService.buildTokenResponse(user);
    }
}
