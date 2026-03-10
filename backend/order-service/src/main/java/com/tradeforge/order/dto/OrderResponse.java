package com.tradeforge.order.dto;

import com.tradeforge.order.entity.Order;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY an OrderResponse DTO separate from the Order entity?
 * The entity has JPA annotations, lazy-loaded relationships, and
 * internal fields we don't want to expose (e.g., updatedAt).
 * The response DTO is a clean, serializable view for the API client.
 *
 * WHY a static factory method fromEntity()?
 * Keeps the mapping logic in one place — the DTO itself.
 * Alternative: ModelMapper or MapStruct (useful for large projects,
 * overkill for a teaching project).
 */
public record OrderResponse(
        UUID id,
        String symbol,
        String orderType,
        String transactionType,
        Integer quantity,
        BigDecimal price,
        String status,
        Integer filledQty,
        BigDecimal avgPrice,
        LocalDateTime placedAt
) {
    /**
     * WHY static factory instead of constructor?
     * Named method makes the intent clear: "create a response from this entity".
     * Constructors don't convey why you're constructing — factory methods do.
     */
    public static OrderResponse fromEntity(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getSymbol(),
                order.getOrderType(),
                order.getTransactionType(),
                order.getQuantity(),
                order.getPrice(),
                order.getStatus(),
                order.getFilledQty(),
                order.getAvgPrice(),
                order.getPlacedAt()
        );
    }
}
