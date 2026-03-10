package com.tradeforge.portfolio.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeforge.portfolio.dto.OrderEventDto;
import com.tradeforge.portfolio.service.PortfolioService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * WHY @Component instead of @Service?
 * This class is a Kafka message handler — it's infrastructure/integration code,
 * not business logic. @Component is appropriate for infrastructure beans.
 * @Service is for business logic layers. The actual business logic is in PortfolioService.
 *
 * WHY a Kafka consumer for orders?
 * Portfolio holdings must update whenever an order completes.
 * Options:
 * 1. Polling: portfolio-service periodically calls order-service for completed orders.
 *    - Problem: Polling adds latency (up to poll interval), wastes resources, tight coupling.
 * 2. REST webhook: order-service calls portfolio-service when an order completes.
 *    - Problem: If portfolio-service is down, the call fails and the update is lost.
 * 3. Kafka (this approach): order-service publishes an event, portfolio-service consumes it.
 *    - If portfolio-service is down, Kafka holds the message — processed when it recovers.
 *    - Zero coupling between services (order-service doesn't know portfolio-service exists).
 *    - Guaranteed delivery (at-least-once with Kafka offset commits).
 */
@Component
public class OrderEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderEventConsumer.class);

    private final PortfolioService portfolioService;
    private final ObjectMapper objectMapper;

    public OrderEventConsumer(PortfolioService portfolioService, ObjectMapper objectMapper) {
        this.portfolioService = portfolioService;
        this.objectMapper = objectMapper;
    }

    /**
     * Consumes messages from the 'order.events' Kafka topic.
     *
     * WHY topics = "order.events"?
     * This is the topic order-service publishes to when an order completes.
     * Topic names are the contract between producer and consumer.
     *
     * WHY groupId = "portfolio-service"?
     * Each consumer group tracks its own offset independently.
     * If portfolio-service and another future service both consume order.events,
     * they each have their own offset (group ID) and both receive all messages.
     * Kafka fan-out: one producer → multiple independent consumer groups.
     *
     * WHY @KafkaListener?
     * Spring Kafka creates a background thread that polls Kafka for messages
     * and calls this method for each message. No manual polling code needed.
     */
    @KafkaListener(topics = "order.events", groupId = "portfolio-service")
    public void consumeOrderEvent(String message) {
        try {
            OrderEventDto event = objectMapper.readValue(message, OrderEventDto.class);
            log.info("Received order event: {} {} {} {} @ {}",
                    event.status(), event.transactionType(), event.quantity(),
                    event.symbol(), event.avgPrice());

            // WHY only process COMPLETE orders?
            // PENDING orders haven't been filled yet — no holding change.
            // CANCELLED orders were never executed — no holding change.
            // Only COMPLETE means shares were actually exchanged.
            if ("COMPLETE".equals(event.status())) {
                portfolioService.updateHolding(
                        event.userId(),
                        event.symbol(),
                        event.transactionType(),
                        event.quantity(),
                        event.avgPrice()
                );
                log.info("Holdings updated for user {} after {} {} {}",
                        event.userId(), event.transactionType(), event.quantity(), event.symbol());
            }
        } catch (Exception e) {
            // WHY catch and log instead of throwing?
            // If we throw from a @KafkaListener, Spring Kafka may retry the same message
            // repeatedly (depending on error handler config). For Sprint 2, we just log.
            // Sprint 3: Add a DeadLetterPublishingRecoverer to send failed messages to
            // a 'order.events.DLT' topic for manual inspection.
            log.error("Failed to process order event: {}. Message: {}", e.getMessage(), message);
        }
    }
}
