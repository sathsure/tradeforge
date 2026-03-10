package com.tradeforge.market.dto;

import java.util.List;

/**
 * WHY OrderBookDto?
 * Full Level 2 market depth for one stock.
 * bids sorted descending (best bid first), asks sorted ascending (best ask first).
 *
 * WHY include symbol and lastPrice?
 * The frontend renders this alongside live price data.
 * lastPrice anchors the display — bids are below, asks are above it.
 *
 * WHY totalBidQty / totalAskQty?
 * Their ratio is a real-time buy vs sell pressure sentiment indicator.
 * High bidQty relative to askQty = bullish imbalance. Shown prominently in Kite/TradingView.
 */
public record OrderBookDto(
        String symbol,
        double lastPrice,
        List<OrderBookLevelDto> bids,    // Sorted descending (best bid first)
        List<OrderBookLevelDto> asks,    // Sorted ascending (best ask first)
        long totalBidQty,
        long totalAskQty
) {}
