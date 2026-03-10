package com.tradeforge.market.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * WHY a DTO instead of Map<String,Object>?
 * Sprint 1 used raw Maps — flexible but no type safety, no IDE auto-complete.
 * Sprint 2 uses typed DTOs so:
 * - Jackson serializes field names consistently (camelCase)
 * - Compiler catches typos in field references
 * - Angular knows the exact shape of the response
 *
 * WHY a record?
 * Java 21 records are immutable, auto-generate equals/hashCode/toString,
 * and are ideal for DTOs that are just data carriers with no business logic.
 */
public record StockQuoteDto(
        @JsonProperty("symbol")       String symbol,
        @JsonProperty("name")         String name,
        @JsonProperty("price")        double price,
        @JsonProperty("change")       double change,
        @JsonProperty("changePercent") double changePercent,
        @JsonProperty("volume")       long volume,
        @JsonProperty("high")         double high,
        @JsonProperty("low")          double low,
        @JsonProperty("open")         double open,
        @JsonProperty("previousClose") double previousClose
) {
    /**
     * WHY a copy-with-price method?
     * PriceSimulatorService needs to update only the price/change fields.
     * Records are immutable, so we produce a new instance with updated values.
     * This is the "wither" pattern — safe, no mutation bugs.
     */
    public StockQuoteDto withNewPrice(double newPrice) {
        double ch = newPrice - this.previousClose;
        double chPct = (ch / this.previousClose) * 100;
        return new StockQuoteDto(
                symbol, name, newPrice, ch, chPct, volume,
                Math.max(high, newPrice),          // update intraday high
                Math.min(low, newPrice),            // update intraday low
                open, previousClose
        );
    }
}
