package com.tradeforge.order;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * WHY Order Service as a separate microservice?
 * Order placement is mission-critical: it moves real money.
 * Isolating it means:
 * - It can be deployed with higher SLAs than non-critical services
 * - Risk limits, fraud detection, and compliance logic stay in ONE place
 * - Database (orders schema) is owned by ONLY this service
 * - Scales independently during high-volume trading sessions (market open)
 *
 * Sprint 1: Returns mock order data.
 * Sprint 2: Connects to PostgreSQL orders schema, publishes to Kafka.
 */
@SpringBootApplication
@EnableDiscoveryClient
public class OrderServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
