package com.tradeforge.portfolio.dto;

import java.math.BigDecimal;

/**
 * WHY PortfolioSummaryDto?
 * The UI needs aggregated totals (invested, current value, P&L)
 * across all holdings — not just individual holding data.
 * This is computed in PortfolioService from the holdings list.
 *
 * These numbers are derived (not stored in DB) — recalculated on every request
 * using live prices. This ensures the summary is always up-to-date.
 *
 * Sprint 3: Cache this in Redis with a short TTL (5 seconds) to avoid
 * recomputing on every page load.
 */
public record PortfolioSummaryDto(
        BigDecimal totalInvested,    // Sum of (avgPrice * quantity) for all holdings
        BigDecimal currentValue,     // Sum of (currentPrice * quantity) for all holdings
        BigDecimal totalPnl,         // currentValue - totalInvested
        BigDecimal totalPnlPercent,  // totalPnl / totalInvested * 100
        BigDecimal dayPnl,           // Sum of (dayChange * quantity) for all holdings
        BigDecimal dayPnlPercent,    // dayPnl / (currentValue - dayPnl) * 100
        BigDecimal availableBalance  // Cash available to trade (hardcoded for Sprint 2)
) {}
