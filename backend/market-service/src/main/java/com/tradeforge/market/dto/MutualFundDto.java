package com.tradeforge.market.dto;

import java.util.List;

/**
 * WHY MutualFundDto?
 * Complete mutual fund record for the MF screener list and detail view.
 * topHoldings is included so the SIP allocation breakdown works without a second API call:
 *   allocation per stock = holding.percentage / 100 * sipAmount
 *
 * WHY nested FundHoldingDto record?
 * A fund holding only makes sense in the context of a fund.
 * Nesting prevents namespace pollution at the package level.
 * Java 21 records support static nested records natively.
 */
public record MutualFundDto(
        // Identity
        String id,              // Unique code, e.g., "MIRAE-LARGE-CAP"
        String name,            // Full fund name
        String category,        // EQUITY | DEBT | HYBRID | INDEX | ELSS
        String subCategory,     // Large Cap | Mid Cap | Flexi Cap | etc.
        String fundManager,     // Portfolio manager name
        String amcName,         // Asset Management Company name

        // NAV and AUM
        double nav,             // Current Net Asset Value per unit (Rs.)
        String lastNavDate,     // ISO date of last NAV update
        double aumCrore,        // AUM in crores (for sorting)
        String aumFmt,          // Formatted AUM string e.g., "Rs.42,000 Cr"
        double expenseRatio,    // Annual expense ratio (%)

        // Returns
        double returns1Y,       // 1-year absolute return (%)
        double returns3Y,       // 3-year CAGR (%)
        double returns5Y,       // 5-year CAGR (%)

        // Risk profile
        String riskLevel,       // LOW | MODERATE | MODERATELY_HIGH | HIGH | VERY_HIGH

        // Investment minimums
        int minSip,             // Minimum SIP amount (Rs.)
        int minLumpsum,         // Minimum lumpsum investment (Rs.)

        // Holdings for SIP allocation breakdown
        List<FundHoldingDto> topHoldings,

        // Benchmark comparison
        String benchmark,       // e.g., "NIFTY 100"
        double benchmarkReturn  // Benchmark 1Y return (%) for performance comparison

) {
    /**
     * WHY nested record?
     * Holdings only make sense in the context of a fund.
     * Java 21 records can contain nested static member types.
     *
     * WHY percentage field?
     * Used to calculate SIP allocation:
     * if you invest Rs.1000, this stock gets Rs.(1000 * percentage / 100).
     */
    public record FundHoldingDto(
            String symbol,      // Stock symbol (e.g., "RELIANCE")
            String name,        // Company name
            double percentage   // % of fund AUM allocated to this stock
    ) {}
}
