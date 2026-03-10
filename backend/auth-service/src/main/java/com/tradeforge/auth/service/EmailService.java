package com.tradeforge.auth.service;

/**
 * WHY an interface for EmailService?
 * The interface defines the contract: what operations email sending provides.
 * The implementation (MockEmailService in dev, SmtpEmailService in prod) is swappable.
 *
 * Pattern: Program to interfaces, not implementations (Dependency Inversion Principle).
 * All services that need to send email depend on EmailService (this interface).
 * In tests: inject a mock. In prod: inject SmtpEmailService.
 * Neither tests nor callers need to know HOW email is sent — just THAT it is sent.
 *
 * WHY two methods (sendOtp vs sendEnrollOtp)?
 * Different email content and subject lines:
 * - sendOtp: "Your TradeForge login verification code"
 * - sendEnrollOtp: "Confirm your 2FA enrollment for TradeForge"
 * Separate methods allow different templates without conditional logic in callers.
 */
public interface EmailService {

    /**
     * Sends a login OTP to the user's email address.
     * Called during the 2FA login challenge when method=EMAIL.
     *
     * WHY include fullName? Personalized emails have higher open rates and
     * help users confirm the email is intended for them (phishing detection).
     *
     * @param toEmail  the user's registered email address
     * @param fullName the user's full name for personalization
     * @param otp      the 6-digit OTP to include in the email body
     */
    void sendOtp(String toEmail, String fullName, String otp);

    /**
     * Sends an enrollment confirmation OTP for 2FA setup.
     * Called when a user enables EMAIL 2FA in settings.
     * Verifying email ownership before enabling 2FA prevents an attacker
     * from locking a victim out by enabling 2FA on their account.
     *
     * @param toEmail  the user's email address
     * @param fullName the user's full name
     * @param otp      the 6-digit enrollment confirmation OTP
     */
    void sendEnrollOtp(String toEmail, String fullName, String otp);

    /**
     * Sends an email verification OTP immediately after registration.
     * Called by AuthService.register() before issuing real tokens.
     * User cannot log in until this OTP is verified (or phone OTP if provided).
     *
     * WHY separate from sendOtp?
     * Different email content: welcoming the new user, not a login alert.
     * "Welcome to TradeForge! Confirm your email to start trading."
     * vs "Someone is logging in — verify with this code."
     *
     * @param toEmail  the new user's email address
     * @param fullName the new user's full name
     * @param otp      the 6-digit registration verification OTP
     */
    void sendRegistrationOtp(String toEmail, String fullName, String otp);
}
