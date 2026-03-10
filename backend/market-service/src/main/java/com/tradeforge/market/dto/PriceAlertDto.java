package com.tradeforge.market.dto;

/**
 * WHY PriceAlertDto?
 * Price alerts let users set a target price for a stock.
 * When the live price crosses the target, a notification is fired via Kafka → WebSocket.
 *
 * WHY in-memory storage (not DB)?
 * Sprint 3 scope: alerts are session-based. If market-service restarts, alerts clear.
 * Sprint 4: persist to portfolio-service DB for durability across restarts.
 *
 * WHY condition ABOVE/BELOW?
 * ABOVE: notify when price rises past target (e.g. "alert me if RELIANCE > ₹3000")
 * BELOW: notify when price drops below target (e.g. "alert me if TCS < ₹3800")
 */
public record PriceAlertDto(
        String id,           // UUID string
        String userId,
        String symbol,
        double targetPrice,
        String condition,    // ABOVE | BELOW
        double priceAtCreation,  // Price when alert was set (for context)
        String createdAt     // ISO datetime string
) {}
