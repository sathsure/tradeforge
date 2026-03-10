-- WHY V2 migration?
-- Local dev: holdings table was created with column avg_buy_price (old name).
-- The Holding.java entity uses @Column(name = "avg_price") — so we rename to match.
-- WHY conditional DO block?
-- Fresh cloud DB (Neon): V1 already creates the column as avg_price — nothing to rename.
-- Existing local DB: column is avg_buy_price — needs renaming.
-- The DO block checks before renaming so this migration is safe on both environments.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portfolio'
          AND table_name   = 'holdings'
          AND column_name  = 'avg_buy_price'
    ) THEN
        ALTER TABLE portfolio.holdings
            RENAME COLUMN avg_buy_price TO avg_price;
    END IF;
END $$;
