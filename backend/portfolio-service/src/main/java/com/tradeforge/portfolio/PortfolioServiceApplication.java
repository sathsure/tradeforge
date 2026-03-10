package com.tradeforge.portfolio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * WHY Portfolio Service as a separate microservice?
 * Portfolio data is personal and sensitive — specific user's holdings.
 * Separate service means:
 * - Independent database (portfolio schema) — can be moved to read replica
 * - Compute-intensive P&L calculations don't affect order placement latency
 * - Can be cached aggressively — holdings change only when orders execute
 * - Future: event-sourced from order executions via Kafka
 *
 * Sprint 1: Returns mock holdings.
 * Sprint 2: Reads from PostgreSQL portfolio.holdings table,
 *           enriches with live prices from market-service.
 */
@SpringBootApplication
@EnableDiscoveryClient
public class PortfolioServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortfolioServiceApplication.class, args);
    }
}
