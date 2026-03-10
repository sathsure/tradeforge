package com.tradeforge.auth.controller;

import com.tradeforge.auth.dto.*;
import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.UserTwoFactorConfig;
import com.tradeforge.auth.entity.WebAuthnCredential;
import com.tradeforge.auth.repository.TwoFactorConfigRepository;
import com.tradeforge.auth.repository.UserRepository;
import com.tradeforge.auth.security.JwtService;
import com.tradeforge.auth.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WHY @RestController?
 * All methods return JSON. Combines @Controller + @ResponseBody.
 * No view templates needed for an API endpoint.
 *
 * WHY @RequestMapping("/api/auth/2fa")?
 * Groups all 2FA-related endpoints under a clear prefix.
 * SecurityConfig permits the public verification endpoints without JWT.
 * All other endpoints (status, setup, devices) require a full JWT.
 *
 * Endpoint Groups:
 * 1. PUBLIC (permitAll in SecurityConfig):
 *    - POST /verify-otp        — verify OTP during login 2FA challenge
 *    - POST /verify-webauthn   — verify WebAuthn assertion during login
 *    - GET  /webauthn/assertion-options?tempToken=... — get WebAuthn challenge for login
 *
 * 2. AUTHENTICATED (require valid JWT, not a tempToken):
 *    - GET  /status                  — user's current 2FA config
 *    - POST /send-enroll-otp         — send OTP to verify email/phone before enabling 2FA
 *    - POST /verify-enroll-otp       — verify enrollment OTP and enable 2FA
 *    - POST /disable                 — disable 2FA
 *    - GET  /webauthn/register-options — get WebAuthn registration options
 *    - POST /webauthn/register        — register a new WebAuthn credential
 *    - GET  /trusted-devices          — list active trusted devices
 *    - DELETE /trusted-devices/{id}   — revoke a trusted device
 *
 * WHY no Lombok? Consistent with rest of the project.
 */
@RestController
@RequestMapping("/api/auth/2fa")
public class TwoFactorController {

    private static final Logger log = LoggerFactory.getLogger(TwoFactorController.class);

    private final TwoFactorService twoFactorService;
    private final AuthService authService;
    private final TrustedDeviceService trustedDeviceService;
    private final WebAuthnService webAuthnService;
    private final OtpService otpService;
    private final TwoFactorConfigRepository configRepo;
    private final UserRepository userRepo;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final SmsService smsService;

    // WHY explicit constructor? Spring constructor injection — all dependencies guaranteed non-null at startup.
    public TwoFactorController(TwoFactorService twoFactorService,
                                AuthService authService,
                                TrustedDeviceService trustedDeviceService,
                                WebAuthnService webAuthnService,
                                OtpService otpService,
                                TwoFactorConfigRepository configRepo,
                                UserRepository userRepo,
                                JwtService jwtService,
                                EmailService emailService,
                                SmsService smsService) {
        this.twoFactorService = twoFactorService;
        this.authService = authService;
        this.trustedDeviceService = trustedDeviceService;
        this.webAuthnService = webAuthnService;
        this.otpService = otpService;
        this.configRepo = configRepo;
        this.userRepo = userRepo;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.smsService = smsService;
    }

    // ── PUBLIC ENDPOINTS ──────────────────────────────────────────────────────
    // These are in SecurityConfig.permitAll() — no JWT required.
    // They accept a tempToken in the request body for session identification.

