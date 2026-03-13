package com.tradeforge.auth.service;

import com.tradeforge.auth.dto.AuthRequest;
import com.tradeforge.auth.dto.AuthResponse;
import com.tradeforge.auth.dto.RegisterRequest;
import com.tradeforge.auth.dto.RegistrationChallengeResponse;
import com.tradeforge.auth.dto.RegistrationVerifyRequest;
import com.tradeforge.auth.dto.TwoFactorChallengeResponse;
import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.UserTwoFactorConfig;
import com.tradeforge.auth.repository.TwoFactorConfigRepository;
import com.tradeforge.auth.repository.UserRepository;
import com.tradeforge.auth.security.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * WHY @Service?
 * Marks this as a Spring-managed service bean (singleton by default).
 * Spring creates ONE instance and injects it wherever AuthService is declared as a dependency.
 * The @Service annotation is also a @Component — Spring's component scan picks it up.
 *
 * WHY @Transactional?
 * Wraps every public method in a database transaction automatically.
 * If register() throws after saving the user but before saving to Redis,
 * the transaction ROLLS BACK — no orphaned user without a refresh token.
 * Ensures atomicity: all-or-nothing operations.
 *
 * WHY @Slf4j?
 * Generates: private static final Logger log = LoggerFactory.getLogger(AuthService.class);
 * Use log.info(), log.warn(), log.error(). Never System.out.println() in production.
 * In production, logs go to CloudWatch/Elasticsearch. System.out is lost.
 *
 * CIRCULAR DEPENDENCY NOTE:
 * SecurityConfig → AuthenticationProvider → UserDetailsService (this class)
 * This class → AuthenticationManager (defined in SecurityConfig)
 *
 * This creates a circular bean dependency. Spring detects this and throws
 * BeanCurrentlyInCreationException — UNLESS we break the cycle.
 *
 * FIX: @Lazy on AuthenticationManager injection.
 * @Lazy defers creation of AuthenticationManager until it's first USED (not when SecurityConfig starts).
 * By the time AuthService.login() calls authenticationManager.authenticate(),
 * SecurityConfig is fully initialized. Cycle broken.
 *
 * SECOND CIRCULAR DEPENDENCY (2FA):
 * AuthService → TwoFactorService (initiateTwoFactor)
 * TwoFactorService → AuthService (buildTokenResponse)
 * FIX: @Lazy on TwoFactorService in this constructor.
 *
 * WHY NOT use @Lazy on the whole AuthService?
 * AuthService implements UserDetailsService — Spring Security needs it early.
 * We need to be lazy ONLY on the circular dependencies.
 */
@Service
@Transactional
public class AuthService implements UserDetailsService {

    // WHY manual logger? Lombok @Slf4j uses javac internals unavailable in Java 25.
    // LoggerFactory.getLogger() is standard SLF4J — identical result, no magic.
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    // ── Dependencies ──────────────────────────────────────────────────────────
    // WHY final fields? Immutable after construction. Cannot be accidentally changed.
    // Also: final + constructor injection = compile-time guarantee they're not null.

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final TwoFactorConfigRepository twoFactorConfigRepo;
    private final TrustedDeviceService trustedDeviceService;
    private final EmailService emailService;
    private final SmsService smsService;
    private final WebAuthnService webAuthnService;
    private final OtpService otpService;

    // WHY @Lazy specifically on AuthenticationManager?
    // This is the dependency that creates the circular chain.
    // @Lazy wraps it in a proxy — the real AuthenticationManager is only created
    // when authenticationManager.authenticate() is first called.
    private final AuthenticationManager authenticationManager;

    // WHY @Lazy on TwoFactorService?
    // TwoFactorService → AuthService → TwoFactorService = circular.
    // @Lazy breaks the chain: TwoFactorService proxy is created lazily on first use.
    private final TwoFactorService twoFactorService;

