package com.tradeforge.auth.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * WHY @Profile("dev")?
 * This controller ONLY exists when Spring profile is "dev".
 * It exposes the OTP from Redis — safe in local development, NEVER in production.
 *
 * WHY a dev OTP endpoint?
 * MockEmailService logs OTP to a hidden console (Windows background process).
 * This endpoint lets developers retrieve the OTP without reading server logs.
 * Useful when setting up a new dev environment or testing the OTP flow.
 *
 * HOW TO USE:
 *   GET http://localhost:8080/api/dev/otp/{userId}
 *   Returns: { "otp": "123456" } or { "message": "No OTP found" }
 *
 * SECURITY: This endpoint is excluded from production builds via @Profile("dev").
 * The "dev" profile is only active when spring.profiles.active=dev in application.yml.
 * Production application.yml should not include this profile.
 */
@RestController
@RequestMapping("/api/dev")
@Profile("dev")
public class DevController {

    private static final Logger log = LoggerFactory.getLogger(DevController.class);
    private final StringRedisTemplate redis;

    public DevController(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * GET /api/dev/otp/registration/{userId}
     * Returns the current registration OTP for a userId from Redis.
     *
     * WHY userId not email? OTPs are stored by userId in Redis.
     * The userId is in the tempToken JWT payload (base64 decode the middle section to see it).
     *
     * @param userId the UUID of the user (from the tempToken payload)
     */
    @GetMapping("/otp/registration/{userId}")
    public ResponseEntity<Map<String, Object>> getRegistrationOtp(@PathVariable String userId) {
        String key = "auth:register:otp:" + userId;
        String stored = redis.opsForValue().get(key);
        Map<String, Object> response = new HashMap<>();

        if (stored == null) {
            log.warn("DEV: No registration OTP found for userId={}", userId);
            response.put("message", "No OTP found. It may have expired or already been used.");
            return ResponseEntity.ok(response);
        }

        // Format stored: "otp:attemptCount"
        String otp = stored.split(":")[0];
        log.info("DEV: Retrieved registration OTP for userId={}", userId);
        response.put("otp", otp);
        response.put("userId", userId);
        response.put("warning", "DEV ONLY — never expose this in production");
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/dev/otp/login/{userId}
     * Returns the current 2FA login OTP.
     */
    @GetMapping("/otp/login/{userId}")
    public ResponseEntity<Map<String, Object>> getLoginOtp(@PathVariable String userId) {
        String key = "auth:2fa:otp:" + userId;
        String stored = redis.opsForValue().get(key);
        Map<String, Object> response = new HashMap<>();

        if (stored == null) {
            response.put("message", "No login OTP found for this userId.");
            return ResponseEntity.ok(response);
        }

        String otp = stored.split(":")[0];
        response.put("otp", otp);
        response.put("userId", userId);
        response.put("warning", "DEV ONLY — never expose this in production");
        return ResponseEntity.ok(response);
    }
}
