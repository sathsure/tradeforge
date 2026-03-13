package com.tradeforge.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * WHY BrevoEmailService instead of ResendEmailService?
 * Resend free tier restricts sending to only the account owner's verified email.
 * Any other recipient (e.g. user@yahoo.com) gets a 403 — unusable for a real app.
 *
 * Brevo (formerly Sendinblue) free tier:
 * - 300 emails/day free
 * - Only requires verifying a SENDER email address (not a whole domain)
 * - Can send to ANY recipient once the sender email is verified
 * - HTTP API on port 443 — never blocked by Render
 *
 * Setup:
 * 1. brevo.com → Sign up free
 * 2. Settings → Senders & IP → Add sender email → Verify it (click link in email)
 * 3. Settings → API Keys → Create key → Copy it
 * 4. Render dashboard → tradeforge-auth → Environment → BREVO_API_KEY = <key>
 *
 * WHY @Primary over ResendEmailService?
 * Both implement EmailService. @Primary on Brevo means Spring injects this bean
 * when BREVO_API_KEY is set. ResendEmailService also has @Primary but @Conditional
 * on its own key — whichever key is present wins. If both are set, Brevo wins
 * because it's defined later and Spring resolves @Primary conflicts by last-defined.
 *
 * WHY @ConditionalOnProperty(name = "brevo.api-key")?
 * Same pattern as Resend: only registers this bean when BREVO_API_KEY env var is set.
 * Local dev without the env var falls back to MockEmailService (logs OTP to console).
 */
@Service
@Primary
@ConditionalOnProperty(name = "brevo.api-key")
public class BrevoEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(BrevoEmailService.class);

    // WHY this sender format? Brevo requires sender as {name, email} object.
    // The email must match a verified sender in your Brevo account.
    // Verify it at: brevo.com → Settings → Senders & IP → Add a sender
    private static final String SENDER_NAME  = "TradeForge";
    private static final String SENDER_EMAIL = "satheesh14294@gmail.com";
    private static final String BREVO_URL    = "https://api.brevo.com/v3/smtp/email";

    private final RestClient restClient;

    // WHY "api-key" header (not "Authorization: Bearer")?
    // Brevo uses a custom header name "api-key" for authentication.
    // Resend uses standard "Authorization: Bearer". Different API conventions.
    public BrevoEmailService(@Value("${brevo.api-key}") String apiKey) {
        this.restClient = RestClient.builder()
                .defaultHeader("api-key", apiKey)
                .build();
    }

    // ── EmailService Interface Implementation ────────────────────────────────

    @Override
    public void sendRegistrationOtp(String toEmail, String fullName, String otp) {
        if (!send(toEmail, fullName,
                "Welcome to TradeForge \uD83D\uDE80 — Verify your email",
                buildOtpHtml(fullName, otp, "email verification", 30))) {
            log.warn("FALLBACK OTP for {} (registration) : {}", toEmail, otp);
        }
    }

    @Override
    public void sendOtp(String toEmail, String fullName, String otp) {
        if (!send(toEmail, fullName,
                "TradeForge Login Verification Code",
                buildOtpHtml(fullName, otp, "login verification", 10))) {
            log.warn("FALLBACK OTP for {} (2FA login) : {}", toEmail, otp);
        }
    }

    @Override
    public void sendEnrollOtp(String toEmail, String fullName, String otp) {
        if (!send(toEmail, fullName,
                "Confirm your 2FA enrollment — TradeForge",
                buildOtpHtml(fullName, otp, "2FA enrollment", 15))) {
            log.warn("FALLBACK OTP for {} (2FA enroll) : {}", toEmail, otp);
        }
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Posts an email via Brevo's transactional email API.
     *
     * WHY Map.of for the body? Brevo expects JSON:
     * {
     *   "sender":      { "name": "TradeForge", "email": "satheesh14294@gmail.com" },
     *   "to":          [ { "email": "user@example.com", "name": "User Name" } ],
     *   "subject":     "...",
     *   "htmlContent": "..."
     * }
     * RestClient serializes Map<String, Object> to JSON automatically.
     * No DTO class needed for a one-off request body.
     *
     * WHY boolean return? Lets each caller log the OTP as a fallback when delivery
     * fails, without throwing an exception that would crash the auth flow.
     */
    private boolean send(String toEmail, String toName, String subject, String html) {
        Map<String, Object> body = Map.of(
                "sender",      Map.of("name", SENDER_NAME, "email", SENDER_EMAIL),
                "to",          List.of(Map.of("email", toEmail, "name", toName)),
                "subject",     subject,
                "htmlContent", html
        );
        try {
            restClient.post()
                    .uri(BREVO_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            log.info("Email sent via Brevo to: {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Brevo API call failed for {} — email not delivered: {}", toEmail, e.getMessage());
            return false;
        }
    }

    /**
     * Builds a styled HTML email body for any OTP scenario.
     * WHY inline CSS? Email clients strip <style> tags — inline is the only reliable way.
     */
    private String buildOtpHtml(String fullName, String otp, String purpose, int validMinutes) {
        return """
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;
                            background:#0d1117;color:#e6edf3;padding:40px;border-radius:10px;">
                  <h2 style="color:#00bcd4;margin:0 0 4px;">TradeForge</h2>
                  <p style="color:#8b949e;margin:0 0 32px;font-size:13px;">
                    Professional Trading Platform
                  </p>
                  <p style="font-size:15px;margin:0 0 12px;">Hi <strong>%s</strong>,</p>
                  <p style="font-size:15px;color:#8b949e;margin:0 0 28px;">
                    Your <strong style="color:#e6edf3;">%s</strong> code is:
                  </p>
                  <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;
                              padding:28px;text-align:center;margin:0 0 28px;">
                    <span style="font-size:44px;font-weight:bold;letter-spacing:14px;
                                 color:#00bcd4;font-family:monospace;">%s</span>
                    <p style="color:#8b949e;font-size:13px;margin:14px 0 0;">
                      Valid for <strong>%d minutes</strong> only. Do not share this code.
                    </p>
                  </div>
                  <p style="color:#8b949e;font-size:13px;margin:0 0 8px;">
                    If you did not request this, you can safely ignore this email.
                  </p>
                  <p style="color:#8b949e;font-size:13px;margin:0;">— The TradeForge Team</p>
                </div>
                """.formatted(fullName, purpose, otp, validMinutes);
    }
}
