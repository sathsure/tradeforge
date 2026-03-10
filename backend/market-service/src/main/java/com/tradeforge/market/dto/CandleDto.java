package com.tradeforge.market.dto;

/**
 * WHY CandleDto?
 * OHLCV (Open, High, Low, Close, Volume) data for one time period.
 * Used by the frontend's lightweight-charts library to render candlestick
 * and area charts in the Stock Detail panel and MF Screener.
 *
 * WHY epoch seconds (not millis) for time?
 * lightweight-charts v4 expects time as Unix epoch seconds (number), not milliseconds.
 * Using seconds prevents off-by-1000x bugs on the frontend.
 */
public record CandleDto(
        long time,     // Unix epoch seconds (lightweight-charts format)
        double open,
        double high,
        double low,
        double close,
        long volume
) {}
