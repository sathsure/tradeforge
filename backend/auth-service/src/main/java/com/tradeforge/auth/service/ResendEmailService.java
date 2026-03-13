package com.tradeforge.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * WHY ResendEmailService?
 * Render.com blocks outbound SMTP ports (25, 465, 587) on all plans to prevent spam.
 * JavaMailSender uses SMTP — it can never reach smtp.gmail.com:587 from Render.
 * Resend (resend.com) is an HTTP-based transactional email API that uses port 443 (HTTPS),
 * which is never blocked. No SMTP involved — just a REST POST call.
 *
 * WHY @Primary?
 * When RESEND_API_KEY is set, this bean overrides SmtpEmailService as the active
 * EmailService implementation. Without @Primary, Spring would complain about two beans
 * implementing EmailService with no preferred choice.
 *
 * WHY @ConditionalOnProperty(name = "resend.api-key")?
 * Only registers this bean when resend.api-key is non-empty (i.e. RESEND_API_KEY env var
 * is set on Render). In local dev without the env var, Spring skips this bean and falls
 * back to SmtpEmailService or MockEmailService.
 */
@Service
@ConditionalOnProperty(name = "resend.api-key")
@ConditionalOnMissingBean(EmailService.class)
// WHY no @Primary? BrevoEmailService is @Primary and loads when BREVO_API_KEY is set.
// If both keys are present, Brevo wins. ResendEmailService only activates when
// BREVO_API_KEY is absent — it is the fallback, not the preferred implementation.
public class ResendEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailService.class);

    // WHY "onboarding@resend.dev"?
    // Resend's shared sender domain — works on free tier without verifying a custom domain.
    // Once you add and verify your own domain (e.g. tradeforge.com), change to:
    // "TradeForge <noreply@tradeforge.com>"
    private static final String FROM = "TradeForge <onboarding@resend.dev>";
    private static final String RESEND_URL = "https://api.resend.com/emails";

    private final RestClient restClient;

    // WHY constructor injection with @Value?
    // Reads RESEND_API_KEY from environment, wires it into the Authorization header once
    // at startup. No per-request header construction overhead.
    public ResendEmailService(@Value("${resend.api-key}") String apiKey) {
        this.restClient = RestClient.builder()
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
    }

    // ── EmailService Interface Implementation ────────────────────────────────

    @Override
    public void sendRegistrationOtp(String toEmail, String fullName, String otp) {
        // WHY 30 minutes? Registration OTP TTL matches REGISTER_OTP_TTL in OtpService.
        if (!send(toEmail,
                "Welcome to TradeForge \uD83D\uDE80 — Verify your email",
                buildOtpHtml(fullName, otp, "email verification", 30))) {
            // Email failed (e.g. Resend free-tier restriction). Log OTP so it can be
            // retrieved from Render logs for manual verification during development.
            log.warn("FALLBACK OTP for {} (registration) : {}", toEmail, otp);
        }
    }

    @Override
    public void sendOtp(String toEmail, String fullName, String otp) {
        // WHY 10 minutes? Login 2FA OTP TTL matches OTP_TTL in OtpService.
        if (!send(toEmail,
                "TradeForge Login Verification Code",
                buildOtpHtml(fullName, otp, "login verification", 10))) {
            log.warn("FALLBACK OTP for {} (2FA login) : {}", toEmail, otp);
        }
    }

    @Override
    public void sendEnrollOtp(String toEmail, String fullName, String otp) {
        // WHY 15 minutes? Enrollment OTP TTL matches ENROLL_OTP_TTL in OtpService.
        if (!send(toEmail,
                "Confirm your 2FA enrollment — TradeForge",
                buildOtpHtml(fullName, otp, "2FA enrollment", 15))) {
            log.warn("FALLBACK OTP for {} (2FA enroll) : {}", toEmail, otp);
        }
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Posts an email via Resend's REST API.
     *
     * WHY Map.of? Resend expects JSON: {"from":..., "to":[...], "subject":..., "html":...}
     * RestClient serialises Map<String, Object> to JSON automatically when content type
     * is APPLICATION_JSON. No DTO class needed for a one-off request body.
     *
     * WHY toBodilessEntity()? We only need to know the call succeeded (2xx).
     * The Resend response body contains the email ID which we don't need to store.
     */
    // WHY boolean return? Lets each caller log the OTP as a fallback when delivery fails,
    // without throwing an exception that would crash the registration/2FA flow.
    // true = email delivered, false = Resend API rejected it (caller logs FALLBACK OTP).
    private boolean send(String toEmail, String subject, String html) {
        Map<String, Object> body = Map.of(
                "from", FROM,
                "to", List.of(toEmail),
                "subject", subject,
                "html", html
        );
        try {
            restClient.post()
                    .uri(RESEND_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            log.info("Email sent via Resend to: {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Resend API call failed for {} — email not delivered: {}", toEmail, e.getMessage());
            return false;
        }
    }

    /**
     * Builds a styled HTML email body for any OTP scenario.
     *
     * WHY inline CSS? Email clients (Gmail, Outlook, Yahoo) strip <style> tags.
     * Inline styles are the only reliable way to style HTML emails.
     * Dark theme matching the TradeForge terminal aesthetic.
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
