package com.tradeforge.order.controller;

import com.tradeforge.order.dto.OrderModifyRequest;
import com.tradeforge.order.dto.OrderRequest;
import com.tradeforge.order.dto.OrderResponse;
import com.tradeforge.order.security.JwtUtil;
import com.tradeforge.order.service.OrderService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * WHY @RestController + @RequestMapping("/api/orders")?
 * API Gateway routes all /api/orders/** to this service.
 * Methods use relative paths: "/" = /api/orders, "/{id}" = /api/orders/{id}
 *
 * Sprint 2 vs Sprint 1:
 * - Typed DTOs (OrderRequest, OrderResponse) instead of Map<String, Object>
 * - Extracts userId from JWT for per-user filtering and ownership checks
 * - Delegates business logic to OrderService (not in the controller)
 * - @Valid triggers Bean Validation on request body automatically
 */
@RestController
@RequestMapping("/api/orders")
// WHY no @CrossOrigin? CORS is handled by the API Gateway. Adding it here
// would duplicate the Access-Control-Allow-Origin header → browser rejects.
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    private final OrderService orderService;
    private final JwtUtil jwtUtil;

    public OrderController(OrderService orderService, JwtUtil jwtUtil) {
        this.orderService = orderService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * GET /api/orders
     * Returns all orders for the authenticated user, newest first.
     *
     * WHY @RequestHeader("Authorization")?
     * Angular sends the JWT in the Authorization: Bearer <token> header.
     * We extract userId from the token — not from the URL (that would let users
     * request other users' data by passing a different userId).
     */
    @GetMapping
    public List<OrderResponse> getOrders(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        log.debug("GET /api/orders for user {}", userId);
        return orderService.getOrdersForUser(userId);
    }

    /**
     * GET /api/orders/{id}
     * Get a specific order — only if it belongs to the requesting user.
     */
    @GetMapping("/{id}")
    public OrderResponse getOrder(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        return orderService.getOrderForUser(id, userId);
    }

    /**
     * POST /api/orders
     * Place a new BUY or SELL order.
     *
     * WHY ResponseEntity with 201 CREATED?
     * POST creating a resource should return 201 (not 200).
     * 201 tells Angular the order was successfully created — distinct from
     * 200 (existing resource retrieved) or 202 (accepted, processing).
     */
    @PostMapping
    public ResponseEntity<OrderResponse> placeOrder(
            @Valid @RequestBody OrderRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        log.info("POST /api/orders: {} {} {} for user {}",
                request.transactionType(), request.quantity(), request.symbol(), userId);
        OrderResponse response = orderService.placeOrder(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * DELETE /api/orders/{id}
     * Cancel a PENDING order. Returns the updated order with status=CANCELLED.
     */
    @DeleteMapping("/{id}")
    public OrderResponse cancelOrder(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        return orderService.cancelOrder(id, userId);
    }

    /**
     * PATCH /api/orders/{id}
     * Modifies quantity or price of a pending LIMIT/SL order.
     * Only fields provided (non-null) are updated — PATCH semantics.
     */
    @PatchMapping("/{id}")
    public OrderResponse modifyOrder(
            @PathVariable UUID id,
            @Valid @RequestBody OrderModifyRequest request,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        log.info("PATCH /api/orders/{}: qty={} price={} for user {}", id,
                request.quantity(), request.price(), userId);
        return orderService.modifyOrder(id, userId, request);
    }

    /**
     * WHY a private extractUserId helper?
     * Every endpoint needs the userId from the JWT.
     * Centralizing the extraction logic prevents duplication and ensures
     * consistent error handling (401) across all endpoints.
     */
    private UUID extractUserId(String authHeader) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Missing or invalid Authorization header");
            }
            String token = authHeader.substring(7);
            return jwtUtil.extractUserId(token);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("JWT extraction failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
    }
}
