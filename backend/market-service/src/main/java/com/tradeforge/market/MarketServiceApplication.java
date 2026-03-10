package com.tradeforge.market;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * WHY @SpringBootApplication?
 * Auto-configures Spring MVC, embedded Tomcat, component scanning.
 *
 * WHY @EnableDiscoveryClient?
 * Registers this service with Eureka on startup.
 * API Gateway uses Eureka to route lb://market-service to this service.
 *
 * Market Service responsibilities:
 * - Serve live stock quotes (mock data for Sprint 1, real data in Sprint 2)
 * - Stock symbol search
 * - Historical OHLCV data (Sprint 2+)
 * - WebSocket publisher of live ticks to Kafka (Sprint 2+)
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling  // WHY? Activates @Scheduled on PriceSimulatorService — publishes ticks every 1s
public class MarketServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(MarketServiceApplication.class, args);
    }
}
