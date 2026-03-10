package com.tradeforge.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * WHY CORS at the Gateway level?
 * The API Gateway is the ONLY point that Angular talks to.
 * Configure CORS once here → all microservices behind it get CORS for free.
 * Without this: each microservice (auth, market, order, portfolio) needs its own CORS config.
 * With Gateway CORS: centralized, consistent, one place to update.
 *
 * WHY CorsWebFilter (not CorsFilter)?
 * Gateway is REACTIVE (WebFlux). CorsFilter is for SERVLET stack (Spring MVC).
 * Using the wrong one causes NoSuchBeanDefinitionException or filter not applied.
 * Reactive stack uses:
 *   - CorsWebFilter (not CorsFilter)
 *   - reactive.UrlBasedCorsConfigurationSource (not servlet UrlBasedCorsConfigurationSource)
 *   - reactive.CorsConfigurationSource (not servlet CorsConfigurationSource)
 *
 * ALSO: application.yml has spring.cloud.gateway.globalcors configuration.
 * WHY both? Belt-and-suspenders:
 * - YAML config handles simple routes
 * - CorsWebFilter bean handles preflight OPTIONS requests not matched by routes
 * You typically need EITHER, not both. The bean approach is more flexible.
 * If you see duplicate CORS headers, remove the YAML globalcors section.
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();

        // WHY specific origin (not *)?
        // allowCredentials: true is incompatible with wildcard origin (*).
        // The CORS spec prohibits it — browser rejects it.
        // Must list each allowed origin explicitly.
        config.setAllowedOrigins(List.of(
            "http://localhost:4200"  // Angular dev server
            // TODO: Add production domain: "https://app.tradeforge.com"
        ));

        // WHY OPTIONS in allowed methods?
        // Browsers send OPTIONS "preflight" before any cross-origin POST/PUT/DELETE.
        // Preflight asks: "May I send this type of request?"
        // Without OPTIONS: preflight gets 405 Method Not Allowed → all mutations blocked.
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));

        // Allow all headers — includes Authorization, X-Refresh-Token, Content-Type
        config.setAllowedHeaders(List.of("*"));

        // Expose Authorization header to JavaScript
        // WHY? Some APIs return new/refreshed tokens in response headers.
        // Without this, JavaScript can't read response headers (CORS blocks it).
        config.setExposedHeaders(Arrays.asList("Authorization", "X-Refresh-Token"));

        // WHY allowCredentials: true?
        // Enables cross-origin requests to include credentials (auth headers).
        // Without this: Authorization header is not sent with cross-origin requests.
        config.setAllowCredentials(true);

        // Cache preflight response for 1 hour
        // WHY? Reduces OPTIONS requests from: every API call → once per hour.
        // Halves the number of HTTP round trips for cross-origin requests.
        config.setMaxAge(3600L);

        // Apply to ALL paths
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }
}
