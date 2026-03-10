package com.tradeforge.order.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * WHY Spring Security in order-service?
 * We add Spring Security as a dependency to get the JWT validation infrastructure,
 * but we handle JWT extraction manually in the controller (via JwtUtil) rather than
 * using a full JwtAuthenticationFilter.
 *
 * WHY permitAll() for all routes?
 * The API Gateway already validates the JWT before routing to order-service.
 * Gateway → (internal network) → order-service. Internal services don't need
 * their own auth layer in a properly secured deployment.
 *
 * However, we still extract the userId from the JWT in the controller
 * to filter orders per user — this is authorization (what the user can access),
 * not authentication (who the user is).
 *
 * Sprint 3: Add full JwtAuthenticationFilter for defense-in-depth (never trust the gateway).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // WHY disable CSRF?
            // CSRF protects stateful session-based apps. We use stateless JWT — no sessions.
            // Disabling CSRF removes the cookie-based attack vector that doesn't apply here.
            .csrf(AbstractHttpConfigurer::disable)

            // WHY STATELESS session?
            // JWT means the server doesn't store session state. Every request is self-contained.
            // STATELESS tells Spring not to create HttpSession — saves memory and is scalable.
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // WHY permitAll?
            // JWT validation is done manually in controller using JwtUtil.
            // The API Gateway ensures only authenticated requests reach here.
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())

            // WHY no CORS config here?
            // All browser requests go through the API Gateway (port 8080).
            // The Gateway's CorsWebFilter handles CORS for all routes.
            // Adding CORS here too would cause duplicate Access-Control-Allow-Origin headers
            // which browsers reject. Internal services (behind the gateway) don't need CORS.
            .cors(AbstractHttpConfigurer::disable);

        return http.build();
    }
}
