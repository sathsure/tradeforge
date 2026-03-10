package com.tradeforge.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

/**
 * WHY @Service?
 * Spring-managed singleton. One instance for the entire app lifetime.
 *
 * WHY @Primary?
 * Both MockSmsService (this) and future TwilioSmsService will implement SmsService.
 * @Primary designates this as the default in dev — no SMTP/Twilio credentials needed.
 * For production: remove @Primary and set up Twilio credentials in environment variables.
 *
 * WHY log OTPs to console?
 * Developers need to see OTPs during local testing without a real phone.
 * The console is visible during dev; in prod, never log OTPs (security risk).
 *
 * PRODUCTION MIGRATION:
 * 1. Add Twilio dependency to pom.xml: com.twilio.sdk:twilio
 * 2. Create TwilioSmsService implements SmsService with @Primary
 * 3. Remove @Primary from this class (or remove this class entirely)
 * 4. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in env vars
 */
@Service
@Primary
public class MockSmsService implements SmsService {

    private static final Logger log = LoggerFactory.getLogger(MockSmsService.class);

    /**
     * Logs the OTP to console in a visually distinct format.
     * WHY the box art? Makes OTPs obvious when scanning dev logs.
     * Without formatting, a 6-digit number could be missed in verbose Spring logs.
     *
     * WHY log.info? Default Spring Boot logging shows INFO+ level.
     * DEBUG would be hidden by default. Since this is dev-mode only,
     * log.info ensures the OTP is always visible.
     *
     * @param toPhone the phone number (logged for traceability in dev)
     * @param otp     the 6-digit OTP (NEVER log in production)
     */
    @Override
    public void sendOtp(String toPhone, String otp) {
        log.info("╔══════════════════════════════════════════╗");
        log.info("║   TradeForge 2FA SMS OTP (DEV MODE)      ║");
        log.info("║   To:    {}                  ║", padRight(toPhone, 20));
        log.info("║   OTP:   {}                              ║", otp);
        log.info("║   Valid for: 10 minutes                  ║");
        log.info("╚══════════════════════════════════════════╝");
    }

    /**
     * Pads a string to the specified length for aligned log output.
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
