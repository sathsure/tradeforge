-- WHY V2 migration?
-- The holdings table was created in an earlier run with column avg_buy_price.
-- The Holding.java entity uses @Column(name = "avg_price") — so we rename to match.
-- Flyway applies this once; Hibernate validate will then pass.
ALTER TABLE portfolio.holdings
    RENAME COLUMN avg_buy_price TO avg_price;
