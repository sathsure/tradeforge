package com.tradeforge.market.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * WHY Spring Security in market-service?
 * We add it to unlock JWT validation infrastructure for PriceAlertController.
 * Most market endpoints are public (quotes, history, screener — no auth needed).
 * /api/alerts endpoints require a valid JWT to identify the user.
 *
 * WHY permitAll for everything?
 * The API Gateway validates the JWT before routing to this service.
 * We extract userId manually in PriceAlertController via JwtUtil.
 * Spring Security here just provides CSRF + session management boilerplate.
 *
 * WHY no CORS config?
 * All browser traffic goes through the API Gateway (port 8080).
 * The Gateway's CorsWebFilter handles CORS. Adding CORS here too causes
 * duplicate Access-Control-Allow-Origin headers → browser blocks the request.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // WHY disable CSRF? Stateless JWT API — no sessions, no cookies.
            .csrf(AbstractHttpConfigurer::disable)

            // WHY STATELESS? JWT = self-contained auth. No HttpSession needed.
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // WHY permitAll? JWT check done manually in controller via JwtUtil.
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())

            // WHY disable CORS? Gateway's CorsWebFilter handles it globally.
            .cors(AbstractHttpConfigurer::disable);

        return http.build();
    }
}
