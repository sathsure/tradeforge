package com.tradeforge.auth.service;

/**
 * WHY an interface for SmsService?
 * Same principle as EmailService: program to interfaces.
 * MockSmsService logs to console in dev.
 * In production: inject TwilioSmsService (or AWS SNS) without changing callers.
 *
 * WHY separate interface from EmailService?
 * SMS and email have fundamentally different APIs:
 * - Email: SMTP / JavaMailSender
 * - SMS: Twilio REST API / AWS SNS
 * Separate interfaces keep each implementation focused.
 * You can swap SMS provider independently of email provider.
 *
 * WHY only sendOtp (no sendEnrollOtp)?
 * SMS enrollment uses the same message format: "Your TradeForge code: 123456".
 * Phone verification at enrollment and login are identical from the user's perspective.
 * One method handles both cases — method name is "sendOtp" for simplicity.
 *
 * COST NOTE: SMS is charged per message (Twilio: ~$0.0075 per SMS).
 * Consider rate limiting enrollments to prevent abuse of the SMS budget.
 */
public interface SmsService {

    /**
     * Sends a 6-digit OTP via SMS to the specified phone number.
     * Used for both login 2FA and enrollment verification when method=SMS.
     *
     * WHY phone number as String?
     * Phone numbers have country codes, leading zeros, and special characters.
     * String avoids losing leading zeros (long/int truncates them).
     * Use E.164 format: +919876543210 (recommended for Twilio compatibility).
     *
     * @param toPhone phone number in E.164 format (e.g. "+919876543210")
     * @param otp     the 6-digit OTP to send
     */
    void sendOtp(String toPhone, String otp);
}
