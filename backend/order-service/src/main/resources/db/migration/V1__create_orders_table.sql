-- WHY a separate schema?
-- Each microservice owns its own schema — the "database per service" pattern.
-- Even though we share one PostgreSQL instance (for simplicity in dev),
-- separate schemas prevent accidental JOINs between services and make
-- future migration to separate databases trivial.
CREATE SCHEMA IF NOT EXISTS orders;

-- WHY UUID primary key?
-- UUID avoids sequential IDs that expose order count/velocity to users.
-- Also safe for distributed generation — no DB sequence coordination needed.
-- gen_random_uuid() is PostgreSQL's built-in UUID v4 generator.
CREATE TABLE IF NOT EXISTS orders.orders (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WHY user_id without FK?
    -- user lives in the auth schema (separate service/schema).
    -- Microservices don't share DB tables — no FK across schema boundaries.
    -- user_id is just a reference value, validated via JWT, not via DB constraint.
    user_id          UUID        NOT NULL,

    symbol           VARCHAR(20) NOT NULL,

    -- order_type: MARKET or LIMIT
    -- WHY VARCHAR not ENUM? Easier to add new types (SL, SL-M, GTT) without ALTER TABLE.
    order_type       VARCHAR(10) NOT NULL,

    -- transaction_type: BUY or SELL
    transaction_type VARCHAR(10) NOT NULL,

    quantity         INTEGER     NOT NULL CHECK (quantity > 0),

    -- price is nullable — MARKET orders have no specified price
    price            NUMERIC(12, 2),

    -- status: PENDING → COMPLETE or CANCELLED
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    filled_qty       INTEGER     NOT NULL DEFAULT 0,
    avg_price        NUMERIC(12, 2),

    placed_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- WHY an index on user_id?
-- Every query filters by user_id (users only see their own orders).
-- Without an index, PostgreSQL does a full table scan for every request.
-- With this index, lookup is O(log n) — fast even with millions of orders.
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders.orders(user_id);

-- WHY an index on (user_id, placed_at)?
-- Orders page shows most recent orders first (ORDER BY placed_at DESC).
-- Composite index covers both the WHERE user_id = ? and ORDER BY placed_at.
CREATE INDEX IF NOT EXISTS idx_orders_user_placed ON orders.orders(user_id, placed_at DESC);
