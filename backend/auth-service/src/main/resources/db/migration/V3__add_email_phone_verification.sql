-- WHY this migration?
-- Sprint 5: registration now requires email (or phone) verification before account is active.
-- Adds email_verified and phone_verified columns to auth.users.
--
-- WHY DEFAULT FALSE?
-- New registrations start unverified. Backend sends OTP to email/phone.
-- User must confirm before they can log in.
--
-- WHY UPDATE existing users to TRUE?
-- Users who registered before this feature exist without any verification step.
-- Locking them out after a migration would be a breaking change.
-- All pre-existing accounts are treated as already verified.

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Set all existing users as verified — they registered before verification was required
UPDATE auth.users SET email_verified = TRUE;
