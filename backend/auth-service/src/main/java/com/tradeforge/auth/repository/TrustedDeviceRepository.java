package com.tradeforge.auth.repository;

import com.tradeforge.auth.entity.TrustedDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WHY @Repository?
 * Marks this as a DAO bean. Spring Data JPA generates the SQL implementation
 * at startup, translating Java method names into optimized parameterized queries.
 *
 * Three query patterns for trusted device management:
 * 1. Login check: does this device's fingerprint cookie exist and is it still valid?
 * 2. Settings page: list all active (non-expired) devices for a user.
 * 3. Cleanup job: delete all expired device records to keep the table lean.
 */
@Repository
public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, UUID> {

    /**
     * Finds a device by its fingerprint token (from the "tf_dt" HttpOnly cookie).
     * WHY Optional? The cookie might point to an already-deleted or expired device.
     * The caller (TrustedDeviceService.isDeviceTrusted) checks expiry after finding.
     */
    Optional<TrustedDevice> findByDeviceToken(String token);

    /**
     * Returns all non-expired trusted devices for a user.
     * WHY filter by expiresAtAfter(now)? We don't run cleanup every minute.
     * Expired records may still be in the DB; filter them out at query time
     * so the settings page only shows currently active trusted devices.
     *
     * Generated query: SELECT * FROM trusted_devices WHERE user_id = ? AND expires_at > ?
     */
    List<TrustedDevice> findByUserIdAndExpiresAtAfter(UUID userId, LocalDateTime now);

    /**
     * Deletes all records that have already expired.
     * WHY? Keep the trusted_devices table small.
     * Can be called by a @Scheduled cleanup job or on-demand from an admin endpoint.
     *
     * Generated query: DELETE FROM trusted_devices WHERE expires_at < ?
     */
    void deleteByExpiresAtBefore(LocalDateTime now);
}
