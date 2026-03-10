package com.tradeforge.market.dto;

/**
 * WHY OrderBookLevelDto?
 * One price level in the order book (Level 2 data).
 * Represents all pending orders at a specific price point.
 * Thick bid clusters = support. Thick ask clusters = resistance.
 */
public record OrderBookLevelDto(
        double price,    // Price at this level (₹)
        long quantity,   // Total pending quantity at this price
        int orders       // Number of individual orders at this price
) {}
