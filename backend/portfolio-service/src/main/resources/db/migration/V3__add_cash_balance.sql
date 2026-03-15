-- WHY a separate cash_balance table?
-- Each user has one cash balance (their available funds for trading).
-- Storing it in a dedicated table allows atomic updates and future audit logs.
-- We don't store it in the holdings table because cash is not a holding —
-- it's a separate account-level concept (deposited funds vs invested capital).
CREATE TABLE IF NOT EXISTS portfolio.cash_balance (
    -- WHY UUID as PK (not a surrogate key)?
    -- One row per user — the user_id IS the primary key.
    -- No need for a separate surrogate UUID id column.
    user_id    UUID           PRIMARY KEY,

    -- WHY NUMERIC(15, 2) not FLOAT?
    -- Financial arithmetic must be exact — FLOAT introduces rounding errors.
    -- NUMERIC(15, 2) = up to ₹999,999,999,999,999.99 — more than enough.
    balance    NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    updated_at TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- WHY no separate index on user_id?
-- It's the PRIMARY KEY — PostgreSQL automatically creates a B-tree index on it.
-- A second index would waste space and slow down writes with no query benefit.
