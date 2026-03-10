package com.tradeforge.websocket;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * WHY a dedicated WebSocket Gateway service?
 * WebSocket connections are long-lived (hours, not milliseconds like HTTP).
 * A server keeps a connection object in memory for every connected client.
 * If this runs inside the API Gateway, a traffic spike in REST calls could
 * exhaust threads and kill WebSocket connections (and vice versa).
 *
 * Separation:
 * - WebSocket Gateway: handles 1000s of persistent connections
 * - API Gateway: handles short-lived REST requests
 * - Each scales independently
 *
 * Sprint 1: Broadcasts mock price ticks every 2 seconds to demonstrate
 *           the WebSocket connection lifecycle.
 * Sprint 2: Consumes from Kafka (market-service publishes ticks),
 *           broadcasts to subscribed clients via STOMP destinations.
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling
// WHY @EnableScheduling? Needed for @Scheduled annotation on the mock tick publisher.
// Without this, @Scheduled methods are ignored at startup.
public class WebSocketGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebSocketGatewayApplication.class, args);
    }
}
