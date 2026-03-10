package com.tradeforge.websocket.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeforge.websocket.dto.StockTickDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * WHY Kafka consumer in websocket-gateway?
 * Architecture flow:
 *   market-service (publishes ticks) → Kafka 'market.ticks' → websocket-gateway (consumes) → Angular (via STOMP)
 *
 * WHY not market-service push directly to WebSocket clients?
 * Separation of concerns:
 * - market-service: domain expert for price data (compute/publish ticks)
 * - websocket-gateway: expert in managing WebSocket connections (fan-out to clients)
 * Kafka decouples them: market-service doesn't know/care how many WebSocket clients exist.
 *
 * Sprint 1: MarketTickPublisher used @Scheduled to simulate ticks locally.
 * Sprint 2: This consumer replaces that — ticks come from Kafka (market-service).
 *
 * WHY @Component?
 * Infrastructure integration class — not business logic (@Service) or HTTP handler (@Controller).
 */
@Component
public class MarketTickConsumer {

    private static final Logger log = LoggerFactory.getLogger(MarketTickConsumer.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public MarketTickConsumer(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Consumes messages from 'market.ticks' Kafka topic and broadcasts them
     * to Angular clients via STOMP WebSocket.
     *
     * WHY topics = "market.ticks"?
     * market-service PriceSimulatorService publishes to this topic every 1 second.
     * Topic naming convention: <domain>.<event-type>
     *
     * WHY groupId = "websocket-gateway"?
     * Unique consumer group ensures this service receives ALL ticks.
     * If multiple instances of websocket-gateway run (for scale),
     * each instance gets a partition subset (Kafka load-balances across the group).
     *
     * STOMP destination: /topic/prices/{symbol}
     * Angular subscribes to: stompClient.subscribe('/topic/prices/RELIANCE', callback)
     * This means Angular only processes ticks for symbols in its watchlist.
     */
    @KafkaListener(topics = "market.ticks", groupId = "websocket-gateway")
    public void consumeTick(String message) {
        try {
            StockTickDto tick = objectMapper.readValue(message, StockTickDto.class);

            // WHY /topic/prices/{symbol}?
            // Per-symbol topic allows Angular to subscribe selectively.
            // Angular subscribes only to its watchlist symbols — no extra filtering needed.
            // Compare to /topic/prices (single topic): Angular would receive ALL ticks
            // and filter in JavaScript — wastes bandwidth for symbols not in watchlist.
            messagingTemplate.convertAndSend("/topic/prices/" + tick.symbol(), tick);

            log.debug("Broadcasted tick: {} @ {}", tick.symbol(), tick.price());
        } catch (Exception e) {
            log.error("Failed to process market tick: {}. Message: {}", e.getMessage(), message);
        }
    }
}
