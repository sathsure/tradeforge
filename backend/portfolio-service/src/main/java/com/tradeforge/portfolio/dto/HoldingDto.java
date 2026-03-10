package com.tradeforge.portfolio.dto;

import java.math.BigDecimal;

/**
 * WHY HoldingDto separate from Holding entity?
 * The entity only knows what's in the DB: symbol, quantity, avgPrice.
 * The DTO enriches this with LIVE market data (currentPrice, pnl, dayChange).
 * These live values come from market-service — not stored in the portfolio DB.
 *
 * This separation means:
 * - Portfolio DB stores cost basis (what you paid)
 * - PortfolioService joins DB data + live prices at query time
 * - Angular gets a complete picture without making separate API calls
 *
 * WHY a record?
 * DTOs are immutable — records enforce this at the language level.
 */
public record HoldingDto(
        String symbol,
        String name,             // Company name — from market data lookup
        Integer quantity,
        BigDecimal averagePrice, // Cost basis from DB
        BigDecimal currentPrice, // Live price from market-service
        BigDecimal pnl,          // (currentPrice - avgPrice) * quantity
        BigDecimal pnlPercent,   // pnl / (avgPrice * quantity) * 100
        BigDecimal dayChange,    // Today's price change (amount)
        BigDecimal dayChangePct  // Today's price change (percent)
) {}
