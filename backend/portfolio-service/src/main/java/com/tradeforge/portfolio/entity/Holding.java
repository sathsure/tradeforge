package com.tradeforge.portfolio.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY @Entity?
 * Maps to the portfolio.holdings table created by Flyway V1 migration.
 * JPA uses this to generate queries automatically.
 *
 * WHY @Table(schema = "portfolio", name = "holdings")?
 * Specifies the exact DB table including schema name.
 * Without schema, JPA defaults to 'public' — wrong for our multi-schema setup.
 */
@Entity
@Table(schema = "portfolio", name = "holdings")
public class Holding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 20)
    private String symbol;

    @Column(nullable = false)
    private Integer quantity;

    /**
     * WHY BigDecimal for avg_price?
     * Average cost basis must be exact — this affects capital gains calculations.
     * Floating-point rounding would make the tax math wrong.
     *
     * WHY name = "avg_price"?
     * Java field is avgPrice (camelCase), DB column is avg_price (snake_case).
     */
    @Column(name = "avg_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal avgPrice;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ─── Getters and Setters ────────────────────────────────────────────────
    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public BigDecimal getAvgPrice() { return avgPrice; }
    public void setAvgPrice(BigDecimal avgPrice) { this.avgPrice = avgPrice; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
