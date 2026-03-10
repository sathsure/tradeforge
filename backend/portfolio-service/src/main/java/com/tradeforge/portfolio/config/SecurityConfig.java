package com.tradeforge.portfolio.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * WHY Spring Security in portfolio-service?
 * Same as order-service: we use Spring Security for the infrastructure
 * (CSRF, session management) but handle JWT manually in the controller.
 * API Gateway validates auth — portfolio-service extracts userId from the JWT.
 *
 * WHY no CORS config here?
 * All browser requests go through the API Gateway (port 8080).
 * The Gateway's CorsWebFilter handles CORS. Adding CORS here too would cause
 * duplicate Access-Control-Allow-Origin headers which browsers reject.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .cors(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
