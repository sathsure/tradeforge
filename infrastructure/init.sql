-- WHY this file? PostgreSQL runs this on first startup.
-- Creates separate schemas per microservice — each service owns its data.
-- This is the "Database per Service" microservices pattern.
-- WHY separate schemas? Order Service can't accidentally JOIN with Auth tables.
-- Clear ownership. Independent migrations per service.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS funds;

-- Auth schema tables
CREATE TABLE IF NOT EXISTS auth.users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,  -- BCrypt hashed, never plain text
    full_name   VARCHAR(255),
    phone       VARCHAR(20),
    role        VARCHAR(50) DEFAULT 'TRADER',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- WHY UUID as primary key? 
-- Integers are sequential — attackers can enumerate /api/users/1, /users/2
-- UUIDs are random — no enumeration possible. Security by default.

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token       VARCHAR(512) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
-- WHY store refresh tokens? JWT access tokens expire in 15min.
-- Refresh tokens (stored in DB+Redis) allow silent renewal without re-login.
-- If user logs out, we DELETE the refresh token → their session truly ends.

-- Orders schema
CREATE TABLE IF NOT EXISTS orders.orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    order_type      VARCHAR(20) NOT NULL,  -- MARKET, LIMIT, SL
    transaction_type VARCHAR(10) NOT NULL, -- BUY, SELL
    quantity        INTEGER NOT NULL,
    price           DECIMAL(10,2),         -- NULL for MARKET orders
    trigger_price   DECIMAL(10,2),         -- For SL orders
    status          VARCHAR(20) DEFAULT 'PENDING',
    filled_qty      INTEGER DEFAULT 0,
    avg_price       DECIMAL(10,2),
    placed_at       TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Portfolio schema
CREATE TABLE IF NOT EXISTS portfolio.holdings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    quantity        INTEGER NOT NULL,
    avg_buy_price   DECIMAL(10,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS portfolio.positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    quantity        INTEGER NOT NULL,  -- negative = short position
    avg_price       DECIMAL(10,2) NOT NULL,
    day_date        DATE DEFAULT CURRENT_DATE,
    UNIQUE(user_id, symbol, day_date)
);

-- Funds schema
CREATE TABLE IF NOT EXISTS funds.accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE NOT NULL,
    available_cash  DECIMAL(12,2) DEFAULT 100000.00,  -- Start with 1 lakh virtual money
    used_margin     DECIMAL(12,2) DEFAULT 0.00,
    total_value     DECIMAL(12,2) DEFAULT 100000.00,
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Seed a test user for immediate testing
-- Password is 'Test@1234' BCrypt hashed
INSERT INTO auth.users (id, email, password, full_name, role)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'trader@tradeforge.com',
    '$2b$10$lArEbcpXh8gD5nX2A0dWx./A7g6kHqlnCQS/ncwOAbgGekmSR1jkC',
    'Demo Trader',
    'TRADER'
) ON CONFLICT DO NOTHING;

INSERT INTO funds.accounts (user_id, available_cash)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 100000.00)
ON CONFLICT DO NOTHING;