    /**
     * POST /api/auth/2fa/verify-otp
     * Verifies the 6-digit OTP and completes the login.
     *
     * WHY public (no JWT)? The user doesn't have a real JWT yet — that's what we're issuing.
     * The tempToken in the request body is how we identify the pending login session.
     *
     * Returns 200 with AuthResponse containing real access + refresh tokens.
     * Angular: on success, store tokens and navigate to dashboard.
     */
    @PostMapping("/verify-otp")
    public ResponseEntity<AuthResponse> verifyOtp(
            @Valid @RequestBody OtpVerifyRequest req,
            HttpServletRequest httpReq,
            HttpServletResponse httpResp) {
        AuthResponse response = twoFactorService.verifyOtp(req, httpReq, httpResp);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/auth/2fa/verify-webauthn
     * Verifies a WebAuthn assertion and completes the login.
     *
     * WHY public? Same as verify-otp — no real JWT exists yet.
     * Returns 200 with AuthResponse on success.
     */
    @PostMapping("/verify-webauthn")
    public ResponseEntity<AuthResponse> verifyWebAuthn(
            @Valid @RequestBody WebAuthnAssertionRequest req,
            HttpServletRequest httpReq,
            HttpServletResponse httpResp) {
        AuthResponse response = twoFactorService.verifyWebAuthn(req, httpReq, httpResp);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/auth/2fa/webauthn/assertion-options?tempToken=...
     * Returns PublicKeyCredentialRequestOptions for navigator.credentials.get().
     *
     * WHY public? Called by Angular on the 2FA page before the user completes WebAuthn.
     * The tempToken in the query param identifies which user needs the challenge.
     *
     * WHY tempToken as query param (not header)?
     * This is a GET request — no request body. Query param is the natural place.
     * The challenge doesn't need to be kept secret (it's randomized per request).
     */
    @GetMapping("/webauthn/assertion-options")
    public ResponseEntity<Map<String, Object>> getAssertionOptions(@RequestParam String tempToken) {
        // WHY extract user from tempToken? The assertion challenge must be scoped to the user.
        // WebAuthnService.getAssertionOptions() returns only credentials belonging to this user.
        String email = jwtService.extractUsername(tempToken);
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid temp token");
        }
        User user = userRepo.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        return ResponseEntity.ok(webAuthnService.getAssertionOptions(user));
    }

    // ── AUTHENTICATED ENDPOINTS ────────────────────────────────────────────────
    // These require a real JWT. Spring Security sets Authentication from the JWT.
    // WHY Authentication param? Spring injects this from SecurityContextHolder.
    // auth.getPrincipal() returns the User entity (set in JwtAuthenticationFilter).

    /**
     * GET /api/auth/2fa/status
     * Returns the user's current 2FA configuration.
     * Angular uses this to render the settings page 2FA section.
     *
     * WHY not just return the UserTwoFactorConfig entity?
     * Entities expose internal DB fields (id, user reference). DTOs control what's exposed.
     * TwoFactorStatusResponse contains only what Angular needs: method, enabled flags.
     */
    @GetMapping("/status")
    public ResponseEntity<TwoFactorStatusResponse> getStatus(Authentication auth) {
        User user = (User) auth.getPrincipal();
        UserTwoFactorConfig config = configRepo.findByUser(user).orElse(null);

        TwoFactorStatusResponse resp = TwoFactorStatusResponse.builder()
                .method(config != null ? config.getMethod().name() : "NONE")
                .enabled(config != null && config.isEnabled())
                .phoneVerified(config != null && config.isPhoneVerified())
                .emailVerified(config != null && config.isEmailVerified())
                .build();

        return ResponseEntity.ok(resp);
    }

