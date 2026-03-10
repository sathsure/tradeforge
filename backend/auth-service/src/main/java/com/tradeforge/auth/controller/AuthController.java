package com.tradeforge.auth.controller;

import com.tradeforge.auth.dto.AuthRequest;
import com.tradeforge.auth.dto.AuthResponse;
import com.tradeforge.auth.dto.RegisterRequest;
import com.tradeforge.auth.dto.RegistrationChallengeResponse;
import com.tradeforge.auth.dto.RegistrationVerifyRequest;
import com.tradeforge.auth.dto.TwoFactorChallengeResponse;
import com.tradeforge.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * WHY @RestController?
 * Combines @Controller + @ResponseBody.
 * Every method returns data directly as JSON — not a view template name.
 * Spring auto-serializes return objects to JSON via Jackson.
 *
 * WHY @RequestMapping("/api/auth")?
 * All endpoints in this controller start with /api/auth.
 * /api prefix: distinguishes API endpoints from static files.
 * /auth: identifies this controller's domain.
 *
 * WHY explicit constructor?
 * Constructor injection is the recommended Spring pattern — final field enforces non-null.
 * If Spring can't find the AuthService bean, app fails to start with a clear error.
 * No Lombok used in this project (Java 21 compatibility).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    // WHY explicit constructor? @RequiredArgsConstructor (Lombok) is incompatible with Java 25.
    // Constructor injection is the recommended Spring pattern — final field enforces non-null.
    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * POST /api/auth/register
     * Creates a new trader account and sends an email verification OTP.
     *
     * WHY ResponseEntity<?>?
     * Returns RegistrationChallengeResponse (HTTP 202) when email verification is required.
     * The Angular frontend checks requiresVerification:true and navigates to /auth/verify-registration.
     *
     * WHY 202 Accepted (not 201 Created)?
     * 202 means "request accepted, processing not complete."
     * The account exists in the DB, but it is NOT usable until the email is verified.
     * 201 would imply the resource is ready — it isn't until verification succeeds.
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        Object result = authService.register(request);
        if (result instanceof RegistrationChallengeResponse) {
            // 202 Accepted: account created, email verification pending
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
        }
        // Fallback: 201 Created with full tokens (future admin-bypass path)
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    /**
     * POST /api/auth/verify-registration
     * Submits the OTP received by email/SMS to verify the newly registered account.
     * Returns full JWT tokens on success — user is immediately logged in.
     *
     * WHY public (no auth required)?
     * The user doesn't have a real access token yet — they're mid-registration.
     * The tempToken in the request body identifies the pending session.
     * SecurityConfig explicitly permits this endpoint.
     */
    @PostMapping("/verify-registration")
    public ResponseEntity<AuthResponse> verifyRegistration(
            @Valid @RequestBody RegistrationVerifyRequest request) {
        return ResponseEntity.ok(authService.verifyRegistration(request));
    }

    /**
     * POST /api/auth/resend-registration-otp
     * Resends the email/phone OTP for account verification.
     * Called when the user clicks "Resend code" on the verify-registration screen.
     *
     * WHY accept tempToken in body?
     * The tempToken carries the user's identity without requiring a real JWT.
     * Accepting only an email would let an attacker spam OTPs to any address.
     *
     * WHY return 200 with a new RegistrationChallengeResponse?
     * The frontend needs the new tempToken and masked contact to refresh its UI state.
     * Each resend generates a fresh OTP and a fresh tempToken.
     */
    @PostMapping("/resend-registration-otp")
    public ResponseEntity<RegistrationChallengeResponse> resendRegistrationOtp(
            @RequestBody java.util.Map<String, String> body) {
        String tempToken = body.get("tempToken");
        if (tempToken == null || tempToken.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(authService.resendRegistrationOtp(tempToken));
    }

    /**
     * POST /api/auth/login
     * Authenticates user and returns either:
     * - 200 AuthResponse (normal login, no 2FA required)
     * - 202 TwoFactorChallengeResponse (2FA required, Angular shows OTP screen)
     *
     * WHY ResponseEntity<?>?
     * The return type is polymorphic: AuthResponse or TwoFactorChallengeResponse.
     * They don't share a common type — wildcard <?> lets us return either.
     * Angular checks: if (res.status === 202 || res.requiresTwoFactor) → show 2FA UI.
     *
     * WHY HttpServletRequest param?
     * AuthService.login() needs it to read the tf_dt device fingerprint cookie.
     * Spring injects HttpServletRequest automatically — no annotation needed.
     *
     * WHY 202 Accepted for 2FA?
     * 202 means "request received and understood, but processing is not complete".
     * The login is not complete until 2FA is verified. Semantically correct.
     * 200 would imply "login complete" — misleading when 2FA is still pending.
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody AuthRequest request,
                                    HttpServletRequest httpRequest) {
        Object result = authService.login(request, httpRequest);

        // WHY instanceof checks? The service returns Object to support multiple return types.
        // The controller is responsible for mapping to the correct HTTP status code.
        if (result instanceof TwoFactorChallengeResponse) {
            // 202 Accepted: login initiated, 2FA verification pending
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
        }
        if (result instanceof RegistrationChallengeResponse) {
            // 202 Accepted: account exists but was never verified — re-triggered OTP flow
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
        }
        // 200 OK: login complete, tokens issued
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/auth/refresh
     * Uses refresh token to issue new access token.
     * Called silently by Angular's HTTP interceptor when access token expires.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestHeader("X-Refresh-Token") String refreshToken) {
        // WHY custom header instead of body? Refresh token is not request data.
        // Using a header is cleaner and prevents accidental logging of the token.
        return ResponseEntity.ok(authService.refreshToken(refreshToken));
    }

    /**
     * POST /api/auth/logout
     * Invalidates refresh token in Redis.
     * Access token expires naturally after 15 minutes.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("X-Refresh-Token") String refreshToken) {
        authService.logout(refreshToken);
        return ResponseEntity.noContent().build();
        // WHY 204 No Content? Logout has no response body. 204 is correct for
        // "action performed successfully, nothing to return".
    }
}
