package com.tradeforge.portfolio.dto;

import java.math.BigDecimal;

/**
 * WHY a MarketQuoteDto in portfolio-service?
 * portfolio-service calls market-service via REST to get live prices.
 * This DTO deserializes the JSON response from market-service's
 * GET /api/markets/quotes?symbols=RELIANCE,TCS endpoint.
 *
 * WHY not import StockQuoteDto from market-service?
 * In microservices, services are independently deployable JAR files.
 * Importing one service's classes into another creates a compile-time
 * coupling — if market-service changes, portfolio-service won't compile.
 * Instead, we define a local DTO that matches the JSON shape we need.
 * This is the "anti-corruption layer" pattern.
 *
 * WHY only these fields?
 * portfolio-service only needs price, change, and changePercent.
 * We don't need volume, high, low, etc. for P&L calculations.
 */
public record MarketQuoteDto(
        String symbol,
        String name,
        BigDecimal price,
        BigDecimal change,
        BigDecimal changePercent
) {}