    /**
     * POST /api/auth/2fa/send-enroll-otp
     * Sends an enrollment OTP to the user's email or phone.
     * Called when the user clicks "Enable EMAIL 2FA" or "Enable SMS 2FA" in settings.
     *
     * WHY a separate "enroll OTP" from the "login OTP"?
     * Enrollment verifies channel ownership: "does this user own this email/phone?"
     * The login OTP verifies identity: "is this the person who registered?"
     * Separate keys in Redis prevent cross-contamination between login and enrollment flows.
     *
     * WHY require authentication? Without it, anyone could trigger OTP emails to arbitrary addresses.
     * This endpoint is only accessible to an already-authenticated user managing their own account.
     */
    @PostMapping("/send-enroll-otp")
    public ResponseEntity<Void> sendEnrollOtp(
            @RequestBody TwoFactorSetupRequest req,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        String method = req.method().toUpperCase();

        switch (method) {
            case "EMAIL" -> {
                String otp = otpService.generateAndStoreEnrollOtp(user.getId());
                emailService.sendEnrollOtp(user.getEmail(), user.getFullName(), otp);
                log.info("Enrollment OTP sent to email for userId={}", user.getId());
            }
            case "SMS" -> {
                String phone = user.getPhone();
                if (phone == null || phone.isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "No phone number on account. Add a phone number first.");
                }
                String otp = otpService.generateAndStoreEnrollOtp(user.getId());
                // WHY sendOtp for SMS enrollment? SMS message content is identical for
                // both login and enrollment — "Your TradeForge code: 123456".
                smsService.sendOtp(phone, otp);
                log.info("Enrollment OTP sent to SMS for userId={}", user.getId());
            }
            case "WEBAUTHN" -> {
                // WHY no OTP for WEBAUTHN enrollment? WebAuthn registration uses a challenge,
                // not an OTP. The challenge is generated in GET /webauthn/register-options.
                // Nothing to send here — return success so Angular advances to the next step.
                log.debug("WEBAUTHN enrollment requested — no OTP needed, returning 200");
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown 2FA method: " + req.method() + ". Use EMAIL, SMS, or WEBAUTHN.");
        }

        return ResponseEntity.ok().build();
    }

    /**
     * POST /api/auth/2fa/verify-enroll-otp
     * Verifies the enrollment OTP and enables 2FA with the chosen method.
     *
     * WHY verify OTP before enabling 2FA?
     * Prevents an attacker who has session access from enabling 2FA on someone else's
     * account (locking the real owner out). The OTP proves they control the channel.
     *
     * WHY create-or-update the UserTwoFactorConfig?
     * User might be switching from EMAIL to SMS, or enabling 2FA for the first time.
     * findByUser returns empty if no config exists → create new. Otherwise update.
     */
    @PostMapping("/verify-enroll-otp")
    public ResponseEntity<Void> verifyEnrollOtp(
            @RequestBody TwoFactorSetupRequest req,
            Authentication auth) {
        User user = (User) auth.getPrincipal();

        if (req.otp() == null || req.otp().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP is required for verification");
        }

        // Verify the enrollment OTP
        boolean valid = otpService.verifyEnrollOtp(user.getId(), req.otp());
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid or expired enrollment OTP. Please request a new one.");
        }

        // Determine method and update 2FA config
        String methodStr = req.method().toUpperCase();
        UserTwoFactorConfig.TwoFactorMethod method;
        try {
            method = UserTwoFactorConfig.TwoFactorMethod.valueOf(methodStr);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid 2FA method: " + req.method());
        }

        // Create or update the 2FA config for this user
        UserTwoFactorConfig config = configRepo.findByUser(user).orElse(new UserTwoFactorConfig());
        config.setUser(user);
        config.setMethod(method);
        config.setEnabled(true);

        // WHY set channel-specific verified flag?
        // If user switches methods later, we know which channels were previously verified.
        if (method == UserTwoFactorConfig.TwoFactorMethod.EMAIL) {
            config.setEmailVerified(true);
        } else if (method == UserTwoFactorConfig.TwoFactorMethod.SMS) {
            config.setPhoneVerified(true);
        }

        configRepo.save(config);
        log.info("2FA enabled for userId={}, method={}", user.getId(), method);

