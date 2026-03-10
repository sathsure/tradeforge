package com.tradeforge.auth.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY @Entity for TrustedDevice?
 * The "Trust this device for 30 days" feature stores a SHA-256 fingerprint
 * of userId + User-Agent in DB. When the same browser returns with the cookie,
 * we skip 2FA — reducing friction for frequent traders on their own machines.
 *
 * WHY store in DB instead of Redis?
 * Trusted devices are long-lived (30 days) and user-visible in the settings page.
 * Redis TTL would silently delete them; DB gives us explicit expiry control and
 * lets users revoke specific devices from the UI.
 *
 * Security model:
 * - The device_token is a SHA-256 hash — not a secret by itself.
 * - It is sent via HttpOnly cookie so JavaScript can't read it.
 * - Tied to userId: even if someone grabs the cookie, it only works for
 *   the specific user it was issued for.
 *
 * WHY no Lombok? Consistent with the rest of the project.
 */
@Entity
@Table(name = "trusted_devices", schema = "auth")
public class TrustedDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // WHY @ManyToOne LAZY? Each user can have many trusted devices (laptop, phone, tablet).
    // LAZY avoids loading full User entity when we only need to check device expiry.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // WHY unique? Each device token must map to exactly one user+device combo.
    // Uniqueness enforced at DB level — not just application level.
    @Column(name = "device_token", nullable = false, unique = true)
    private String deviceToken;

    // WHY store deviceName? Settings page shows "MacBook Chrome - trusted since March 2026".
    // Derived from User-Agent string during trust creation.
    @Column(name = "device_name")
    private String deviceName;

    // WHY store ipAddress? Audit trail — user can see which IP registered each device.
    // Supports security investigation: "I didn't trust a device from that IP address".
    @Column(name = "ip_address")
    private String ipAddress;

    // WHY expiresAt not a Redis TTL? We need to display it in settings ("expires in 28 days").
    // Also lets us run a cleanup job: DELETE FROM trusted_devices WHERE expires_at < NOW().
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // WHY no-arg constructor? JPA requires it.
    public TrustedDevice() {}

    private TrustedDevice(UUID id, User user, String deviceToken, String deviceName,
                          String ipAddress, LocalDateTime expiresAt, LocalDateTime createdAt) {
        this.id = id;
        this.user = user;
        this.deviceToken = deviceToken;
        this.deviceName = deviceName;
        this.ipAddress = ipAddress;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    // WHY @PrePersist? Auto-set createdAt before INSERT — never null in DB.
    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // ── Getters & Setters ──────────────────────────────────────────────────
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getDeviceToken() { return deviceToken; }
    public void setDeviceToken(String deviceToken) { this.deviceToken = deviceToken; }

    public String getDeviceName() { return deviceName; }
    public void setDeviceName(String deviceName) { this.deviceName = deviceName; }

    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }

    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    // ── Builder ────────────────────────────────────────────────────────────
    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private UUID id;
        private User user;
        private String deviceToken;
        private String deviceName;
        private String ipAddress;
        private LocalDateTime expiresAt;
        private LocalDateTime createdAt;

        public Builder id(UUID id) { this.id = id; return this; }
        public Builder user(User user) { this.user = user; return this; }
        public Builder deviceToken(String t) { this.deviceToken = t; return this; }
        public Builder deviceName(String n) { this.deviceName = n; return this; }
        public Builder ipAddress(String ip) { this.ipAddress = ip; return this; }
        public Builder expiresAt(LocalDateTime t) { this.expiresAt = t; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }

        public TrustedDevice build() {
            return new TrustedDevice(id, user, deviceToken, deviceName,
                    ipAddress, expiresAt, createdAt);
        }
    }
}
