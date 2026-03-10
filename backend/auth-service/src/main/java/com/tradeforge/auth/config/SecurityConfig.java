package com.tradeforge.auth.config;

import com.tradeforge.auth.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * WHY @Configuration?
 * Tells Spring: "this class defines beans". Methods annotated with @Bean
 * return objects that Spring manages in its IoC container.
 *
 * WHY @EnableWebSecurity?
 * Activates Spring Security's web security support.
 * Without this, none of the security filters are registered.
 *
 * WHY @EnableMethodSecurity?
 * Enables @PreAuthorize("hasRole('ADMIN')") on controller methods.
 * Without this, method-level security annotations are ignored.
 *
 * WHY explicit constructor instead of @RequiredArgsConstructor?
 * Lombok is incompatible with Java 25. Constructor injection is equivalent
 * and actually more explicit — good for a learning project.
 *
 * ARCHITECTURE: The Security Filter Chain
 * Every HTTP request passes through this chain before reaching controllers.
 * Think of it as layers of security checks:
 * Request → CORS → CSRF → JwtAuthFilter → AuthorizationFilter → Controller
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final UserDetailsService userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            // ── CSRF ─────────────────────────────────────────────────────
            .csrf(csrf -> csrf.disable())
            // WHY disable CSRF? CSRF attacks require the browser to send
            // cookies automatically. We use JWT in Authorization header —
            // browsers don't auto-send headers to other origins.
            // CSRF protection is unnecessary (and breaks) with JWT auth.
            // SECURITY NOTE: If you ever switch to cookie-based auth, re-enable this.

            // ── CORS ─────────────────────────────────────────────────────
            .cors(cors -> cors.disable())
            // WHY disable CORS here?
            // Auth-service is an INTERNAL service — Angular never calls it directly.
            // All traffic flows: Angular → API Gateway (8080) → auth-service (8081)
            // The API Gateway's CorsWebFilter (CorsConfig.java) handles CORS centrally.
            // If BOTH Gateway AND auth-service add CORS headers, the browser sees:
            //   Access-Control-Allow-Origin: http://localhost:4200, http://localhost:4200
            // Duplicate headers → browser blocks the request.
            // RULE: Only the edge service (Gateway) adds CORS headers.

            // ── AUTHORIZATION RULES ──────────────────────────────────────
            .authorizeHttpRequests(auth -> auth
                // Public endpoints — no JWT required
                .requestMatchers("/api/auth/login").permitAll()
                .requestMatchers("/api/auth/register").permitAll()
                .requestMatchers("/api/auth/refresh").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/error").permitAll()
                // WHY /error? Spring Boot's /error endpoint handles validation failures (400).
                // Without this, Spring Security intercepts /error → returns 403 instead of 400.
                // WHY allow /actuator/health? Docker and Render health checks
                // hit this endpoint. If it requires auth, deployments fail.

                // 2FA verification endpoints — public because user doesn't have real JWT yet.
                // WHY permitAll here? During 2FA challenge flow, the user's session is identified
                // by the tempToken in the request body — not by a real JWT.
                // JwtAuthenticationFilter REJECTS tempTokens, so these endpoints must be public.
                .requestMatchers("/api/auth/2fa/verify-otp").permitAll()
                .requestMatchers("/api/auth/2fa/verify-webauthn").permitAll()
                // WHY allow assertion-options? Called by Angular on the 2FA page before WebAuthn.
                // The user provides their tempToken as a query param to identify themselves.
                .requestMatchers("/api/auth/2fa/webauthn/assertion-options").permitAll()

                // Dev-only OTP retrieval (only active with spring.profiles.active=dev)
                // WHY permitAll? Dev endpoints have no auth — they're only for local testing.
                .requestMatchers("/api/dev/**").permitAll()

                // Registration verification endpoints — public because user has no real JWT yet.
                // WHY permitAll? Newly registered users receive a registrationPending temp token.
                // JwtAuthenticationFilter rejects registrationPending tokens for all other endpoints.
                // These two endpoints are the only ones that accept the temp token (in request body).
                .requestMatchers("/api/auth/verify-registration").permitAll()
                .requestMatchers("/api/auth/resend-registration-otp").permitAll()

                // Admin only
                .requestMatchers("/api/admin/**").hasRole("ADMIN")

                // Everything else requires valid JWT
                .anyRequest().authenticated()
            )

            // ── SESSION POLICY ───────────────────────────────────────────
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            // WHY STATELESS? We use JWT — no server-side sessions.
            // STATELESS means: don't create HttpSession, don't store SecurityContext.
            // Each request is self-contained with its JWT token.
            // This is what enables horizontal scaling — any server instance
            // can handle any request because there's no session to look up.

            // ── AUTHENTICATION PROVIDER ──────────────────────────────────
            .authenticationProvider(authenticationProvider())

            // ── JWT FILTER ───────────────────────────────────────────────
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // WHY addFilterBefore? Our JWT filter runs BEFORE Spring's default
            // username/password filter. We intercept the request, extract JWT,
            // set SecurityContext, then let the request continue.

            .build();
    }

    // WHY inject PasswordEncoder here?
    // authenticationProvider() needs it. PasswordEncoder is defined in AppConfig
    // (separate class) to break the circular dependency chain.
    private final PasswordEncoder passwordEncoder;

    // Updated constructor to accept PasswordEncoder from AppConfig
    // WHY @Lazy on jwtAuthFilter? Still needed as secondary precaution.
    public SecurityConfig(@Lazy JwtAuthenticationFilter jwtAuthFilter,
                          UserDetailsService userDetailsService,
                          PasswordEncoder passwordEncoder) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.userDetailsService = userDetailsService;
        this.passwordEncoder = passwordEncoder;
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        // WHY UserDetailsService? Spring Security calls loadUserByUsername(email)
        // to fetch user from DB during login. We implement this in AuthService.
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
        // WHY expose AuthenticationManager as bean?
        // AuthService.login() needs to call authenticate(username, password).
        // Without this bean, we can't inject AuthenticationManager elsewhere.
    }
}
