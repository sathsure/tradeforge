package com.tradeforge.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * WHY @SpringBootApplication?
 * Enables:
 * 1. @ComponentScan: finds all @Configuration, @Service, @Component in this package
 * 2. @EnableAutoConfiguration: reads classpath, auto-configures Gateway, Reactor, Redis
 * 3. @Configuration: this class can define @Bean methods
 *
 * WHY @EnableDiscoveryClient?
 * Registers this API Gateway with Eureka Server on startup.
 * Registration payload: { name: "api-gateway", host: "...", port: 8080 }
 *
 * MORE IMPORTANTLY: enables service discovery for routing.
 * Routes configured as lb://auth-service use Eureka to find auth-service's actual IP.
 * If auth-service runs on 3 instances, Gateway load-balances across all 3 automatically.
 * No hardcoded IPs in routing config.
 *
 * ARCHITECTURE: WHY a Gateway vs direct calls?
 *
 * WITHOUT Gateway:
 * Angular → http://localhost:8081/api/auth/login
 * Angular → http://localhost:8083/api/markets/quotes
 * Angular → http://localhost:8085/api/portfolio
 * Problems:
 * - CORS on every service
 * - Angular must know all service URLs
 * - Rate limiting per service
 * - Load balancing per service
 * - Auth token validation per service
 *
 * WITH Gateway:
 * Angular → http://localhost:8080/api/auth/login   (gateway routes to 8081)
 * Angular → http://localhost:8080/api/markets/...  (gateway routes to 8083)
 * Angular → http://localhost:8080/api/portfolio/.. (gateway routes to 8085)
 * Benefits:
 * - CORS once, centrally
 * - Single URL for Angular
 * - Rate limiting once
 * - Future: JWT validation once (remove from each service)
 */
@SpringBootApplication
@EnableDiscoveryClient
public class ApiGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
        // Spring Boot starts:
        // 1. Creates reactive WebFlux application context (NOT servlet context)
        // 2. Starts Netty server on port 8080 (NOT Tomcat — Netty is non-blocking)
        // 3. Configures routes from application.yml
        // 4. Registers with Eureka
        // WHY Netty not Tomcat? Spring Cloud Gateway requires reactive stack.
        // Spring MVC/Tomcat is blocking. Gateway needs non-blocking I/O for high concurrency.
    }
}
