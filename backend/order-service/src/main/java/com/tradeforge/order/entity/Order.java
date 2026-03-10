package com.tradeforge.order.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY @Entity?
 * Marks this class as a JPA entity — mapped to a database table.
 * Spring Data JPA uses this to generate SQL queries automatically.
 *
 * WHY @Table(schema = "orders", name = "orders")?
 * Maps to the 'orders.orders' table created by Flyway migration V1.
 * The schema = "orders" separates this service's data from auth schema.
 *
 * WHY not a record?
 * JPA requires a mutable class with a no-arg constructor.
 * Records are immutable and can't have no-arg constructors — incompatible with JPA.
 * Use records for DTOs (data transfer), not entities (database mapping).
 */
@Entity
@Table(schema = "orders", name = "orders")
public class Order {

    /**
     * WHY @Id + @GeneratedValue with UUID?
     * PostgreSQL generates the UUID using gen_random_uuid() (defined in SQL migration).
     * GenerationType.AUTO with UUID type makes Spring use the DB-level default.
     *
     * WHY @Column(updatable = false)?
     * The ID should never change after creation — defensive constraint.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /**
     * WHY nullable = false?
     * Every order must belong to a user — enforced at both DB and JPA level.
     * The controller extracts userId from the JWT before calling the service.
     */
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, length = 20)
    private String symbol;

    /**
     * WHY name = "order_type"?
     * Java convention: camelCase field name (orderType).
     * SQL convention: snake_case column name (order_type).
     * @Column(name = ...) bridges the two.
     */
    @Column(name = "order_type", nullable = false, length = 10)
    private String orderType;

    @Column(name = "transaction_type", nullable = false, length = 10)
    private String transactionType;

    @Column(nullable = false)
    private Integer quantity;

    /**
     * WHY BigDecimal for price?
     * Financial calculations must never use double/float.
     * Floating-point types have rounding errors (0.1 + 0.2 ≠ 0.3 in binary).
     * BigDecimal provides exact decimal arithmetic — critical for money.
     *
     * WHY nullable?
     * MARKET orders don't have a specified price — they execute at market price.
     */
    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    /**
     * WHY length = 20?
     * Possible values: PENDING, COMPLETE, CANCELLED, REJECTED — all fit in 20 chars.
     */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "filled_qty", nullable = false)
    private Integer filledQty = 0;

    @Column(name = "avg_price", precision = 12, scale = 2)
    private BigDecimal avgPrice;

    /**
     * WHY @Column(updatable = false) for placedAt?
     * Once an order is placed, the timestamp should never change.
     * updatable = false means JPA won't include this field in UPDATE statements.
     *
     * WHY LocalDateTime instead of Instant?
     * Indian markets operate in IST (UTC+5:30). LocalDateTime without timezone
     * is simpler for display. In production, use Instant and convert to IST for UI.
     */
    @Column(name = "placed_at", updatable = false)
    private LocalDateTime placedAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * WHY @PrePersist?
     * Sets timestamps automatically before the entity is first saved.
     * Avoids relying on the DB default (NOW()) for the entity-side value.
     * Both approaches work — @PrePersist keeps the timestamps in the Java layer.
     */
    @PrePersist
    protected void onCreate() {
        placedAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    /**
     * WHY @PreUpdate?
     * Automatically updates updatedAt before every save() call.
     * This tracks when the order status last changed (e.g., PENDING → COMPLETE).
     */
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ─── Getters and Setters ────────────────────────────────────────────────
    // WHY not use Lombok @Data or @Getter/@Setter?
    // Avoiding Lombok keeps dependencies minimal and makes the code explicit.
    // For a learning project, reading explicit getters/setters is educational.

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }
    public String getOrderType() { return orderType; }
    public void setOrderType(String orderType) { this.orderType = orderType; }
    public String getTransactionType() { return transactionType; }
    public void setTransactionType(String transactionType) { this.transactionType = transactionType; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getFilledQty() { return filledQty; }
    public void setFilledQty(Integer filledQty) { this.filledQty = filledQty; }
    public BigDecimal getAvgPrice() { return avgPrice; }
    public void setAvgPrice(BigDecimal avgPrice) { this.avgPrice = avgPrice; }
    public LocalDateTime getPlacedAt() { return placedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
