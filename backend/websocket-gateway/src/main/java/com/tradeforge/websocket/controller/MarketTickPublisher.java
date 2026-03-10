package com.tradeforge.websocket.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.*;

/**
 * WHY @Component for a scheduler?
 * Not a Controller or Service — this publishes messages proactively (not on HTTP request).
 * @Component registers it with Spring, @Scheduled methods fire automatically.
 *
 * WHY SimpMessagingTemplate?
 * Spring's abstraction for sending STOMP messages from server to clients.
 * template.convertAndSend("/topic/prices", payload) → delivers to all subscribers.
 *
 * Sprint 1: Simulates price ticks with ±0.5% random movement.
 * Sprint 2: Reads from Kafka topic "market-ticks" (published by market-service
 *           which consumes from Finnhub WebSocket).
 */
@Component
public class MarketTickPublisher {

    private static final Logger log = LoggerFactory.getLogger(MarketTickPublisher.class);

    private final SimpMessagingTemplate messagingTemplate;

    public MarketTickPublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // Current prices — mutated by each tick to simulate realistic price movement
    private final Map<String, Double> prices = new HashMap<>(Map.of(
        "RELIANCE",  2847.35,
        "TCS",       3942.80,
        "INFY",      1847.65,
        "HDFCBANK",  1689.40,
        "ICICIBANK", 1124.75
    ));

    private final Random random = new Random();

    /**
     * WHY @Scheduled(fixedRate = 2000)?
     * Fires every 2 seconds — simulates market tick frequency.
     * Real NSE tick frequency: 200ms. 2s is more legible for demo purposes.
     *
     * WHY initialDelay = 5000?
     * Waits 5 seconds after startup before first tick.
     * Gives Angular time to connect the WebSocket before receiving messages.
     */
    @Scheduled(fixedRate = 2000, initialDelay = 5000)
    public void publishTicks() {
        for (Map.Entry<String, Double> entry : prices.entrySet()) {
            String symbol = entry.getKey();
            double oldPrice = entry.getValue();

            // Simulate ±0.5% random price movement
            double change = (random.nextDouble() - 0.5) * 0.01 * oldPrice;
            double newPrice = Math.round((oldPrice + change) * 100.0) / 100.0;
            prices.put(symbol, newPrice);

            Map<String, Object> tick = new LinkedHashMap<>();
            tick.put("symbol", symbol);
            tick.put("price", newPrice);
            tick.put("change", Math.round(change * 100.0) / 100.0);
            tick.put("changePercent", Math.round((change / oldPrice) * 10000.0) / 100.0);
            tick.put("timestamp", System.currentTimeMillis());

            // WHY /topic/prices/{symbol}?
            // Angular subscribes per symbol: /topic/prices/RELIANCE
            // Only receives ticks for symbols it cares about (watchlist).
            // More efficient than broadcasting ALL ticks to ALL clients.
            messagingTemplate.convertAndSend("/topic/prices/" + symbol, tick);
        }
        log.debug("Published ticks for {} symbols", prices.size());
    }
}
