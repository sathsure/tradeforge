package com.tradeforge.auth.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY @Entity?
 * Maps this class to the auth.user_two_factor_config table.
 * JPA manages its lifecycle: INSERT on save, SELECT on find, UPDATE on merge.
 *
 * WHY a separate entity from User?
 * 2FA config can be absent entirely for users who never enable 2FA.
 * A separate table avoids NULL columns on every row in auth.users.
 * Also: 2FA settings evolve frequently — isolation keeps auth.users schema stable.
 *
 * WHY no Lombok?
 * No Lombok used in this project. Manual getters/setters/builder are explicit,
 * compile cleanly with Java 21, and easier to review in code-review.
 */
@Entity
@Table(name = "user_two_factor_config", schema = "auth")
public class UserTwoFactorConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    // WHY UUID PK? Consistent with other entities. No sequential-integer enumeration risk.
    private UUID id;

    // WHY @OneToOne LAZY? 2FA config is not needed on every User load.
    // LAZY means Hibernate only fetches it when getUser() is explicitly called.
    // Avoids N+1 SELECT when loading lists of users (e.g. admin panel).
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // WHY @Enumerated(STRING)? Stores "EMAIL" not "1" in DB.
    // If enum values are reordered later, STRING stays correct. ORDINAL would silently break.
    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false)
    private TwoFactorMethod method = TwoFactorMethod.NONE;

    @Column(name = "is_enabled", nullable = false)
    private boolean enabled = false;

    // WHY track phone_verified and email_verified separately?
    // A user might configure EMAIL 2FA, verify, then switch to SMS.
    // We know which channels have been verified without re-verification.
    @Column(name = "phone_verified")
    private boolean phoneVerified = false;

    @Column(name = "email_verified")
    private boolean emailVerified = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // WHY no-arg constructor? JPA requires it to instantiate entities from DB rows.
    public UserTwoFactorConfig() {}

    private UserTwoFactorConfig(UUID id, User user, TwoFactorMethod method,
                                boolean enabled, boolean phoneVerified,
                                boolean emailVerified, LocalDateTime createdAt,
                                LocalDateTime updatedAt) {
        this.id = id;
        this.user = user;
        this.method = method;
        this.enabled = enabled;
        this.phoneVerified = phoneVerified;
        this.emailVerified = emailVerified;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    // WHY @PrePersist? Auto-set timestamps before INSERT so callers never forget.
    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    // WHY @PreUpdate? Keeps updatedAt current without requiring callers to set it.
    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters & Setters ──────────────────────────────────────────────────
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public TwoFactorMethod getMethod() { return method; }
    public void setMethod(TwoFactorMethod method) { this.method = method; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isPhoneVerified() { return phoneVerified; }
    public void setPhoneVerified(boolean phoneVerified) { this.phoneVerified = phoneVerified; }

    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    // ── Builder ────────────────────────────────────────────────────────────
    // WHY builder? Many optional fields; builder is self-documenting vs an 8-arg constructor.
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private UUID id;
        private User user;
        private TwoFactorMethod method = TwoFactorMethod.NONE;
        private boolean enabled = false;
        private boolean phoneVerified = false;
        private boolean emailVerified = false;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder id(UUID id) { this.id = id; return this; }
        public Builder user(User user) { this.user = user; return this; }
        public Builder method(TwoFactorMethod method) { this.method = method; return this; }
        public Builder enabled(boolean enabled) { this.enabled = enabled; return this; }
        public Builder phoneVerified(boolean phoneVerified) { this.phoneVerified = phoneVerified; return this; }
        public Builder emailVerified(boolean emailVerified) { this.emailVerified = emailVerified; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }
        public Builder updatedAt(LocalDateTime t) { this.updatedAt = t; return this; }

        public UserTwoFactorConfig build() {
            return new UserTwoFactorConfig(id, user, method, enabled, phoneVerified,
                    emailVerified, createdAt, updatedAt);
        }
    }

    /**
     * WHY enum inside entity?
     * TwoFactorMethod is tightly coupled to UserTwoFactorConfig.
     * Other classes import it as UserTwoFactorConfig.TwoFactorMethod — self-documenting.
     *
     * NONE: 2FA not configured.
     * EMAIL: OTP sent to the user's registered email address.
     * SMS: OTP sent to the user's registered phone number.
     * WEBAUTHN: FIDO2 biometric/hardware key — most secure option.
     */
    public enum TwoFactorMethod {
        NONE,
        EMAIL,
        SMS,
        WEBAUTHN
    }
}
