package com.tradeforge.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

/**
 * WHY @Service?
 * Spring manages this as a singleton bean — one instance reused for all email sends.
 *
 * WHY @Primary?
 * There will be multiple EmailService implementations (Mock + Smtp).
 * @Primary tells Spring: "when injecting EmailService, prefer THIS bean."
 * In dev, we want mock (no real SMTP needed).
 * In production: remove @Primary from this class and add @Primary to SmtpEmailService,
 * OR use @ConditionalOnProperty to activate Smtp only when two-fa.mock-email=false.
 *
 * WHY log OTPs to console?
 * In dev, you want to see the OTP without setting up real SMTP.
 * The formatted box makes OTPs visually obvious in the console output.
 *
 * SECURITY NOTE: NEVER deploy with @Primary on MockEmailService in production.
 * OTPs in logs are a security risk if logs are shipped to external aggregators.
 * In production, delete this class or disable it with @Profile("dev").
 */
@Service
@Primary
@ConditionalOnProperty(name = "two-fa.mock-email", havingValue = "true", matchIfMissing = true)
// WHY @ConditionalOnProperty? When mock-email=false in application.yml,
// SmtpEmailService is used instead. MockEmailService is excluded from the context.
// matchIfMissing=true: if the property is absent, default to mock (safe for new devs).
public class MockEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(MockEmailService.class);

    /**
     * WHY no constructor injection?
     * This service has no dependencies — no fields to inject.
     * Default no-arg constructor is sufficient.
     */

    /**
     * Logs the login OTP to the console in a visually distinct format.
     * WHY log.info? INFO level is visible in default Spring Boot logging.
     * DEBUG would be hidden in production config — but OTPs should never reach prod logs anyway.
     *
     * WHY the box art? Makes the OTP immediately obvious when scanning logs.
     * Without it, the OTP line could be missed among hundreds of log lines.
     */
    @Override
    public void sendOtp(String toEmail, String fullName, String otp) {
        log.info("╔══════════════════════════════════════════╗");
        log.info("║   TradeForge 2FA OTP (DEV MODE)          ║");
        log.info("║   To:    {}   ║", padRight(toEmail, 36));
        log.info("║   Name:  {}   ║", padRight(fullName, 36));
        log.info("║   OTP:   {}                              ║", otp);
        log.info("║   Valid for: 10 minutes                  ║");
        log.info("╚══════════════════════════════════════════╝");
    }

    /**
     * Logs the enrollment OTP to the console.
     * WHY separate from sendOtp? Different context — user is setting up 2FA, not logging in.
     * The log message makes it clear this OTP is for enrollment, not a login attempt.
     */
    @Override
    public void sendEnrollOtp(String toEmail, String fullName, String otp) {
        log.info("╔══════════════════════════════════════════╗");
        log.info("║   TradeForge 2FA ENROLL OTP (DEV MODE)   ║");
        log.info("║   To:    {}   ║", padRight(toEmail, 36));
        log.info("║   Name:  {}   ║", padRight(fullName, 36));
        log.info("║   OTP:   {}                              ║", otp);
        log.info("║   Valid for: 15 minutes                  ║");
        log.info("╚══════════════════════════════════════════╝");
    }

    /**
     * Logs the registration verification OTP to the console.
     * WHY welcoming message? First contact with new user — sets the tone.
     * In production, this is an HTML email with the TradeForge brand design.
     *
     * PRODUCTION EMAIL (HTML template idea):
     *   Subject: "Welcome to TradeForge 🚀 — Verify your email to start trading"
     *   Body: Branded header, hero text, large OTP code, expiry notice, footer disclaimer.
     *
     * In dev: we print the same structure to console so developers see exactly
     * what content would appear in the real email.
     */
    @Override
    public void sendRegistrationOtp(String toEmail, String fullName, String otp) {
        log.info("");
        log.info("┌─────────────────────────────────────────────────────────────────────┐");
        log.info("│  📧  TradeForge — Email Verification (DEV MODE)                     │");
        log.info("├─────────────────────────────────────────────────────────────────────┤");
        log.info("│                                                                     │");
        log.info("│  To:      {}│", padRight(toEmail, 68));
        log.info("│  Name:    {}│", padRight(fullName, 68));
        log.info("│                                                                     │");
        log.info("│  ── Email Content (would be sent as HTML in production) ──          │");
        log.info("│                                                                     │");
        log.info("│  Subject: Welcome to TradeForge 🚀 — Verify your email             │");
        log.info("│                                                                     │");
        log.info("│  Hi {},                                        │", padRight(fullName, 52));
        log.info("│                                                                     │");
        log.info("│  You're one step away from joining TradeForge — India's             │");
        log.info("│  sharpest trading terminal. Enter the code below to verify          │");
        log.info("│  your email and unlock your account.                                │");
        log.info("│                                                                     │");
        log.info("│  ┌───────────────────────────────────────────┐                     │");
        log.info("│  │                                           │                     │");
        log.info("│  │   Your verification code:                 │                     │");
        log.info("│  │                                           │                     │");
        log.info("│  │          ★  {}  ★                   │                     │", otp);
        log.info("│  │                                           │                     │");
        log.info("│  │   Valid for 10 minutes only               │                     │");
        log.info("│  │   Do not share this code with anyone.     │                     │");
        log.info("│  │                                           │                     │");
        log.info("│  └───────────────────────────────────────────┘                     │");
        log.info("│                                                                     │");
        log.info("│  Not you? Ignore this email — no action needed.                    │");
        log.info("│  The TradeForge Team                                                │");
        log.info("│                                                                     │");
        log.info("└─────────────────────────────────────────────────────────────────────┘");
        log.info("");
    }

    /**
     * Pads a string to the specified length for aligned log output.
     * WHY? Keeps the ASCII box borders straight regardless of email/name length.
     *
     * @param s      string to pad
     * @param length target length
     * @return padded or truncated string
     */
    private String padRight(String s, int length) {
        if (s == null) s = "";
        if (s.length() >= length) return s.substring(0, length);
        return s + " ".repeat(length - s.length());
    }
}
