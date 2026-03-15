-- WHY reset cash_balance?
-- V3 introduced the cash_balance table with a DEFAULT_STARTING_BALANCE of ₹1,00,000.
-- Any deposit made under that code created a row with ₹1,00,000 + deposited amount
-- (e.g. ₹1,000 deposit → ₹1,01,000). This was incorrect — the ₹1L was a hardcoded
-- placeholder, not real money the user deposited.
--
-- V4 fix: reset all balances to ₹0. Users now start with ₹0 and only see what they
-- explicitly deposit via POST /api/portfolio/cash/deposit. Clean slate for everyone.
TRUNCATE TABLE portfolio.cash_balance;
