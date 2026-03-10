package com.tradeforge.auth.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * WHY @RestControllerAdvice?
 * Centralizes error handling for all @RestController classes in this service.
 * Without this: unhandled exceptions default to Spring's generic error response
 * ({"status":500,"error":"Internal Server Error"}) — no useful message for the client.
 * With this: every exception type maps to a specific HTTP status + message.
 *
 * WHY centralize instead of try/catch in each method?
 * DRY principle — one place to handle each exception type.
 * If we add a new exception type, we add it HERE, not in every controller.
 * Controllers stay focused on the happy path; this class owns the error paths.
 *
 * SECURITY NOTE: Never expose stack traces or internal exception details in responses.
 * Attackers use stack traces to identify framework versions and find known vulnerabilities.
 * Log the full exception server-side; return only a safe, human-readable message.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 400 Bad Request — business validation failures.
     *
     * WHY IllegalArgumentException → 400?
     * "Email already registered", "Invalid phone format" — these are client errors.
     * The client sent invalid data. 400 is semantically correct (not 500).
     * Spring defaults to 500 for RuntimeExceptions not annotated with @ResponseStatus.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Bad request: {}", ex.getMessage());
        return errorResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /**
     * 401 Unauthorized — wrong password or user not found during authentication.
     *
     * WHY map both to 401?
     * Security best practice: don't reveal whether the email exists.
     * "Invalid email or password" for both cases makes enumeration attacks harder.
     * If we return 404 for missing email and 401 for wrong password,
     * an attacker can tell which emails are registered.
     */
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        log.warn("Authentication failed: bad credentials");
        return errorResponse(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
    }

    @ExceptionHandler(UsernameNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleUserNotFound(UsernameNotFoundException ex) {
        log.warn("Authentication failed: user not found");
        return errorResponse(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
    }

    /**
     * 423 Locked — account deactivated by admin.
     * 403 Forbidden — account disabled (pending review, etc.)
     *
     * WHY separate from 401? The user's credentials are correct but access is denied.
     * The client needs to show a different message: not "wrong password" but "account locked".
     */
    @ExceptionHandler(LockedException.class)
    public ResponseEntity<Map<String, Object>> handleLocked(LockedException ex) {
        log.warn("Authentication failed: account locked");
        return errorResponse(HttpStatus.LOCKED, "Your account has been locked. Please contact support.");
    }

    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<Map<String, Object>> handleDisabled(DisabledException ex) {
        log.warn("Authentication failed: account disabled");
        return errorResponse(HttpStatus.FORBIDDEN, "Your account is disabled. Please contact support.");
    }

    /**
     * Passes through ResponseStatusException with its own status code.
     * WHY? OtpService throws ResponseStatusException(429) for brute-force lockout.
     * TwoFactorService/AuthService throw ResponseStatusException(401/400) for invalid tokens.
     * These are intentional — pass them through as-is.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        log.warn("Response status exception: {} {}", ex.getStatusCode(), ex.getReason());
        return errorResponse(HttpStatus.valueOf(ex.getStatusCode().value()), ex.getReason());
    }

    /**
     * 400 — Bean Validation failures (@NotBlank, @Email, @Size annotations on DTOs).
     *
     * WHY collect field errors?
     * Shows all invalid fields at once (not just the first one).
     * Angular's form can highlight multiple fields simultaneously.
     * Returns: {"message": "fullName: must not be blank; email: must be a well-formed email address"}
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        log.warn("Validation failed: {}", message);
        return errorResponse(HttpStatus.BAD_REQUEST, message);
    }

    /**
     * 500 — Catch-all for unexpected exceptions.
     *
     * WHY catch Exception here?
     * Prevents raw stack traces from leaking to the client.
     * Logs the full exception server-side for debugging.
     * Returns a safe, generic message to the client.
     *
     * SECURITY: Never return ex.getMessage() for unknown exceptions.
     * The message might contain SQL, file paths, or internal class names.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        log.error("Unexpected error: {}", ex.getMessage(), ex);
        return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred. Please try again.");
    }

    /**
     * Builds a consistent error response body.
     *
     * WHY a consistent structure?
     * Angular's HttpClient interceptor can reliably read error.error.message.
     * All error handling in NgRx effects uses: error?.error?.message ?? 'default'
     * A consistent structure means the fallback default is rarely hit.
     *
     * Response shape: { "status": 400, "message": "...", "timestamp": "..." }
     */
    private ResponseEntity<Map<String, Object>> errorResponse(HttpStatus status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("status", status.value());
        body.put("message", message);
        body.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.status(status).body(body);
    }
}
