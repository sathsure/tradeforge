package com.tradeforge.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * WHY a separate AppConfig for PasswordEncoder?
 *
 * PROBLEM — Circular Dependency:
 * SecurityConfig → JwtAuthFilter → AuthService → PasswordEncoder (SecurityConfig)
 *                                                         ↑
 *                                               This is defined IN SecurityConfig
 *
 * If PasswordEncoder is defined in SecurityConfig, then AuthService needs SecurityConfig
 * to be created first. But SecurityConfig needs JwtAuthFilter, which needs AuthService.
 * Spring Boot 3 prohibits circular references by default.
 *
 * SOLUTION — Extract PasswordEncoder to a standalone config class:
 * AppConfig has NO dependencies (just creates a BCryptPasswordEncoder).
 * SecurityConfig and AuthService both get PasswordEncoder from AppConfig.
 * The dependency cycle is broken.
 *
 * WHY BCrypt?
 * Deliberately slow hash function — 100ms per hash.
 * Feature, not bug: legitimate users tolerate 100ms on login.
 * Attackers brute-forcing with GPUs: 100ms per attempt makes it infeasible.
 * NEVER use MD5/SHA for passwords. BCrypt is the industry standard.
 */
@Configuration
public class AppConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
