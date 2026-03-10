package com.tradeforge.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * WHY @SpringBootApplication?
 * This single annotation does 3 things:
 * 1. @Configuration — this class can define Spring Beans
 * 2. @EnableAutoConfiguration — Spring reads classpath and auto-configures
 *    (sees PostgreSQL driver → configures DataSource automatically)
 * 3. @ComponentScan — scans this package and sub-packages for @Component,
 *    @Service, @Repository, @Controller classes and registers them as beans
 *
 * WHY @EnableDiscoveryClient?
 * On startup, this service registers itself with Eureka Server.
 * Registration payload: { serviceName: "auth-service", host: "...", port: 8081 }
 * API Gateway queries Eureka to find this service — no hardcoded URLs.
 *
 * WHY @EnableScheduling?
 * Allows @Scheduled methods — we use this to clean up expired refresh tokens
 * from the database every hour automatically.
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableScheduling
public class AuthServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
        // SpringApplication.run() does everything:
        // 1. Creates Spring ApplicationContext (the IoC container)
        // 2. Auto-configures DataSource, Security, Redis, etc.
        // 3. Starts embedded Tomcat on port 8081
        // 4. Registers with Eureka
    }
}
