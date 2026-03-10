-- WHY a separate portfolio schema?
-- Each microservice owns its own schema — prevents accidental cross-service JOINs.
-- portfolio-service owns all holding data; order-service owns order data.
CREATE SCHEMA IF NOT EXISTS portfolio;

-- WHY holdings table?
-- A holding represents how many shares of a stock a user currently owns,
-- and at what average price they acquired them.
-- This is updated every time a BUY or SELL order completes.
CREATE TABLE IF NOT EXISTS portfolio.holdings (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WHY no FK to users table?
    -- users table is in the auth schema (different service).
    -- Microservices don't share DB tables — no cross-schema FKs.
    user_id       UUID        NOT NULL,

    symbol        VARCHAR(20) NOT NULL,

    -- quantity: number of shares owned (can be 0 after full sell — we delete in that case)
    quantity      INTEGER     NOT NULL CHECK (quantity >= 0),

    -- WHY BigDecimal (NUMERIC) for avg_price?
    -- Financial precision: exact arithmetic, no floating-point rounding errors.
    avg_price     NUMERIC(12, 2) NOT NULL,

    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),

    -- WHY UNIQUE (user_id, symbol)?
    -- Each user can only have one holding per symbol.
    -- When buying more RELIANCE, we update the existing row (quantity + weighted avg),
    -- not insert a new row. UNIQUE enforces this constraint at DB level.
    CONSTRAINT uq_user_symbol UNIQUE (user_id, symbol)
);

-- WHY index on user_id?
-- All queries filter by user_id (users see only their holdings).
-- Index makes these queries O(log n) instead of O(n).
CREATE INDEX IF NOT EXISTS idx_holdings_user_id ON portfolio.holdings(user_id);

-- Seed: Add demo holdings for the test user so the UI isn't empty on first login.
-- The test user UUID must match what's in auth-service's init.sql.
-- WHY seed here? Allows end-to-end testing of portfolio → market data integration
-- without needing to place actual orders first.
-- Note: Replace '00000000-0000-0000-0000-000000000001' with the actual seeded user UUID.
-- This is left as a placeholder — actual seeding happens in application startup or via API.
