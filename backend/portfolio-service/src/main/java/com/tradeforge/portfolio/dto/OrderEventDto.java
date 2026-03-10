package com.tradeforge.portfolio.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * WHY duplicate OrderEventDto in portfolio-service?
 * The Kafka consumer needs to deserialize the 'order.events' message published
 * by order-service. The fields must match the JSON schema published by order-service.
 *
 * WHY not share a common library?
 * A shared library would couple both services to the same release cycle.
 * Microservice best practice: each service defines its own representation
 * of external messages. If order-service adds a new field, portfolio-service
 * safely ignores it until it's ready to use it.
 *
 * This local copy is an "Anti-Corruption Layer" — it protects portfolio-service
 * from changes in order-service's internal model.
 */
public record OrderEventDto(
        UUID orderId,
        UUID userId,
        String symbol,
        String transactionType,  // BUY or SELL
        Integer quantity,
        BigDecimal avgPrice,     // Price at which the order was filled
        String status            // Always "COMPLETE" when we receive it
) {}
