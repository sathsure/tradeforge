package com.tradeforge.auth.entity;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * WHY implement UserDetails?
 * Spring Security needs to know: username, password, roles, is account locked?
 * By implementing UserDetails, our User entity IS the security principal.
 * No separate mapping needed — Spring Security uses this directly.
 *
 * WHY @Entity and @Table?
 * @Entity: tells JPA "this class maps to a database table"
 * @Table: specifies which table and which schema (auth.users)
 *
 * WHY no Lombok?
 * Lombok 1.18.30 (bundled with Spring Boot 3.2.3) uses internal javac APIs
 * that were restricted in Java 21+ and fully broken in Java 25.
 * Writing explicit constructors/getters/setters/builder avoids this entirely.
 * It's also clearer — no "magic" annotation processing hiding the actual code.
 */
@Entity
@Table(name = "users", schema = "auth")
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    // WHY UUID? Not sequential integers. Can't enumerate /users/1, /users/2.
    // UUIDs are random 128-bit values — impossible to guess.
    private UUID id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;  // ALWAYS stored as BCrypt hash — NEVER plaintext

    @Column(name = "full_name")
    private String fullName;

    private String phone;

    @Enumerated(EnumType.STRING)
    // WHY EnumType.STRING? Stores "TRADER" not "0" in DB.
    // If you reorder enum values, STRING doesn't break. ORDINAL would.
    private Role role = Role.TRADER;

    @Column(name = "is_active")
    private boolean active = true;

    // WHY emailVerified / phoneVerified on the User entity?
    // Registration now requires the user to confirm ownership of their email or phone.
    // Until at least one is verified the account cannot be used to log in.
    // Stored on users table (not a separate table) because every user has exactly one
    // verification status — no spare rows, no JOIN needed on every login.
    @Column(name = "email_verified")
    private boolean emailVerified = false;

    @Column(name = "phone_verified")
    private boolean phoneVerified = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // WHY explicit no-arg constructor?
    // JPA requires a no-argument constructor to instantiate entities from DB rows.
    // Without it, Hibernate cannot create a User object when reading from DB.
    public User() {}

    // Private all-arg constructor — only used by the Builder below.
    // Private so no code creates User directly; must go through Builder.
    private User(UUID id, String email, String password, String fullName,
                 String phone, Role role, boolean active,
                 boolean emailVerified, boolean phoneVerified,
                 LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.fullName = fullName;
        this.phone = phone;
        this.role = role;
        this.active = active;
        this.emailVerified = emailVerified;
        this.phoneVerified = phoneVerified;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    @PrePersist
    // WHY @PrePersist? Runs before INSERT. Sets timestamps automatically.
    // Never rely on the caller to set createdAt — they might forget.
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    // WHY @PreUpdate? Runs before every UPDATE. Keeps updatedAt current.
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── UserDetails contract methods ──────────────────────────────────────

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // WHY "ROLE_" prefix? Spring Security's hasRole("TRADER") internally
        // checks for "ROLE_TRADER". The prefix is a Spring Security convention.
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getUsername() {
        return email;  // Email is our username
    }

    @Override
    public String getPassword() {
        // WHY explicit override? UserDetails declares getPassword() as abstract.
        // JPA entity has a 'password' field — this bridges the two.
        return password;
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return active; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { return active; }

    // ── Getters ──────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getPhone() { return phone; }
    public Role getRole() { return role; }
    public boolean isActive() { return active; }
    public boolean isEmailVerified() { return emailVerified; }
    public boolean isPhoneVerified() { return phoneVerified; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    // ── Setters ──────────────────────────────────────────────────────────

    public void setId(UUID id) { this.id = id; }
    public void setEmail(String email) { this.email = email; }
    public void setPassword(String password) { this.password = password; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setRole(Role role) { this.role = role; }
    public void setActive(boolean active) { this.active = active; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public void setPhoneVerified(boolean phoneVerified) { this.phoneVerified = phoneVerified; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    // ── Builder ───────────────────────────────────────────────────────────
    // WHY Builder pattern?
    // User has many optional fields (phone, fullName). Calling a 9-arg constructor
    // is error-prone — wrong order = silent bugs.
    // Builder: User.builder().email("x").password("y").build() is self-documenting.

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private UUID id;
        private String email;
        private String password;
        private String fullName;
        private String phone;
        private Role role = Role.TRADER;  // Default: every new user is TRADER
        private boolean active = true;    // Default: every new user is active
        private boolean emailVerified = false; // Default: new users must verify email
        private boolean phoneVerified = false;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder id(UUID id) { this.id = id; return this; }
        public Builder email(String email) { this.email = email; return this; }
        public Builder password(String password) { this.password = password; return this; }
        public Builder fullName(String fullName) { this.fullName = fullName; return this; }
        public Builder phone(String phone) { this.phone = phone; return this; }
        public Builder role(Role role) { this.role = role; return this; }
        public Builder active(boolean active) { this.active = active; return this; }
        public Builder emailVerified(boolean emailVerified) { this.emailVerified = emailVerified; return this; }
        public Builder phoneVerified(boolean phoneVerified) { this.phoneVerified = phoneVerified; return this; }
        public Builder createdAt(LocalDateTime t) { this.createdAt = t; return this; }
        public Builder updatedAt(LocalDateTime t) { this.updatedAt = t; return this; }

        public User build() {
            return new User(id, email, password, fullName, phone, role, active,
                    emailVerified, phoneVerified, createdAt, updatedAt);
        }
    }

    // ── Role enum ─────────────────────────────────────────────────────────
    public enum Role {
        TRADER,   // Regular user — can trade their own account
        ADMIN     // Admin — can view all users, suspend accounts
        // WHY enum inside entity? Role is tightly coupled to User.
        // Keeping it here avoids a separate file for a 2-value enum.
    }
}
