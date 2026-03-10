-- WHY this migration?
-- Sprint 4: adds Two-Factor Authentication (2FA) support.
-- Three tables: per-user 2FA config, WebAuthn FIDO2 credentials, and trusted device tokens.
-- All FK-referenced to auth.users so data is cleaned up when a user is deleted (ON DELETE CASCADE).

-- user_two_factor_config: stores per-user 2FA method and enabled status
-- WHY separate table instead of columns on users?
-- Open/closed principle: auth.users stays stable. 2FA config can evolve independently.
-- Also avoids NULL columns on users who never configure 2FA.
CREATE TABLE IF NOT EXISTS auth.user_two_factor_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    method        VARCHAR(20) NOT NULL DEFAULT 'NONE',
    is_enabled    BOOLEAN NOT NULL DEFAULT false,
    phone_verified BOOLEAN NOT NULL DEFAULT false,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
-- WHY index on user_id? findByUserId is called on every login for 2FA check.
-- Without index: full table scan on every login request. Index: O(log n) lookup.
CREATE INDEX IF NOT EXISTS idx_2fa_config_user_id ON auth.user_two_factor_config(user_id);

-- webauthn_credentials: FIDO2 public key credentials for biometric login
-- WHY WebAuthn? Phishing-resistant — credential is bound to the origin (tradeforge.com).
-- A fake site can't steal it even if the user clicks a phishing link.
-- Multiple credentials per user: one for laptop, one for phone, etc.
CREATE TABLE IF NOT EXISTS auth.webauthn_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credential_id   VARCHAR(512) NOT NULL UNIQUE,
    public_key_cose TEXT NOT NULL,
    sign_count      BIGINT NOT NULL DEFAULT 0,
    aaguid          VARCHAR(36),
    device_name     VARCHAR(100),
    created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMP WITHOUT TIME ZONE
);
-- WHY index? findByUserId used to build excludeCredentials list during registration.
CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON auth.webauthn_credentials(user_id);

-- trusted_devices: "trust this device 30 days" feature
-- WHY? Reduces 2FA friction: power users don't want OTP every login from their home PC.
-- Device token is a SHA-256 fingerprint stored in an HttpOnly cookie.
-- Expires after 30 days — re-trust required after that.
CREATE TABLE IF NOT EXISTS auth.trusted_devices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_token VARCHAR(64) NOT NULL UNIQUE,
    device_name  VARCHAR(200),
    ip_address   VARCHAR(45),
    expires_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
-- WHY two indexes? findByUserId (settings page list) and findByDeviceToken (login check).
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON auth.trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON auth.trusted_devices(device_token);
