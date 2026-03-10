package com.tradeforge.market.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeforge.market.dto.PriceAlertDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WHY PriceAlertService?
 * Lets users set a price target for a stock. When the live price crosses the target,
 * a notification is published to Kafka → forwarded by WebSocket Gateway → displayed in Angular.
 *
 * WHY in-memory storage (Map)?
 * Sprint 3 scope: alerts are session-based. Sufficient for learning the full notification pipeline.
 * Sprint 4 enhancement: persist to PostgreSQL in portfolio-service for durability.
 *
 * WHY ConcurrentHashMap?
 * PriceSimulatorService calls checkAlerts() on a background thread (every 1 second).
 * HTTP request threads (addAlert, removeAlert) also modify the map.
 * ConcurrentHashMap prevents ConcurrentModificationException in this concurrent scenario.
 *
 * WHY publish to Kafka instead of WebSocket directly?
 * Decoupling: market-service doesn't know about WebSocket connections.
 * WebSocket Gateway owns WebSocket — it subscribes to the Kafka topic and forwards.
 * If WebSocket Gateway restarts, it picks up from Kafka offset.
 */
@Service
public class PriceAlertService {

    private static final Logger log = LoggerFactory.getLogger(PriceAlertService.class);
    private static final String NOTIFICATIONS_TOPIC = "notifications";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    // WHY Map<userId, List<PriceAlert>>? Group alerts by user for O(1) lookup.
    // Inner list uses CopyOnWriteArrayList to handle concurrent reads during checkAlerts.
    private final Map<String, List<PriceAlert>> alertsByUser = new ConcurrentHashMap<>();

    public PriceAlertService(KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    public PriceAlertDto addAlert(String userId, String symbol, double targetPrice, String condition,
                                  double priceAtCreation) {
        String id = UUID.randomUUID().toString();
        PriceAlert alert = new PriceAlert(id, userId, symbol.toUpperCase(), targetPrice,
                condition.toUpperCase(), priceAtCreation, Instant.now().toString());

        alertsByUser.computeIfAbsent(userId, k -> Collections.synchronizedList(new ArrayList<>()))
                    .add(alert);

        log.info("Price alert set: {} {} {} {}", userId, symbol, condition, targetPrice);
        return toDto(alert);
    }

    public boolean removeAlert(String userId, String alertId) {
        List<PriceAlert> alerts = alertsByUser.get(userId);
        if (alerts == null) return false;
        return alerts.removeIf(a -> a.id.equals(alertId));
    }

    public List<PriceAlertDto> getAlerts(String userId) {
        return alertsByUser.getOrDefault(userId, List.of()).stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Called by PriceSimulatorService on every tick (every 1 second).
     * Checks all user alerts for the given symbol and fires if condition is met.
     * Fired alerts are removed (one-shot — fire once and done).
     *
     * WHY one-shot? Users typically set an alert to be notified of a crossing.
     * After crossing, the alert has served its purpose.
     * Sprint 4: add "persistent" alert option that re-arms after firing.
     */
    public void checkAlerts(String symbol, double newPrice) {
        alertsByUser.forEach((userId, alerts) -> {
            List<PriceAlert> fired = new ArrayList<>();

            synchronized (alerts) {
                for (PriceAlert alert : alerts) {
                    if (!alert.symbol.equals(symbol.toUpperCase())) continue;

                    // WHY strict > / < instead of >= / <=?
                    // Using >= fires the alert the instant price equals the target —
                    // which happens immediately when the user sets the target to the
                    // current price (the form pre-fills with it). Strict comparison
                    // requires the price to genuinely CROSS the threshold, not just touch it.
                    boolean triggered = switch (alert.condition) {
                        case "ABOVE" -> newPrice > alert.targetPrice;
                        case "BELOW" -> newPrice < alert.targetPrice;
                        default -> false;
                    };

                    if (triggered) {
                        fired.add(alert);
                        publishNotification(alert, newPrice);
                    }
                }
                alerts.removeAll(fired);
            }
        });
    }

    private void publishNotification(PriceAlert alert, double currentPrice) {
        try {
            String direction = alert.condition.equals("ABOVE") ? "crossed above" : "dropped below";
            Map<String, String> notification = Map.of(
                    "userId",  alert.userId,
                    "type",    "PRICE_ALERT",
                    "symbol",  alert.symbol,
                    "message", String.format("%s %s ₹%.2f (current: ₹%.2f)",
                               alert.symbol, direction, alert.targetPrice, currentPrice),
                    "timestamp", Instant.now().toString()
            );
            String json = objectMapper.writeValueAsString(notification);
            // WHY userId as key? Ensures same user's notifications go to the same Kafka partition,
            // preserving ordering of notifications for that user.
            kafkaTemplate.send(NOTIFICATIONS_TOPIC, alert.userId, json);
        } catch (Exception e) {
            log.error("Failed to publish price alert notification: {}", e.getMessage());
        }
    }

    private PriceAlertDto toDto(PriceAlert a) {
        return new PriceAlertDto(a.id, a.userId, a.symbol, a.targetPrice,
                a.condition, a.priceAtCreation, a.createdAt);
    }

    /**
     * WHY a private inner class instead of a separate DTO?
     * PriceAlert holds mutable internal state (the alert check logic).
     * PriceAlertDto is the immutable API response record.
     * Keeping the mutable state private prevents callers from modifying active alerts.
     */
    private static class PriceAlert {
        final String id;
        final String userId;
        final String symbol;
        final double targetPrice;
        final String condition;
        final double priceAtCreation;
        final String createdAt;

        PriceAlert(String id, String userId, String symbol, double targetPrice,
                   String condition, double priceAtCreation, String createdAt) {
            this.id = id;
            this.userId = userId;
            this.symbol = symbol;
            this.targetPrice = targetPrice;
            this.condition = condition;
            this.priceAtCreation = priceAtCreation;
            this.createdAt = createdAt;
        }
    }
}
