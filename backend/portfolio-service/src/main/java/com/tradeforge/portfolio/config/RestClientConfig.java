package com.tradeforge.portfolio.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * WHY RestTemplate?
 * portfolio-service needs to call market-service to get live stock prices
 * when building the portfolio response. RestTemplate is the standard
 * Spring HTTP client for synchronous REST calls.
 *
 * WHY not WebClient?
 * WebClient is the reactive alternative. portfolio-service uses Spring MVC
 * (servlet-based, not reactive). Mixing reactive and servlet in the same
 * service is complex. RestTemplate is simpler for blocking calls.
 *
 * Sprint 3: If market-service becomes a bottleneck, switch to WebClient
 * with non-blocking calls and reactive portfolio endpoints.
 *
 * WHY @Bean?
 * RestTemplate must be a Spring bean so we can use @LoadBalanced in future
 * (enables service-to-service calls via Eureka: lb://market-service).
 * For Sprint 2, we use the direct URL (localhost:8083).
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
