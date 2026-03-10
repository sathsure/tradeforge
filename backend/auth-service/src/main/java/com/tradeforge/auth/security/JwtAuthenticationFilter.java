package com.tradeforge.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * WHY extend OncePerRequestFilter?
 * Guarantees this filter runs EXACTLY ONCE per HTTP request.
 * Without this guarantee, in some servlet containers, filters can run multiple times
 * (e.g., when request is forwarded internally). OncePerRequestFilter prevents that.
 *
 * WHAT THIS FILTER DOES (runs on every request):
 * 1. Extract JWT from "Authorization: Bearer <token>" header
 * 2. Validate the token (not expired, not tampered)
 * 3. Load user from DB
 * 4. Set SecurityContext — marks this request as authenticated
 * 5. Pass request to the next filter/controller
 *
 * If any step fails, SecurityContext stays empty → Spring returns 401 Unauthorized.
 *
 * SECURITY DEEP DIVE — SecurityContextHolder:
 * This is Spring Security's thread-local storage for authentication state.
 * Once you set it here, every subsequent component in the request lifecycle
 * (@Controller, @Service, @PreAuthorize) can call:
 *   SecurityContextHolder.getContext().getAuthentication()
 * to know who's making the request.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;

    // WHY explicit constructor? @RequiredArgsConstructor (Lombok) is incompatible with Java 25.
    // Constructor injection is the recommended Spring pattern — final fields enforce non-null.
    public JwtAuthenticationFilter(JwtService jwtService, UserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        // Step 1: Extract the Authorization header
        final String authHeader = request.getHeader("Authorization");
        // WHY Authorization header? Standard HTTP auth mechanism.
        // "Bearer " prefix is OAuth2/JWT convention — Bearer means
        // "whoever holds this token has access" (like a bearer check).

        // No header or wrong format — skip filter, let other filters handle it
        // (might be a public endpoint like /api/auth/login)
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Step 2: Extract token (remove "Bearer " prefix — 7 characters)
        final String jwt = authHeader.substring(7);

        // Step 2b: Reject 2FA pending tokens immediately.
        // WHY reject here before even extracting the username?
        // Temp tokens have twoFactorPending:true — they are ONLY for the
        // /api/auth/2fa/verify-* endpoints (which are in SecurityConfig.permitAll()).
        // If a temp token reaches here, someone tried to use the 2FA challenge token
        // as a real access token to reach a protected trading endpoint.
        // We pass it along without setting SecurityContext → request gets 401.
        if (jwtService.isTwoFactorPendingToken(jwt)) {
            log.warn("Rejected 2FA pending token used as access token for path: {}",
                    request.getRequestURI());
            filterChain.doFilter(request, response);
            return;
        }

        // Step 2c: Reject registration pending tokens.
        // WHY? Same rationale as 2FA temp tokens — a newly registered user has a
        // registrationPending token but is NOT authenticated yet.
        // These tokens must ONLY be accepted by /api/auth/verify-registration
        // and /api/auth/resend-registration-otp (both in SecurityConfig.permitAll()).
        if (jwtService.isRegistrationPendingToken(jwt)) {
            log.warn("Rejected registration pending token used as access token for path: {}",
                    request.getRequestURI());
            filterChain.doFilter(request, response);
            return;
        }

        // Step 3: Extract username from token
        final String userEmail = jwtService.extractUsername(jwt);
        // If token is expired or tampered, extractUsername returns null

        // Step 4: Only proceed if we have a username AND user isn't already authenticated
        // WHY check SecurityContextHolder? If already authenticated in this request
        // (shouldn't happen with OncePerRequestFilter, but defensive coding),
        // don't overwrite the existing authentication.
        if (userEmail != null && SecurityContextHolder.getContext().getAuthentication() == null) {

            // Step 5: Load full user from DB — verify user still exists and is active
            UserDetails userDetails = userDetailsService.loadUserByUsername(userEmail);
            // WHY load from DB on every request?
            // Token could be valid but user might be deactivated/banned since token was issued.
            // This is a performance tradeoff — you could cache this in Redis if DB calls are slow.

            // Step 6: Validate token against user
            if (jwtService.isTokenValid(jwt, userDetails.getUsername())) {

                // Step 7: Create authentication token
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                userDetails,
                                null,                        // credentials null — already authenticated
                                userDetails.getAuthorities() // roles: [ROLE_TRADER] or [ROLE_ADMIN]
                        );
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                // WHY setDetails? Adds IP address and session ID to auth context.
                // Useful for audit logging — "user X from IP Y performed action Z"

                // Step 8: Store in SecurityContext — THIS IS THE KEY MOMENT
                // From this point forward, this request is authenticated.
                // @PreAuthorize checks, controller's getPrincipal() — all work now.
                SecurityContextHolder.getContext().setAuthentication(authToken);
                log.debug("Authenticated user: {} for path: {}", userEmail, request.getRequestURI());
            }
        }

        // Step 9: Continue the filter chain — request proceeds to controller
        filterChain.doFilter(request, response);
    }
}
