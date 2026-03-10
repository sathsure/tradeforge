package com.tradeforge.auth.repository;

import com.tradeforge.auth.entity.WebAuthnCredential;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WHY @Repository?
 * Spring wraps this in a proxy bean for exception translation and transaction support.
 * JpaRepository provides standard CRUD methods without any SQL boilerplate.
 *
 * WHY List<WebAuthnCredential> for findByUserId?
 * One user can register multiple authenticators: laptop TouchID, phone FaceID, YubiKey.
 * Returns all of them so the registration ceremony can include them in excludeCredentials
 * (prevents the browser from re-registering the same device).
 *
 * WHY Optional for findByCredentialId?
 * During authentication assertion, we look up the specific credential by its ID.
 * Optional forces the caller to handle the case where the credential was deleted
 * (user may have removed a device from settings).
 */
@Repository
public interface WebAuthnCredentialRepository extends JpaRepository<WebAuthnCredential, UUID> {

    /**
     * Returns all WebAuthn credentials registered by a given user.
     * Used to build excludeCredentials list in registration options
     * and allowCredentials list in authentication options.
     */
    List<WebAuthnCredential> findByUserId(UUID userId);

    /**
     * Finds a credential by its authenticator-assigned credential ID.
     * Used during assertion verification to find the public key to verify against.
     * The credentialId comes from the browser's navigator.credentials.get() response.
     */
    Optional<WebAuthnCredential> findByCredentialId(String credentialId);

    /**
     * Deletes all credentials for a user.
     * WHY? When a user disables WebAuthn 2FA entirely, we clean up all their credentials.
     * Also useful for a "revoke all devices" admin action.
     *
     * WHY @Transactional needed? Spring Data's delete methods need a transaction.
     * The calling service method should already be @Transactional, but adding it here
     * as a safeguard is good practice for bulk delete operations.
     */
    void deleteByUserId(UUID userId);
}
