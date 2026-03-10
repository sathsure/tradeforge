package com.tradeforge.auth.repository;

import com.tradeforge.auth.entity.User;
import com.tradeforge.auth.entity.UserTwoFactorConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * WHY @Repository?
 * Marks this as a DAO bean. Spring wraps it in a proxy that translates
 * SQLExceptions to Spring's DataAccessException hierarchy — consistent error handling.
 *
 * WHY extend JpaRepository<UserTwoFactorConfig, UUID>?
 * Gets save(), findById(), delete() etc. for free.
 * Spring Data generates the SQL implementation at startup — no boilerplate queries.
 *
 * WHY two find methods for the same data?
 * findByUserId: used when we only have the UUID (e.g., from JWT claims).
 * findByUser: used when we already have the User entity (e.g., from Authentication principal).
 * Avoiding an extra entity lookup in the common authenticated-endpoint case.
 */
@Repository
public interface TwoFactorConfigRepository extends JpaRepository<UserTwoFactorConfig, UUID> {

    /**
     * Finds 2FA config by user's UUID.
     * Used by AuthService.login() which has the userId from the loaded User entity.
     *
     * WHY Optional? Most users won't have 2FA configured initially.
     * Optional forces callers to handle the "no 2FA config" case explicitly.
     */
    Optional<UserTwoFactorConfig> findByUserId(UUID userId);

    /**
     * Finds 2FA config by the User entity reference.
     * Used by TwoFactorController endpoints that receive Authentication principal (a User).
     *
     * WHY User reference instead of UUID?
     * Avoids calling user.getId() explicitly — Spring Data handles the FK lookup.
     * Query generated: SELECT * FROM user_two_factor_config WHERE user_id = ?
     */
    Optional<UserTwoFactorConfig> findByUser(User user);
}
