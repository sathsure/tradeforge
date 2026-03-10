package com.tradeforge.websocket.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * WHY NotificationConsumer?
 * Bridges the Kafka 'notifications' topic to individual user WebSocket sessions.
 *
 * Architecture flow:
 *   PriceAlertService (market-service) fires when target price crossed
 *   → publishes to Kafka 'notifications' topic (keyed by userId for ordering)
 *   → THIS consumer reads it
 *   → broadcasts via STOMP to /topic/notifications/{userId}
 *   → Angular WebSocketService receives it, calls NotificationService.add()
 *   → notification bell badge increments, panel shows the alert
 *
 * WHY separate from MarketTickConsumer?
 * Notifications are user-specific (unicast). Market ticks are broadcast (multicast).
 * Separate consumers allow independent scaling and different groupIds.
 * Mixing them would complicate the routing logic unnecessarily.
 *
 * WHY @Component (not @Service)?
 * Infrastructure integration class — no business logic.
 * @Service implies domain business logic. @Component is the correct stereotype
 * for framework integration adapters (Kafka consumers, WebSocket forwarders).
 */
@Component
public class NotificationConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationConsumer.class);

    // WHY SimpMessagingTemplate?
    // Spring's STOMP messaging abstraction. Sends messages to any STOMP destination
    // without needing to know which specific WebSocket sessions are subscribed.
    // Spring's in-memory broker (configured in WebSocketConfig) delivers to matching subscribers.
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public NotificationConsumer(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Consumes notification events from market-service.
     *
     * WHY topics = "notifications"?
     * PriceAlertService.publishNotification() sends to this topic when an alert fires.
     * Topic naming: 'market.ticks' is domain-prefixed; 'notifications' is app-level
     * (could originate from any service in the future — order fills, corporate actions).
     *
     * WHY groupId = "websocket-gateway-notifications"?
     * Distinct from "websocket-gateway" used by MarketTickConsumer.
     * Kafka assigns partitions per consumer group independently.
     * If websocket-gateway scales to 3 instances:
     * - MarketTickConsumer: 3 consumers share 'market.ticks' partitions
     * - NotificationConsumer: 3 consumers share 'notifications' partitions
     * Both groups work independently without interfering.
     *
     * WHY /topic/notifications/{userId}?
     * STOMP broker delivers only to clients subscribed to that exact topic.
     * Angular subscribes per user: /topic/notifications/uuid-of-logged-in-user
     * Other users don't receive this notification — proper isolation.
     *
     * Message shape from market-service:
     * { "userId": "uuid", "type": "PRICE_ALERT", "symbol": "RELIANCE",
     *   "message": "RELIANCE crossed above ₹2900.00 (current: ₹2901.50)",
     *   "timestamp": "2024-03-08T09:45:30Z" }
     */
    @KafkaListener(topics = "notifications", groupId = "websocket-gateway-notifications")
    public void consumeNotification(String message) {
        try {
            // WHY Map<String, Object>? The notification schema may evolve.
            // Using a typed record would fail if a new field is added.
            // We forward the full map as-is — Angular decides how to render it.
            @SuppressWarnings("unchecked")
            Map<String, Object> notification = objectMapper.readValue(message, Map.class);

            String userId = (String) notification.get("userId");

            // WHY null check? A malformed message without userId would broadcast
            // to "/topic/notifications/null" — meaningless and potentially confusing.
            if (userId == null || userId.isBlank()) {
                log.warn("Notification missing userId, dropping: {}", message);
                return;
            }

            // WHY convertAndSend (not convertAndSendToUser)?
            // convertAndSendToUser requires Spring Security principal tracking.
            // Our WebSocket clients authenticate via JWT header at connect time
            // but Spring's UserDestinationResolver doesn't know about our JWT userId.
            // Per-user /topic/notifications/{userId} subscription achieves the same
            // routing without requiring Spring Security WebSocket integration.
            messagingTemplate.convertAndSend("/topic/notifications/" + userId, notification);

            log.debug("Delivered notification to user {}: type={} symbol={}",
                    userId, notification.get("type"), notification.get("symbol"));

        } catch (Exception e) {
            log.error("Failed to process notification message: {}. Raw: {}", e.getMessage(), message);
        }
    }
}
