package com.tradeforge.market.dto;

/**
 * WHY StockDetailDto?
 * Flat record containing all stock information for the detail page.
 * price/change/changePercent are filled by StockDetailService.getDetail()
 * which merges live price from MarketDataService at query time.
 *
 * WHY flat instead of nested? Single JSON payload the Angular component destructures
 * directly without extra mapping layers. Simpler for sorting/filtering in screener.
 */
public record StockDetailDto(
        // Basic identity
        String symbol,
        String name,
        String sector,
        String industry,

        // Market cap
        String marketCap,         // Formatted: "Rs.19.2L Cr"
        long   marketCapRaw,      // Raw crores value for sorting

        // Valuation metrics
        double peRatio,
        double pbRatio,
        double eps,               // Earnings Per Share (TTM, Rs.)
        double roe,               // Return on Equity (%)
        double roce,              // Return on Capital Employed (%)
        double debtToEquity,
        double dividendYield,     // Annual dividend yield (%)
        double dividendPerShare,  // Last dividend amount (Rs.)

        // Price range and volume
        double fiftyTwoWeekHigh,
        double fiftyTwoWeekLow,
        long   avgVolume20D,      // 20-day average daily volume

        // Live price — merged from MarketDataService at query time
        double price,
        double change,
        double changePercent,

        // Descriptive fields
        String description,
        double faceValue,         // Face value per share (Rs.)
        String isin,              // ISIN identifier
        String exchange           // "NSE" or "BSE"
) {}
