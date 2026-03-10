package com.tradeforge.order.repository;

import com.tradeforge.order.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WHY JpaRepository<Order, UUID>?
 * JpaRepository provides CRUD operations out of the box:
 * - save(), findById(), findAll(), delete(), count(), etc.
 * No boilerplate SQL needed for standard operations.
 *
 * WHY @Repository?
 * Optional when extending JpaRepository (Spring detects it automatically),
 * but we include it to make the intent explicit in code — this is a DB access layer.
 *
 * WHY UUID as the ID type?
 * Matches the entity's @Id field type. Spring Data uses this to generate
 * the correct findById() method signature: findById(UUID id).
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {

    /**
     * WHY a custom findByUserIdOrderByPlacedAtDesc?
     * Spring Data JPA generates this SQL from the method name:
     * SELECT * FROM orders.orders WHERE user_id = ? ORDER BY placed_at DESC
     *
     * WHY filter by userId?
     * Users should only see their own orders.
     * Filtering at the DB level is more efficient and secure than loading all
     * orders and filtering in Java.
     *
     * WHY ORDER BY placed_at DESC?
     * Most recent orders appear first — matches the UI requirement.
     */
    List<Order> findByUserIdOrderByPlacedAtDesc(UUID userId);

    /**
     * WHY findByIdAndUserId?
     * Prevents users from accessing other users' orders by ID.
     * If only findById() were used, a user could guess another user's order UUID
     * and retrieve it — a security flaw.
     * Combining both fields ensures the order belongs to the requesting user.
     */
    Optional<Order> findByIdAndUserId(UUID id, UUID userId);
}
