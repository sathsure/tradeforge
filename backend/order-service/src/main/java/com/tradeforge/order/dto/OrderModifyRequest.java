package com.tradeforge.order.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;

/**
 * WHY a separate DTO for modification?
 * A PATCH request should only expose fields that are modifiable.
 * Quantity and price are the only two fields a trader can change on a pending order.
 * Status, symbol, userId, orderType are immutable once placed.
 *
 * WHY nullable fields?
 * PATCH semantics: only update the fields that are provided.
 * If quantity is null, leave it unchanged. Same for price.
 * This lets the frontend send { price: 150.00 } to update price only.
 */
public record OrderModifyRequest(
        @Min(value = 1, message = "Quantity must be at least 1")
        Integer quantity,

        @DecimalMin(value = "0.01", message = "Price must be positive")
        BigDecimal price) {
}
