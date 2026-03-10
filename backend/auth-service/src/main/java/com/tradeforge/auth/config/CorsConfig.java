package com.tradeforge.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * WHY CORS configuration?
 * CORS (Cross-Origin Resource Sharing) is a browser security mechanism.
 *
 * PROBLEM:
 * Angular runs on http://localhost:4200
 * Auth Service runs on http://localhost:8081
 * Browser refuses to let JavaScript on port 4200 call APIs on port 8081.
 * This is the "Same-Origin Policy" — browsers block cross-origin requests by default.
 *
 * SOLUTION:
 * The server tells the browser: "It's OK for http://localhost:4200 to call me."
 * The server does this by adding CORS headers to responses:
 *   Access-Control-Allow-Origin: http://localhost:4200
 *   Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
 *   ...
 *
 * WHY @Configuration?
 * Marks this class as a Spring configuration class.
 * The @Bean method below creates a CorsConfigurationSource bean.
 * SecurityConfig picks up this bean automatically via Customizer.withDefaults().
 *
 * SECURITY NOTE:
 * In production, change allowedOrigins to your actual domain:
 *   "https://app.tradeforge.com"
 * NEVER use "*" (wildcard) with allowCredentials: true — browsers reject it.
 * Wildcard + credentials = security violation per CORS spec.
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // WHY explicit origins (not wildcard)?
        // Allows the browser to include credentials (Authorization header, cookies).
        // CORS wildcard (*) + allowCredentials(true) = rejected by browsers.
        // Must list exact origins.
        config.setAllowedOrigins(List.of(
            "http://localhost:4200"  // Angular dev server
            // Production: add "https://app.tradeforge.com"
        ));

        // WHY include OPTIONS?
        // Browsers send a "preflight" OPTIONS request before POST/PUT/DELETE.
        // The browser asks: "Can I send this request?" → server says yes → browser sends real request.
        // Without OPTIONS: preflight is rejected → every mutation fails with CORS error.
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));

        // WHY "Authorization" and "X-Refresh-Token"?
        // Angular sends Authorization: Bearer <token> with every protected request.
        // Angular sends X-Refresh-Token: <token> on /auth/refresh and /auth/logout.
        // Without allowing these headers, CORS preflight rejects them.
        config.setAllowedHeaders(List.of("*"));
        // WHY *? Allow all headers — easier than listing them all.
        // In production, consider listing: "Authorization", "Content-Type", "X-Refresh-Token"

        // Expose Authorization to JavaScript — some APIs send new tokens in response headers
        config.setExposedHeaders(List.of("Authorization"));

        // WHY allowCredentials: true?
        // Our Angular interceptor reads the Authorization header.
        // For credentials (auth headers) to work cross-origin, this must be true.
        config.setAllowCredentials(true);

        // WHY maxAge: 3600?
        // Browsers cache the preflight response for 3600 seconds (1 hour).
        // Without this, EVERY request triggers a preflight OPTIONS call.
        // With this, only the first request per hour needs a preflight.
        // Reduces HTTP round trips by 50% for protected endpoints.
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        // WHY "/**"? Apply CORS config to ALL paths.
        // If we used "/api/**", the actuator /health endpoint might not get CORS headers.
        return source;
    }
}
