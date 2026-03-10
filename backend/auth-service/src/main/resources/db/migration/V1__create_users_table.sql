-- ===========================================================================
-- V1__create_users_table.sql
-- Flyway Migration: Version 1 — Initial Schema Setup
--
-- WHY Flyway migrations?
-- Database schema is code. Like code, it must be:
-- - Versioned (V1, V2, V3 — applied in order)
-- - Reproducible (same migration = same result every time)
-- - Reversible (V1__undo can revert V1 changes)
-- - Tracked (flyway_schema_history table records what was applied)
--
-- HOW Flyway works:
-- 1. On startup, auth-service reads all V*.sql files from classpath:db/migration
-- 2. Checks flyway_schema_history table for what's already been applied
-- 3. Applies missing migrations in VERSION ORDER (V1 before V2 before V3)
-- 4. If V1 was already applied on a previous run, it's SKIPPED (idempotent)
-- 5. If V1 file is MODIFIED after being applied, Flyway FAILS with checksum error
--    (protects against accidentally changing applied migrations)
--
-- RULE: Never modify an applied migration. Add a NEW migration (V2__...) instead.
-- ===========================================================================

-- Create the auth schema
-- WHY separate schema? Namespacing. If multiple microservices share one PostgreSQL instance,
-- schema isolation prevents table name conflicts.
-- auth.users, orders.orders, portfolio.holdings — clear ownership.
-- application.yml: flyway.schemas: auth → Flyway manages only this schema.
CREATE SCHEMA IF NOT EXISTS auth;

-- Create users table
-- All columns match the User.java JPA entity exactly.
-- WHY must they match? hibernate.ddl-auto: validate checks this at startup.
-- If column is missing or has wrong type, Hibernate throws: SchemaManagementException.
-- The application WON'T START — fail fast, don't let misconfiguration into production.
CREATE TABLE IF NOT EXISTS auth.users (

    -- Primary Key: UUID (not auto-increment integer)
    -- WHY UUID?
    -- Auto-increment IDs are predictable: /users/1, /users/2, /users/3.
    -- Attackers can enumerate all user IDs (IDOR vulnerability).
    -- UUIDs are 128-bit random values: /users/550e8400-e29b-41d4-a716-446655440000
    -- Statistically impossible to guess. Safe to expose in URLs and APIs.
    -- gen_random_uuid() uses PostgreSQL's built-in UUID generation (pgcrypto).
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Email: the username for authentication
    -- UNIQUE: prevents duplicate registrations with same email
    -- NOT NULL: email is required — registration validates this
    email VARCHAR(255) UNIQUE NOT NULL,

    -- Password: stored as BCrypt hash
    -- WHY VARCHAR(255)? BCrypt hash is always exactly 60 chars.
    -- But 255 gives room if we ever switch hashing algorithms.
    -- CONSTRAINT: application ensures this is NEVER plain text.
    password VARCHAR(255) NOT NULL,

    -- Full name: display name shown in the UI
    full_name VARCHAR(100),

    -- Phone: optional contact number
    -- VARCHAR(20) for international numbers with country code: +91 9876543210
    phone VARCHAR(20),

    -- Role: TRADER or ADMIN
    -- VARCHAR(20): stores the enum name as string ("TRADER" not "0")
    -- WHY string not integer? If enum order changes, integer values shift → data corruption.
    -- String is stable: "TRADER" means TRADER regardless of enum position.
    role VARCHAR(20) NOT NULL DEFAULT 'TRADER',

    -- Account status: can deactivate without deleting (soft delete)
    -- WHY is_active instead of deleting? Audit trail, data recovery, legal compliance.
    -- A deactivated user can be reactivated. A deleted user is gone forever.
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit timestamps: who did what when
    -- updatable = false on created_at: once set, it never changes
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()

);

-- Performance index on email column
-- WHY? Every authentication call does: SELECT * FROM auth.users WHERE email = ?
-- Without index: PostgreSQL does a FULL TABLE SCAN (O(n) rows).
-- With index: PostgreSQL does an INDEX SCAN (O(log n)).
-- At 1M users: full scan = 1,000,000 row reads. Index = ~20 reads.
-- Login is the hottest query path — it MUST be indexed.
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth.users(email);

-- Index on role for admin queries
-- WHY? Queries like "find all ADMIN users" or "count TRADERs" benefit from this.
-- Lower priority than email index (admin queries are rare vs login queries).
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth.users(role);

-- Create a function to auto-update updated_at on every row update
-- WHY a function + trigger instead of application-level?
-- Application might forget to set updated_at. DB trigger ALWAYS fires — no gaps.
-- Matches User.java's @PreUpdate: onUpdate() { updatedAt = LocalDateTime.now(); }
-- Both mechanisms work — DB trigger is the safety net.
CREATE OR REPLACE FUNCTION auth.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION auth.update_updated_at();
