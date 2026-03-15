package com.tradeforge.portfolio.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY CashBalance entity?
 * Represents the user's available cash balance — the funds available for trading.
 * Separate from holdings (stocks owned) because cash is a ledger concept, not a position.
 *
 * WHY @Table(schema = "portfolio", name = "cash_balance")?
 * Maps to the portfolio.cash_balance table created by Flyway V3 migration.
 * Same schema as holdings — portfolio-service owns all portfolio data.
 */
@Entity
@Table(schema = "portfolio", name = "cash_balance")
public class CashBalance {

    // WHY @Id without @GeneratedValue?
    // user_id IS the primary key — one row per user, no surrogate key needed.
    // The application sets this explicitly (the userId from the JWT).
    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    // WHY BigDecimal?
    // Financial precision — no floating-point rounding errors on cash amounts.
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal balance;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters and Setters ─────────────────────────────────────────────────
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public BigDecimal getBalance() { return balance; }
    public void setBalance(BigDecimal balance) { this.balance = balance; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
