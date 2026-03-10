package com.tradeforge.auth.repository;

import com.tradeforge.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * WHY extend JpaRepository<User, UUID>?
 * Spring Data JPA generates the implementation at startup.
 * You get 20+ methods for free: findById, findAll, save, delete, count, etc.
 * Without this, you'd write: session.createQuery("SELECT u FROM User u WHERE u.email = ?")
 * for EVERY query — hundreds of lines of boilerplate.
 *
 * Type parameters:
 * - User: the entity this repository manages
 * - UUID: the type of User's @Id field
 *
 * WHY @Repository?
 * Marks this as a DAO (Data Access Object) bean.
 * Spring wraps it in a proxy that:
 * 1. Translates database exceptions to Spring's DataAccessException hierarchy
 * 2. Enables transaction management
 * Without it, a SQLException from Postgres becomes a raw exception — harder to handle.
 *
 * QUERY METHODS (WHY these names?):
 * Spring Data JPA parses the method name and generates SQL.
 * "findByEmail" → "SELECT * FROM auth.users WHERE email = ?"
 * "existsByEmail" → "SELECT COUNT(*) > 0 FROM auth.users WHERE email = ?"
 * No SQL needed. No query string that can have typos.
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Finds a user by their email address.
     *
     * WHY Optional<User>?
     * The user might not exist (wrong email at login).
     * Without Optional: return null → NullPointerException if caller forgets null check.
     * With Optional: caller is FORCED to handle the "not found" case.
     * Optional<User>.orElseThrow(...) is explicit and safe.
     *
     * Used by:
     * - AuthService.loadUserByUsername() (Spring Security calls this during auth)
     * - AuthService.login() (to load user after authentication succeeds)
     * - JwtAuthenticationFilter.doFilterInternal() (via UserDetailsService)
     */
    Optional<User> findByEmail(String email);

    /**
     * Checks if an email is already registered.
     *
     * WHY existsByEmail instead of findByEmail + checking Optional.isPresent()?
     * Efficiency: "SELECT COUNT(*) > 0" (COUNT query) is cheaper than
     * "SELECT *" (full row fetch) when we only need to know if it exists.
     * Clarity: code reads as "if (userRepository.existsByEmail(email))" — self-documenting.
     *
     * Used by: AuthService.register() to prevent duplicate registrations.
     */
    boolean existsByEmail(String email);
}
