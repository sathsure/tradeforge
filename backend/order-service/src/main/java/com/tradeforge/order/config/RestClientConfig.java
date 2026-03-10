package com.tradeforge.order.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * WHY RestTemplate bean here?
 * order-service needs to call market-service to fetch the live price
 * for MARKET orders at the moment they are filled.
 * Without the current price, MARKET orders would use the ₹100 placeholder.
 *
 * WHY not @LoadBalanced?
 * @LoadBalanced enables Eureka-resolved lb://market-service URLs.
 * For Sprint 3 simplicity, we use the direct localhost:8083 URL.
 * Switch to @LoadBalanced + lb://market-service in production.
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
