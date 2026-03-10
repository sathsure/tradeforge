package com.tradeforge.auth.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * WHY @ConditionalOnProperty?
 * This bean is only created when two-fa.mock-email=false in application.yml.
 * In dev: mock-email=true → MockEmailService (@Primary) is used instead.
 * In prod: mock-email=false → this bean becomes the active EmailService.
 * Switching environments requires ONE config change, not code changes.
 *
 * WHY not @Primary here?
 * Only ONE bean should be @Primary. When mock-email=false, this bean is the
 * ONLY EmailService in the context (MockEmailService is excluded by its own
 * @ConditionalOnProperty), so Spring injects it automatically without @Primary.
 *
 * WHY JavaMailSender instead of SimpleMailMessage?
 * SimpleMailMessage only supports plain text.
 * JavaMailSender with MimeMessageHelper supports HTML bodies, inline images,
 * and file attachments — required for our branded HTML email template.
 */
@Service
@ConditionalOnProperty(name = "two-fa.mock-email", havingValue = "false")
public class SmtpEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailService.class);

    private final JavaMailSender mailSender;

    public SmtpEmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Override
    public void sendRegistrationOtp(String toEmail, String fullName, String otp) {
        String subject = "Welcome to TradeForge 🚀 — Verify your email to start trading";
        String html = buildRegistrationEmailHtml(fullName, otp);
        sendHtmlEmail(toEmail, subject, html);
        log.info("Registration OTP email sent to: {}", toEmail);
    }

    @Override
    public void sendOtp(String toEmail, String fullName, String otp) {
        String subject = "TradeForge — Your login verification code";
        String html = buildLoginOtpHtml(fullName, otp);
        sendHtmlEmail(toEmail, subject, html);
        log.info("Login OTP email sent to: {}", toEmail);
    }

    @Override
    public void sendEnrollOtp(String toEmail, String fullName, String otp) {
        String subject = "TradeForge — Confirm your 2FA setup";
        String html = buildEnrollOtpHtml(fullName, otp);
        sendHtmlEmail(toEmail, subject, html);
        log.info("Enroll OTP email sent to: {}", toEmail);
    }

    // ── HTML Email Templates ─────────────────────────────────────────────────

    /**
     * Registration verification email — first touchpoint with a new user.
     * WHY a welcome tone? The user just created an account — they're excited.
     * Capitalise on that excitement: fast, warm, action-oriented copy.
     */
    private String buildRegistrationEmailHtml(String fullName, String otp) {
        String[] digits = otp.split("");
        String otpBoxes = buildOtpDigitBoxes(digits);
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8"/>
              <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
              <title>Verify your TradeForge account</title>
            </head>
            <body style="margin:0;padding:0;background:#090e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

              <!-- Outer wrapper -->
              <table width="100%%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#090e1a;min-height:100vh;padding:48px 16px;">
                <tr><td align="center" valign="top">

                  <!-- Card -->
                  <table width="580" cellpadding="0" cellspacing="0" border="0"
                         style="max-width:580px;width:100%%;">

                    <!-- ══ HERO HEADER ══ -->
                    <tr>
                      <td style="border-radius:16px 16px 0 0;overflow:hidden;
                                 background:linear-gradient(145deg,#0a1628 0%%,#0d2040 50%%,#0a1a35 100%%);
                                 padding:0;position:relative;">
                        <!-- Top accent bar -->
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="height:3px;background:linear-gradient(90deg,#00d4aa,#0ea5e9,#6366f1);
                                       border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                          </tr>
                        </table>
                        <!-- Logo + Brand -->
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:36px 40px 28px;text-align:center;">
                              <!-- Logo badge -->
                              <div style="display:inline-block;background:linear-gradient(135deg,#00d4aa,#0ea5e9);
                                          border-radius:14px;padding:12px 22px;margin-bottom:18px;
                                          box-shadow:0 8px 32px rgba(0,212,170,0.35);">
                                <span style="font-size:26px;font-weight:900;color:#fff;letter-spacing:3px;
                                             font-family:'Courier New',monospace;vertical-align:middle;">TF</span>
                              </div>
                              <br/>
                              <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">TradeForge</span>
                              <br/>
                              <span style="font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:3px;
                                           text-transform:uppercase;margin-top:4px;display:inline-block;">
                                India's Sharpest Trading Terminal
                              </span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- ══ MAIN BODY ══ -->
                    <tr>
                      <td style="background:#0f1923;padding:44px 44px 0;border-left:1px solid #1a2332;border-right:1px solid #1a2332;">

                        <!-- Greeting -->
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td>
                              <p style="margin:0 0 6px;font-size:26px;font-weight:700;color:#f0f6fc;line-height:1.3;">
                                You're almost in! &#x1F680;
                              </p>
                              <p style="margin:0 0 32px;font-size:15px;color:#7d8fa3;line-height:1.7;">
                                Hey <strong style="color:#00d4aa;">%s</strong> — welcome aboard!<br/>
                                Use the verification code below to activate your account and start trading.
                              </p>
                            </td>
                          </tr>
                        </table>

                        <!-- ── OTP CARD ── -->
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="background:linear-gradient(135deg,#0d1f35,#0a1628);
                                        border:1px solid #1e3a5f;border-radius:14px;
                                        padding:36px 24px;text-align:center;
                                        box-shadow:0 4px 24px rgba(0,0,0,0.4);">
                              <p style="margin:0 0 20px;font-size:11px;font-weight:700;color:#4a6a8a;
                                         letter-spacing:3px;text-transform:uppercase;">
                                &#x2022; Your One-Time Verification Code &#x2022;
                              </p>
                              <!-- OTP digit boxes -->
                              <div style="margin-bottom:20px;">%s</div>
                              <!-- Timer pill -->
                              <div style="display:inline-block;background:rgba(0,212,170,0.1);
                                          border:1px solid rgba(0,212,170,0.3);border-radius:20px;
                                          padding:6px 18px;">
                                <span style="font-size:12px;color:#00d4aa;font-weight:600;">
                                  &#x23F1; Expires in 30 minutes
                                </span>
                              </div>
                            </td>
                          </tr>
                        </table>

                        <!-- ── SECURITY NOTICE ── -->
                        <table width="100%%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                          <tr>
                            <td style="background:rgba(248,81,73,0.06);border:1px solid rgba(248,81,73,0.2);
                                        border-radius:10px;padding:16px 20px;">
                              <table cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="vertical-align:top;padding-right:12px;font-size:18px;line-height:1;">&#x1F512;</td>
                                  <td>
                                    <p style="margin:0;font-size:13px;color:#7d8fa3;line-height:1.6;">
                                      <strong style="color:#f0f6fc;">Never share this code</strong> — not even with TradeForge support.<br/>
                                      We will <strong style="color:#f85149;">never</strong> call or message you asking for your OTP.
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <!-- ── FEATURE HIGHLIGHTS ── -->
                        <p style="margin:36px 0 14px;font-size:11px;font-weight:700;color:#4a6a8a;
                                   letter-spacing:3px;text-transform:uppercase;">
                          What awaits you inside
                        </p>
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="48%%" style="padding-right:8px;padding-bottom:10px;vertical-align:top;">
                              <table width="100%%" cellpadding="0" cellspacing="0"
                                     style="background:#0d1a2a;border:1px solid #1a2e44;border-radius:10px;overflow:hidden;">
                                <tr>
                                  <td style="padding:18px;">
                                    <div style="font-size:24px;margin-bottom:8px;">&#x1F4C8;</div>
                                    <div style="font-size:14px;font-weight:600;color:#f0f6fc;margin-bottom:4px;">Live Markets</div>
                                    <div style="font-size:12px;color:#4a6a8a;line-height:1.4;">Real-time prices across NSE &amp; BSE</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td width="4%%"></td>
                            <td width="48%%" style="padding-left:0;padding-bottom:10px;vertical-align:top;">
                              <table width="100%%" cellpadding="0" cellspacing="0"
                                     style="background:#0d1a2a;border:1px solid #1a2e44;border-radius:10px;overflow:hidden;">
                                <tr>
                                  <td style="padding:18px;">
                                    <div style="font-size:24px;margin-bottom:8px;">&#x26A1;</div>
                                    <div style="font-size:14px;font-weight:600;color:#f0f6fc;margin-bottom:4px;">Lightning Orders</div>
                                    <div style="font-size:12px;color:#4a6a8a;line-height:1.4;">BUY &amp; SELL in milliseconds</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td width="48%%" style="padding-right:8px;vertical-align:top;">
                              <table width="100%%" cellpadding="0" cellspacing="0"
                                     style="background:#0d1a2a;border:1px solid #1a2e44;border-radius:10px;overflow:hidden;">
                                <tr>
                                  <td style="padding:18px;">
                                    <div style="font-size:24px;margin-bottom:8px;">&#x1F4BC;</div>
                                    <div style="font-size:14px;font-weight:600;color:#f0f6fc;margin-bottom:4px;">Portfolio Tracker</div>
                                    <div style="font-size:12px;color:#4a6a8a;line-height:1.4;">Live P&amp;L, XIRR &amp; holdings</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td width="4%%"></td>
                            <td width="48%%" style="padding-left:0;vertical-align:top;">
                              <table width="100%%" cellpadding="0" cellspacing="0"
                                     style="background:#0d1a2a;border:1px solid #1a2e44;border-radius:10px;overflow:hidden;">
                                <tr>
                                  <td style="padding:18px;">
                                    <div style="font-size:24px;margin-bottom:8px;">&#x1F514;</div>
                                    <div style="font-size:14px;font-weight:600;color:#f0f6fc;margin-bottom:4px;">Smart Alerts</div>
                                    <div style="font-size:12px;color:#4a6a8a;line-height:1.4;">Price alerts so you never miss a move</div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <!-- Spacer -->
                        <div style="height:36px;">&nbsp;</div>
                      </td>
                    </tr>

                    <!-- ══ FOOTER ══ -->
                    <tr>
                      <td style="background:#0a1220;border:1px solid #1a2332;border-top:1px solid #1a2e44;
                                  border-radius:0 0 16px 16px;padding:28px 44px;">
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <!-- Divider line -->
                            <td colspan="3" style="padding-bottom:20px;">
                              <div style="height:1px;background:linear-gradient(90deg,transparent,#1a2e44,transparent);"></div>
                            </td>
                          </tr>
                          <tr>
                            <td style="vertical-align:top;">
                              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#2a4a6a;letter-spacing:2px;text-transform:uppercase;">
                                TradeForge
                              </p>
                              <p style="margin:0;font-size:11px;color:#2a4060;line-height:1.6;">
                                You received this because someone registered<br/>
                                with this email. Not you? Simply ignore it.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-top:18px;">
                              <p style="margin:0;font-size:11px;color:#1e3050;">
                                &copy; 2026 TradeForge &nbsp;&middot;&nbsp; All rights reserved
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """.formatted(fullName, otpBoxes);
    }

    /**
     * 2FA login OTP — security-focused tone since this is a login event.
     * Shows location/time context to help users detect suspicious logins.
     */
    private String buildLoginOtpHtml(String fullName, String otp) {
        String[] digits = otp.split("");
        String otpBoxes = buildOtpDigitBoxes(digits);
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8"/>
              <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
              <title>TradeForge Login Verification</title>
            </head>
            <body style="margin:0;padding:0;background:#090e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
              <table width="100%%" cellpadding="0" cellspacing="0" border="0" style="background:#090e1a;padding:48px 16px;">
                <tr><td align="center">
                  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%%;">

                    <!-- Header -->
                    <tr>
                      <td style="border-radius:16px 16px 0 0;background:#0f1923;">
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="height:3px;background:linear-gradient(90deg,#0ea5e9,#6366f1,#00d4aa);
                                       border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                          </tr>
                        </table>
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:28px 40px;text-align:center;">
                              <div style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);
                                          border-radius:12px;padding:10px 20px;margin-bottom:14px;">
                                <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;
                                             font-family:'Courier New',monospace;">TF</span>
                              </div>
                              <br/>
                              <span style="font-size:20px;font-weight:700;color:#f0f6fc;">TradeForge</span>
                              <br/>
                              <span style="font-size:10px;color:#4a6a8a;letter-spacing:3px;text-transform:uppercase;
                                           margin-top:6px;display:inline-block;">&#x1F512; Login Verification</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                      <td style="background:#0f1923;padding:36px 44px;border-left:1px solid #1a2332;border-right:1px solid #1a2332;">
                        <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#f0f6fc;">
                          New login detected &#x1F6E1;&#xFE0F;
                        </p>
                        <p style="margin:0 0 28px;font-size:14px;color:#7d8fa3;line-height:1.7;">
                          Hi <strong style="color:#0ea5e9;">%s</strong>,<br/>
                          We received a login request for your account. Use this code to verify it's you.
                        </p>

                        <!-- OTP Box -->
                        <table width="100%%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="background:linear-gradient(135deg,#0d1f35,#0a1628);
                                        border:1px solid #1e3a5f;border-radius:14px;
                                        padding:32px 20px;text-align:center;">
                              <p style="margin:0 0 18px;font-size:11px;font-weight:700;color:#4a6a8a;
                                         letter-spacing:3px;text-transform:uppercase;">&#x2022; Login Code &#x2022;</p>
                              <div>%s</div>
                              <div style="margin-top:18px;display:inline-block;background:rgba(14,165,233,0.1);
                                          border:1px solid rgba(14,165,233,0.3);border-radius:20px;padding:6px 18px;">
                                <span style="font-size:12px;color:#0ea5e9;font-weight:600;">&#x23F1; Expires in 10 minutes</span>
                              </div>
                            </td>
                          </tr>
                        </table>

                        <!-- Warning -->
                        <table width="100%%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
                          <tr>
                            <td style="background:rgba(248,81,73,0.07);border:1px solid rgba(248,81,73,0.25);
                                        border-radius:10px;padding:16px 20px;">
                              <table cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="vertical-align:top;padding-right:10px;font-size:16px;line-height:1;">&#x26A0;&#xFE0F;</td>
                                  <td>
                                    <p style="margin:0;font-size:13px;color:#7d8fa3;line-height:1.6;">
                                      <strong style="color:#f85149;">Wasn't you?</strong> Change your password immediately
                                      and contact our support team. Your account security is our priority.
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        <div style="height:32px;">&nbsp;</div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background:#0a1220;border:1px solid #1a2332;border-top:1px solid #1a2e44;
                                  border-radius:0 0 16px 16px;padding:24px 44px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#2a4a6a;letter-spacing:2px;text-transform:uppercase;">
                          TradeForge Security
                        </p>
                        <p style="margin:0;font-size:11px;color:#2a4060;line-height:1.6;">
                          Never share this code with anyone. &copy; 2026 TradeForge.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td></tr>
              </table>
            </body></html>
            """.formatted(fullName, otpBoxes);
    }

    /**
     * 2FA enrollment confirmation email.
     */
    private String buildEnrollOtpHtml(String fullName, String otp) {
        String[] digits = otp.split("");
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"/></head>
            <body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
              <table width="100%%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 0;">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0"
                         style="background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;max-width:560px;width:100%%;">
                    <tr>
                      <td style="background:linear-gradient(135deg,#00d4aa,#0ea5e9);padding:28px 40px;text-align:center;">
                        <span style="font-size:26px;font-weight:800;color:#fff;font-family:'Courier New',monospace;">
                          TF TradeForge
                        </span>
                        <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.85);letter-spacing:1px;">
                          2FA SETUP
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px;">
                        <h2 style="margin:0 0 8px;font-size:20px;color:#e6edf3;">Confirm your 2FA setup 🔐</h2>
                        <p style="margin:0 0 28px;font-size:14px;color:#8b949e;line-height:1.6;">
                          Hi <strong style="color:#e6edf3;">%s</strong>,<br/>
                          You're enabling two-factor authentication on your account. Enter this code to confirm.
                        </p>
                        <div style="background:#0d1117;border:1px solid #30363d;border-radius:10px;
                                    padding:28px 20px;text-align:center;margin-bottom:24px;">
                          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#8b949e;letter-spacing:2px;">
                            CONFIRMATION CODE
                          </p>
                          <div>%s</div>
                          <p style="margin:14px 0 0;font-size:12px;color:#8b949e;">Expires in 15 minutes</p>
                        </div>
                        <div style="background:rgba(0,212,170,0.08);border-left:3px solid #00d4aa;
                                    border-radius:0 8px 8px 0;padding:14px 18px;">
                          <p style="margin:0;font-size:13px;color:#8b949e;">
                            ✅ Once confirmed, your account will be protected with 2FA on every login.
                          </p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 40px 28px;border-top:1px solid #21262d;">
                        <p style="margin:0;font-size:11px;color:#484f58;">
                          © 2026 TradeForge. If you didn't request this, contact support immediately.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """.formatted(fullName, buildOtpDigitBoxes(digits));
    }

    /**
     * Renders each OTP digit as a styled box in the email.
     * WHY individual boxes? Visual pattern users expect for OTP codes.
     * Inline styles required — email clients strip <style> tags.
     */
    private String buildOtpDigitBoxes(String[] digits) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < digits.length; i++) {
            // Add a gap between digit 3 and 4 for readability (like "123 456")
            String marginLeft = (i == 3) ? "18px" : "5px";
            sb.append("""
                <span style="display:inline-block;width:48px;height:60px;line-height:60px;
                             background:linear-gradient(180deg,#0d2040,#081525);
                             border:2px solid #00d4aa;border-radius:10px;
                             font-size:30px;font-weight:900;color:#00d4aa;text-align:center;
                             font-family:'Courier New',monospace;
                             margin:0 5px 0 %s;
                             box-shadow:0 0 16px rgba(0,212,170,0.25),inset 0 1px 0 rgba(255,255,255,0.05);
                             letter-spacing:0;">%s</span>
                """.formatted(marginLeft, digits[i]));
        }
        return sb.toString();
    }

    // ── SMTP Send Helper ─────────────────────────────────────────────────────

    /**
     * WHY MimeMessage instead of SimpleMailMessage?
     * HTML bodies require MimeMessage. SimpleMailMessage only supports plain text.
     * MimeMessageHelper sets the content type to text/html — email clients render HTML.
     */
    private void sendHtmlEmail(String to, String subject, String html) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true); // true = HTML
            helper.setFrom("satheesh14294@gmail.com", "TradeForge");
            mailSender.send(message);
        } catch (MessagingException | java.io.UnsupportedEncodingException e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage());
            throw new RuntimeException("Failed to send email: " + e.getMessage());
        }
    }
}