    // WHY explicit constructor instead of @RequiredArgsConstructor?
    // Lombok's @RequiredArgsConstructor generates: constructor with all final fields.
    // But we can't add @Lazy to a parameter in a Lombok-generated constructor.
    // Explicit constructor gives us full control over each parameter's annotations.
    @Autowired
    public AuthService(
            UserRepository userRepository,
            JwtService jwtService,
            PasswordEncoder passwordEncoder,
            StringRedisTemplate redisTemplate,
            TwoFactorConfigRepository twoFactorConfigRepo,
            TrustedDeviceService trustedDeviceService,
            EmailService emailService,
            SmsService smsService,
            WebAuthnService webAuthnService,
            OtpService otpService,
            @Lazy AuthenticationManager authenticationManager,
            @Lazy TwoFactorService twoFactorService
    ) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.redisTemplate = redisTemplate;
        this.twoFactorConfigRepo = twoFactorConfigRepo;
        this.trustedDeviceService = trustedDeviceService;
        this.emailService = emailService;
        this.smsService = smsService;
        this.webAuthnService = webAuthnService;
        this.otpService = otpService;
        this.authenticationManager = authenticationManager;
        this.twoFactorService = twoFactorService;
    }

    // Redis key prefix — namespaces refresh tokens from other Redis keys
    // WHY prefix? Redis is a shared store. Different microservices use the same Redis.
    // Without prefix, "admin@x.com" might conflict with another service's key.
    private static final String REFRESH_TOKEN_KEY = "auth:refresh_token:";

    // Refresh token TTL — must match jwt.refresh-token-expiry in application.yml
    private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(7);

    // ── UserDetailsService Implementation ──────────────────────────────────────
    /**
     * Called by Spring Security's DaoAuthenticationProvider during login.
     * Spring calls this with the submitted email → we load the User from DB.
     * Spring then compares the submitted password with user.getPassword() (BCrypt hash).
     *
     * WHY @Transactional(readOnly = true) on this method?
     * readOnly = true: tells the DB to optimize for read-only queries.
     * No need to track entity changes for rollback — saves overhead.
     * Override the class-level @Transactional for this read-only operation.
     */
    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> {
                    log.warn("User not found with email: {}", email);
                    // WHY log.warn? Not an error (user might just mistype email).
                    // But worth noting — repeated failures = brute force attempt.
                    return new UsernameNotFoundException("User not found: " + email);
                });
    }

    // ── Register ──────────────────────────────────────────────────────────────
    /**
     * Creates a new trader account and returns JWT tokens.
     * On success, user is immediately logged in (no separate login step).
     *
     * WHY hash the password with BCrypt?
     * BCrypt is a deliberately SLOW hash function (adaptive work factor).
     * Takes ~100ms to hash. This is a feature, not a bug:
     * - User only logs in once → 100ms is imperceptible
     * - Attacker brute-forcing with GPU → 100ms per attempt is crippling
     * NEVER store plain text passwords. NEVER use MD5/SHA.
     */
    /**
     * Creates a new trader account, sends a verification OTP, and returns a challenge.
     *
     * WHY return Object instead of AuthResponse?
     * Account creation now has two outcomes:
     *   - RegistrationChallengeResponse (HTTP 202): email/phone OTP sent, verification pending
     *   - (Future) AuthResponse (HTTP 201): if verification is somehow bypassed (admin flows)
     * Returning Object lets the controller decide the HTTP status from the actual type.
     *
     * WHY not issue tokens immediately?
     * Issuing tokens to an unverified account allows a bot to register thousands of fake
     * accounts and use the platform without owning any real email address.
     * Verification proves the user owns the email they registered with.
     */
    public Object register(RegisterRequest request) {
        // WHY check duplicate before creating? DB has a UNIQUE constraint on email,
        // so it would fail anyway. But the constraint throws an exception with a generic message.
        // Checking first lets us return a clear "Email already registered" message.
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email already registered: " + request.email());
        }

        User user = User.builder()
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                // WHY encode here and not in the entity?
                // The entity should store ONLY the hashed password.
                // Encoding in the service keeps the entity clean — no encoding logic in entity layer.
                .fullName(request.fullName())
                .phone(request.phone())
                .role(User.Role.TRADER)
                .emailVerified(false)  // Must verify email before account is usable
                .phoneVerified(false)
                .build();

        user = userRepository.save(user);
        log.info("New user registered (unverified): {} (id={})", user.getEmail(), user.getId());

        // WHY send to email first, phone second?
        // Email is always present (required in RegisterRequest).
        // Phone is optional — if not provided, we fall back to email anyway.
        // If phone is provided, we still verify email (more reliable delivery than SMS).
        return sendRegistrationChallenge(user, "EMAIL");
    }

    /**
     * Sends a registration verification OTP to the user's email (or phone if email unavailable).
     * Returns the RegistrationChallengeResponse the controller will return as HTTP 202.
     *
     * WHY extracted to a method?
     * Reused by both register() and resendRegistrationOtp().
     * DRY — one place manages OTP generation and temp token creation.
     *
     * @param user    the unverified user entity
     * @param channel "EMAIL" or "PHONE"
     * @return RegistrationChallengeResponse with tempToken + masked contact
     */
    private RegistrationChallengeResponse sendRegistrationChallenge(User user, String channel) {
        String otp = otpService.generateAndStoreRegistrationOtp(user.getId());

        if ("EMAIL".equals(channel)) {
            // WHY try-catch around email? Resend free-tier only allows sending to your
            // own verified email. Any other recipient causes a 422/403 from the Resend API,
            // which previously crashed registration with 500. The OTP is already safely
            // stored in Redis — email failure should never block the user from proceeding.
            // We log the OTP to console as a fallback so it can be retrieved from Render logs.
            try {
                emailService.sendRegistrationOtp(user.getEmail(), user.getFullName(), otp);
            } catch (Exception e) {
                log.warn("Email delivery failed for {} — OTP logged for manual retrieval. Error: {}",
                        user.getEmail(), e.getMessage());
                log.info("FALLBACK OTP for {} : {}", user.getEmail(), otp);
            }
            String masked = maskEmail(user.getEmail());
            String tempToken = jwtService.generateRegistrationTempToken(user, "EMAIL");
            return RegistrationChallengeResponse.builder()
                    .tempToken(tempToken)
                    .verificationMethod("EMAIL")
                    .maskedContact(masked)
                    .expiresIn(1_800_000L)
                    .build();
        } else {
            // SMS path — also non-fatal
            try {
                smsService.sendOtp(user.getPhone(), otp);
            } catch (Exception e) {
                log.warn("SMS delivery failed for {} — OTP logged for manual retrieval. Error: {}",
                        user.getPhone(), e.getMessage());
                log.info("FALLBACK OTP for {} : {}", user.getPhone(), otp);
            }
            String masked = maskPhone(user.getPhone());
            String tempToken = jwtService.generateRegistrationTempToken(user, "PHONE");
            return RegistrationChallengeResponse.builder()
                    .tempToken(tempToken)
                    .verificationMethod("PHONE")
                    .maskedContact(masked)
                    .expiresIn(1_800_000L)
                    .build();
        }
    }

    /**
     * Verifies the registration OTP and issues full JWT tokens on success.
     *
     * WHY extract userId from tempToken claims?
     * We never store session state on the server. The tempToken is a signed JWT
     * that carries the userId — we verify its signature, extract the claim, and
     * look up the user. No Redis lookup needed for the session itself.
     *
     * WHY set emailVerified or phoneVerified AFTER verifying?
     * Proves the user actually owns the contact method. Without this:
     * - Anyone could register with someone else's email
     * - OTP confirmations would be meaningless
     *
     * @param request tempToken + OTP submitted by the user
     * @return full AuthResponse (access + refresh tokens) on success
     */
    public AuthResponse verifyRegistration(RegistrationVerifyRequest request) {
        // Step 1: Parse and validate the temp token
        Claims claims;
        try {
            claims = jwtService.extractAllClaims(request.tempToken());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Verification session expired. Please register again.");
        }

        // Step 2: Confirm this is a registration token (not a 2FA temp token)
        if (!Boolean.TRUE.equals(claims.get("registrationPending", Boolean.class))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid verification token.");
        }

        // Step 3: Load the user
        String userIdStr = claims.get("userId", String.class);
        UUID userId = UUID.fromString(userIdStr);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        // Step 4: Verify the OTP
        boolean valid = otpService.verifyRegistrationOtp(userId, request.otp());
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid or expired verification code. Please try again.");
        }

        // Step 5: Mark email/phone as verified
        String channel = claims.get("verificationChannel", String.class);
        if ("PHONE".equals(channel)) {
            user.setPhoneVerified(true);
        } else {
            user.setEmailVerified(true);
        }
        userRepository.save(user);
        log.info("User email/phone verified: {} (channel={})", user.getEmail(), channel);

        // Step 6: Issue full tokens — user is now fully authenticated
        return buildTokenResponse(user);
    }

    /**
     * Resends a registration verification OTP using the existing tempToken.
     * Called when the user clicks "Resend code" on the verify-registration screen.
     *
     * WHY accept tempToken instead of email?
     * The user may not be passing the email directly. More importantly, the tempToken
     * proves they just completed the register() step. Accepting only email could let
     * an attacker spam OTPs to any email by just knowing the address.
     *
     * @param tempToken the registrationPending JWT from the original register() call
     * @return a new RegistrationChallengeResponse with a fresh OTP and refreshed tempToken
     */
    public RegistrationChallengeResponse resendRegistrationOtp(String tempToken) {
        Claims claims;
        try {
            claims = jwtService.extractAllClaims(tempToken);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Verification session expired. Please register again.");
        }

        if (!Boolean.TRUE.equals(claims.get("registrationPending", Boolean.class))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid token for resend.");
        }

        String userIdStr = claims.get("userId", String.class);
        UUID userId = UUID.fromString(userIdStr);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        String channel = claims.getOrDefault("verificationChannel", "EMAIL").toString();
        return sendRegistrationChallenge(user, channel);
    }

    // ── Login (2FA-aware) ─────────────────────────────────────────────────────
    /**
     * Authenticates user credentials and returns either:
     * - AuthResponse (200) if 2FA is not required, or
     * - TwoFactorChallengeResponse (202) if 2FA is required.
     *
     * WHY return Object?
     * The two possible return types (AuthResponse, TwoFactorChallengeResponse) don't share
     * a common base class. Returning Object lets the controller use instanceof to decide
     * the HTTP status code (200 vs 202). The controller's ResponseEntity<?> type handles both.
     *
     * WHY accept HttpServletRequest?
     * Needed to read the tf_dt device fingerprint cookie to check if this device is trusted.
     * Passing it from the controller keeps AuthService testable (can mock the request).
     *
     * WHY use authenticationManager.authenticate() instead of direct BCrypt check?
     * AuthenticationManager is Spring Security's standardized auth pipeline:
     * 1. Calls loadUserByUsername(email) → loads user from DB
     * 2. Calls passwordEncoder.matches(rawPassword, hashedPassword)
     * 3. Checks isEnabled(), isAccountNonLocked(), etc.
     * 4. Throws specific exceptions: BadCredentialsException, DisabledException, LockedException
     *
     * Doing this ourselves: risk of missing a check.
     * Let Spring Security handle it: all checks guaranteed.
     */
    public Object login(AuthRequest request, HttpServletRequest httpRequest) {
        // Step 1: Verify credentials (throws AuthenticationException if wrong)
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.email(),
                        request.password()
                )
        );
        // If we reach here: authentication succeeded

        // Step 2: Load full User entity
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new UsernameNotFoundException("User not found after auth"));
        // Why load user again after authenticate()?
        // authenticate() doesn't return the User object.
        // We need the User entity to generate JWT claims (userId, role, fullName).

        // Step 2b: Block login for unverified accounts and re-trigger verification flow.
        // WHY re-send OTP instead of just blocking?
        // Better UX: if user lost their OTP email and comes back to login,
        // they get a fresh OTP automatically — no need to re-register.
        if (!user.isEmailVerified() && !user.isPhoneVerified()) {
            log.info("Login blocked — unverified account: {} (id={}). Sending new OTP.", user.getEmail(), user.getId());
            return sendRegistrationChallenge(user, "EMAIL");
        }

        // Step 3: Check if 2FA is configured and enabled
        Optional<UserTwoFactorConfig> configOpt = twoFactorConfigRepo.findByUser(user);

        if (configOpt.isPresent() && configOpt.get().isEnabled()) {
            UserTwoFactorConfig config = configOpt.get();

            // Step 4: Check device trust cookie — skip 2FA for trusted devices
            // WHY? "Trust this device for 30 days" UX — frequent traders skip OTP on their home PC.
            String fingerprint = trustedDeviceService.getDeviceFingerprint(httpRequest);
            if (fingerprint != null && trustedDeviceService.isDeviceTrusted(user.getId(), fingerprint)) {
                log.info("Trusted device — skipping 2FA for userId={}", user.getId());
                return buildTokenResponse(user);
            }

            // Step 5: 2FA required — generate temp token
            String tempToken = jwtService.generateTempToken(user, config.getMethod());

            // Step 6: For WEBAUTHN, pre-generate assertion challenge (stored in Redis by WebAuthnService)
            // WHY here? The browser needs the challenge immediately when landing on the 2FA page.
            // We generate it now so the frontend can call GET /2fa/webauthn/assertion-options
            // and get a challenge without requiring a separate roundtrip.
            if (config.getMethod() == UserTwoFactorConfig.TwoFactorMethod.WEBAUTHN) {
                webAuthnService.getAssertionOptions(user);
            }

            // Step 7: Initiate 2FA (store pending session, send OTP if EMAIL/SMS)
            twoFactorService.initiateTwoFactor(user, tempToken, config, emailService, smsService);

            log.info("2FA challenge initiated for userId={}, method={}", user.getId(), config.getMethod());

            return TwoFactorChallengeResponse.builder()
                    .requiresTwoFactor(true)
                    .tempToken(tempToken)
                    .method(config.getMethod().name())
                    .expiresIn(600_000L)
                    .build();
        }

        // No 2FA — issue tokens directly
        log.info("User logged in (no 2FA): {}", user.getEmail());
        return buildTokenResponse(user);
    }

    // ── Refresh Token ─────────────────────────────────────────────────────────
    /**
     * Validates a refresh token and issues new access + refresh tokens.
     *
     * WHY validate against Redis?
     * JWTs are stateless — they can't be revoked.
     * But refresh tokens stored in Redis CAN be deleted (on logout).
     * Checking Redis: "is this refresh token still active?"
     * If user logged out, Redis entry is deleted → refresh fails → re-login required.
     */
    public AuthResponse refreshToken(String refreshToken) {
        String email = jwtService.extractUsername(refreshToken);
        if (email == null) {
            throw new IllegalArgumentException("Invalid or expired refresh token");
        }

        // Check if refresh token is in Redis (not revoked by logout)
        String storedToken = redisTemplate.opsForValue().get(REFRESH_TOKEN_KEY + email);
        if (storedToken == null || !storedToken.equals(refreshToken)) {
            throw new IllegalArgumentException("Refresh token has been revoked. Please log in again.");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));

        log.debug("Token refreshed for user: {}", email);
        return buildTokenResponse(user);
        // WHY generate a new refresh token on refresh?
        // "Token rotation" — each refresh issues a new token.
        // If an attacker steals a refresh token and uses it,
        // the legitimate user's next refresh fails (token already rotated).
        // This alerts the system to a possible token theft.
    }

    // ── Logout ────────────────────────────────────────────────────────────────
    /**
     * Revokes the refresh token by deleting it from Redis.
     * The access token expires naturally after 15 minutes.
     *
     * WHY not also invalidate the access token?
     * JWTs are stateless — you'd need a blacklist (Redis set) checked on every request.
     * Performance cost: every API call must check Redis. Not worth it for 15-minute tokens.
     * Accept the risk: stolen access token valid for max 15 minutes. Refresh token: revoked instantly.
     * For higher security (banking), add access token blacklisting.
     */
    public void logout(String refreshToken) {
        String email = jwtService.extractUsername(refreshToken);
        if (email != null) {
            // WHY Boolean not Long? Spring Data Redis 3.x: delete(String) returns Boolean.
            // true = key was deleted, false/null = key didn't exist (user already logged out).
            Boolean deleted = redisTemplate.delete(REFRESH_TOKEN_KEY + email);
            if (Boolean.TRUE.equals(deleted)) {
                log.info("User logged out, refresh token revoked: {}", email);
            }
        }
    }

    // ── Contact Masking Helpers ──────────────────────────────────────────────────

    /**
     * Masks an email address for display in the verification UI.
     * "trader@tradeforge.com" → "t****r@tradeforge.com"
     *
     * WHY mask? Privacy. We confirm where the OTP was sent without revealing the full address.
     * Useful if the user's email is shown in a shared-screen environment.
     *
     * @param email the full email address
     * @return partially masked email
     */
    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***@***";
        int atIndex = email.indexOf('@');
        String local = email.substring(0, atIndex);
        String domain = email.substring(atIndex); // includes the @
        if (local.length() <= 2) {
            return local + "***" + domain;
        }
        // Keep first and last character of the local part, mask the middle
        String masked = local.charAt(0) + "*".repeat(local.length() - 2) + local.charAt(local.length() - 1);
        return masked + domain;
    }

    /**
     * Masks a phone number for display in the verification UI.
     * "+919876543210" → "+91****3210"
     *
     * WHY keep last 4? Enough for the user to confirm it's their number, not enough to guess it.
     *
     * @param phone the full phone number (E.164 format)
     * @return partially masked phone
     */
    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 6) return "****";
        int keepStart = Math.min(3, phone.length() / 3);
        int keepEnd = 4;
        if (keepStart + keepEnd >= phone.length()) return phone;
        String start = phone.substring(0, keepStart);
        String end = phone.substring(phone.length() - keepEnd);
        String masked = "*".repeat(phone.length() - keepStart - keepEnd);
        return start + masked + end;
    }

    // ── Token Response Builder ─────────────────────────────────────────────────
    /**
     * Builds AuthResponse with access token, refresh token, and user info.
     *
     * WHY public? TwoFactorService needs to call this after OTP/WebAuthn verification
     * to issue the final real tokens. Making it public is the simplest way to share
     * the token-building logic between AuthService and TwoFactorService without duplication.
     *
     * WHY not extract to a shared utility class?
     * buildTokenResponse needs access to JwtService and StringRedisTemplate.
     * These are already available here. Extracting to a utility would require passing them.
     * Keeping it in AuthService is simpler — TwoFactorService just calls authService.buildTokenResponse(user).
     */
    public AuthResponse buildTokenResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);

        // Store refresh token in Redis with TTL
        // WHY TTL? If user never logs out, the refresh token auto-expires after 7 days.
        // No need to manually clean up expired tokens — Redis handles it.
        redisTemplate.opsForValue().set(
                REFRESH_TOKEN_KEY + user.getEmail(),
                refreshToken,
                REFRESH_TOKEN_TTL
        );

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(900_000L) // 15 minutes in milliseconds — Angular uses this for refresh scheduling
                .user(
                    AuthResponse.UserInfo.builder()
                        .id(user.getId().toString())
                        // WHY toString()? UUID → String. JSON doesn't have a UUID type.
                        // Angular's UserInfo interface has id: string.
                        .email(user.getEmail())
                        .fullName(user.getFullName())
                        .role(user.getRole().name())
                        .build()
                )
                .build();
    }
}
