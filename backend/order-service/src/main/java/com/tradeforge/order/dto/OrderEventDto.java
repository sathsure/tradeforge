package com.tradeforge.order.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * WHY a separate event DTO for Kafka?
 * The Kafka message is the public contract between order-service and portfolio-service.
 * Using OrderResponse (the REST DTO) would couple the Kafka contract to the REST API —
 * changing the REST response would break the Kafka consumer.
 *
 * The event DTO contains only what portfolio-service needs to update holdings:
 * userId, symbol, transactionType, quantity, avgPrice.
 *
 * WHY not just use the Order entity?
 * Entities have JPA proxies and lazy-loaded collections that don't serialize to JSON well.
 * Always use plain POJOs/records for Kafka messages.
 */
public record OrderEventDto(
        UUID orderId,
        UUID userId,
        String symbol,
        String transactionType,   // BUY or SELL
        Integer quantity,
        BigDecimal avgPrice,      // The price at which the order was filled
        String status             // Will always be "COMPLETE" when published
) {}