        return ResponseEntity.ok().build();
    }

    /**
     * POST /api/auth/2fa/disable
     * Disables 2FA for the user.
     *
     * WHY accept a body (Map<String,String>)?
     * Future versions may require an OTP to disable 2FA (extra security layer).
     * The body placeholder allows adding OTP verification without changing the endpoint.
     * Angular can send {} for now and we'll add OTP requirement in a security sprint.
     *
     * WHY not delete the UserTwoFactorConfig row?
     * Keeping the row with method=NONE and enabled=false preserves audit history.
     * Re-enabling 2FA later will update the existing row — simpler than create/delete cycles.
     */
    @PostMapping("/disable")
    public ResponseEntity<Void> disable2fa(
            @RequestBody(required = false) Map<String, String> body,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        configRepo.findByUser(user).ifPresent(config -> {
            config.setEnabled(false);
            config.setMethod(UserTwoFactorConfig.TwoFactorMethod.NONE);
            configRepo.save(config);
            log.info("2FA disabled for userId={}", user.getId());
        });
        return ResponseEntity.ok().build();
    }

    // ── WebAuthn Settings Endpoints ────────────────────────────────────────────

    /**
     * GET /api/auth/2fa/webauthn/register-options
     * Returns PublicKeyCredentialCreationOptions for navigator.credentials.create().
     * Angular calls this when user clicks "Add Security Key" or "Add Biometric" in settings.
     *
     * WHY authenticated? Only logged-in users can register new WebAuthn credentials.
     * The registration must be tied to a specific user — prevents anonymous credential creation.
     */
    @GetMapping("/webauthn/register-options")
    public ResponseEntity<Map<String, Object>> getRegisterOptions(Authentication auth) {
        User user = (User) auth.getPrincipal();
        return ResponseEntity.ok(webAuthnService.getRegistrationOptions(user));
    }

    /**
     * POST /api/auth/2fa/webauthn/register
     * Stores the WebAuthn credential and enables WEBAUTHN 2FA.
     *
     * WHY update 2FA config to WEBAUTHN? The registration itself doesn't enable 2FA.
     * We must explicitly set method=WEBAUTHN and enabled=true in UserTwoFactorConfig
     * so AuthService.login() knows to trigger the WebAuthn challenge on next login.
     *
     * Returns the credentialId and deviceName for immediate display in settings UI.
     */
    @PostMapping("/webauthn/register")
    public ResponseEntity<Map<String, String>> registerWebAuthn(
            @Valid @RequestBody WebAuthnRegisterRequest req,
            Authentication auth) {
        User user = (User) auth.getPrincipal();

        // Register the credential with WebAuthnService
        WebAuthnCredential cred = webAuthnService.registerCredential(user, req);

        // Enable WEBAUTHN 2FA in the user's config
        UserTwoFactorConfig config = configRepo.findByUser(user).orElse(new UserTwoFactorConfig());
        config.setUser(user);
        config.setMethod(UserTwoFactorConfig.TwoFactorMethod.WEBAUTHN);
        config.setEnabled(true);
        configRepo.save(config);

        log.info("WebAuthn 2FA registered and enabled for userId={}", user.getId());

        // WHY Map response? Simple key-value pairs are cleaner than a new DTO class
        // for this one-time response. Angular just needs credentialId + deviceName to display.
        String deviceName = cred.getDeviceName() != null ? cred.getDeviceName() : "Unknown Device";
        return ResponseEntity.ok(Map.of(
                "credentialId", cred.getCredentialId(),
                "deviceName", deviceName
        ));
    }

    // ── Trusted Device Endpoints ────────────────────────────────────────────────

    /**
     * GET /api/auth/2fa/trusted-devices
     * Returns all active (non-expired) trusted devices for the settings page.
     *
     * WHY Authentication param? We get the userId from the authenticated user —
     * not from a query param. User can only see their own devices.
     */
    @GetMapping("/trusted-devices")
    public ResponseEntity<List<TrustedDeviceInfo>> getTrustedDevices(Authentication auth) {
        User user = (User) auth.getPrincipal();
        return ResponseEntity.ok(trustedDeviceService.getActiveTrustedDevices(user.getId()));
    }

    /**
     * DELETE /api/auth/2fa/trusted-devices/{deviceId}
     * Revokes a specific trusted device.
     *
     * WHY @PathVariable UUID? UUIDs are type-safe. Spring automatically parses the path segment.
     * If the caller sends a non-UUID string, Spring returns 400 before hitting our code.
     *
     * Returns 204 No Content — successful deletion with no response body.
     */
    @DeleteMapping("/trusted-devices/{deviceId}")
    public ResponseEntity<Void> revokeTrustedDevice(
            @PathVariable UUID deviceId,
            Authentication auth) {
        User user = (User) auth.getPrincipal();
        trustedDeviceService.revokeDevice(deviceId, user.getId());
        return ResponseEntity.noContent().build();
    }
}
