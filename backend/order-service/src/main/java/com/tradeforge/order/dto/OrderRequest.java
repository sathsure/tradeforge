package com.tradeforge.order.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * WHY a separate request DTO?
 * The entity (Order.java) is the internal DB representation.
 * The DTO is the external API contract — what Angular sends.
 * Separating them means:
 * - You can add @Valid constraints to the DTO without polluting the entity
 * - You can evolve the API shape independently from the DB schema
 * - The entity has internal fields (userId, status) that the client shouldn't set
 *
 * WHY a record?
 * DTOs are immutable data carriers — records are perfect.
 * Jackson can deserialize JSON into records using @JsonProperty or compact constructor.
 */
public record OrderRequest(

        /**
         * WHY @NotBlank?
         * Ensures the symbol is provided and not empty whitespace.
         * @NotNull wouldn't catch empty string "".
         */
        @NotBlank(message = "Symbol is required")
        String symbol,

        /**
         * WHY @Pattern?
         * Order type must be one of: MARKET, LIMIT, SL, SL-M
         * Rejects unknown strings before they reach business logic.
         */
        @NotBlank(message = "Order type is required")
        @Pattern(regexp = "MARKET|LIMIT|SL|SL-M", message = "Order type must be MARKET, LIMIT, SL, or SL-M")
        String orderType,

        /**
         * WHY @Pattern for transactionType?
         * Must be exactly BUY or SELL — no other values are valid.
         */
        @NotBlank(message = "Transaction type is required")
        @Pattern(regexp = "BUY|SELL", message = "Transaction type must be BUY or SELL")
        String transactionType,

        /**
         * WHY @Min(1)?
         * Quantity must be at least 1 — can't buy 0 shares.
         * @Positive would also work but @Min gives a clearer error message.
         */
        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be at least 1")
        @Max(value = 100000, message = "Quantity cannot exceed 100,000")
        Integer quantity,

        /**
         * WHY nullable price?
         * MARKET orders execute at the current market price — no price specified.
         * LIMIT orders require a price — validated in OrderService business logic.
         */
        @DecimalMin(value = "0.01", message = "Price must be positive")
        BigDecimal price
) {}
