package com.tradeforge.order.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeforge.order.client.MarketClient;
import com.tradeforge.order.dto.OrderEventDto;
import com.tradeforge.order.dto.OrderModifyRequest;
import com.tradeforge.order.dto.OrderRequest;
import com.tradeforge.order.dto.OrderResponse;
import com.tradeforge.order.entity.Order;
import com.tradeforge.order.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * WHY @Service?
 * Marks this as the business logic layer. Controllers handle HTTP concerns,
 * repositories handle DB concerns, services handle business rules.
 * Separation of concerns: each layer has one responsibility.
 *
 * WHY @Transactional?
 * Spring opens a DB transaction at the start of each method and commits (or
 * rolls back on exception) at the end. Without it, each JPA call is its own
 * transaction — risky if a method makes multiple DB operations that must succeed
 * or fail together.
 */
@Service
@Transactional
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final String ORDER_EVENTS_TOPIC = "order.events";

    private final OrderRepository orderRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final MarketClient marketClient;

    public OrderService(OrderRepository orderRepository,
                        KafkaTemplate<String, String> kafkaTemplate,
                        ObjectMapper objectMapper,
                        MarketClient marketClient) {
        this.orderRepository = orderRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.marketClient = marketClient;
    }

    /**
     * Returns all orders for the given user, newest first.
     *
     * WHY @Transactional(readOnly = true) for reads?
     * Tells Spring (and the DB) this transaction won't modify data.
     * PostgreSQL can optimize read-only transactions — uses read replicas
     * in a clustered setup. Also prevents accidental writes.
     */
    @Transactional(readOnly = true)
    public List<OrderResponse> getOrdersForUser(UUID userId) {
        return orderRepository.findByUserIdOrderByPlacedAtDesc(userId)
                .stream()
                .map(OrderResponse::fromEntity)
                .toList();
    }

    /**
     * Returns a single order by ID for the given user.
     *
     * WHY ResponseStatusException(404)?
     * Spring MVC catches ResponseStatusException and returns the correct HTTP status.
     * No need for a global exception handler for simple cases.
     */
    @Transactional(readOnly = true)
    public OrderResponse getOrderForUser(UUID orderId, UUID userId) {
        return orderRepository.findByIdAndUserId(orderId, userId)
                .map(OrderResponse::fromEntity)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Order not found: " + orderId));
    }

    /**
     * Places a new order for the given user.
     *
     * WHY simulate immediate COMPLETE for MARKET orders?
     * Real order matching engines take milliseconds to fill orders.
     * For Sprint 2, we simulate instant fills so the full portfolio update
     * flow (order → Kafka → portfolio update) can be tested end-to-end.
     * Sprint 3: Implement an order matching engine with state machine transitions.
     *
     * Order flow:
     * 1. Create Order entity from request
     * 2. Save to DB (status = PENDING)
     * 3. Simulate fill (MARKET → COMPLETE immediately, LIMIT stays PENDING)
     * 4. Publish Kafka event if COMPLETE
     * 5. Return OrderResponse
     */
    public OrderResponse placeOrder(OrderRequest request, UUID userId) {
        // Step 1: Build the entity from the request
        Order order = new Order();
        order.setUserId(userId);
        order.setSymbol(request.symbol().toUpperCase());
        order.setOrderType(request.orderType());
        order.setTransactionType(request.transactionType());
        order.setQuantity(request.quantity());
        order.setPrice(request.price());

        // Step 2: Validate LIMIT orders must have a price
        if ("LIMIT".equals(request.orderType()) && request.price() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "LIMIT orders require a price");
        }

        // Step 3: Save in PENDING state first
        order = orderRepository.save(order);
        log.info("Order {} placed: {} {} {} @ {}", order.getId(),
                order.getTransactionType(), order.getQuantity(), order.getSymbol(), order.getPrice());

        // Step 4: Simulate fill
        // MARKET orders: fill immediately at the current live market price.
        // Fetch from market-service so the fill price reflects the actual tick price.
        // WHY call market-service here?
        // MARKET orders must fill at the current market price, not a placeholder.
        // Accurate fill price = accurate portfolio cost basis = correct P&L.
        if ("MARKET".equals(order.getOrderType())) {
            // Prefer live price from market-service; fall back to request price if provided.
            BigDecimal livePrice = marketClient.getLivePrice(order.getSymbol());
            BigDecimal fillPrice = (livePrice != null) ? livePrice
                    : (request.price() != null ? request.price() : BigDecimal.valueOf(100.00));
            log.info("MARKET order fill price for {}: {} (live={}, requested={})",
                    order.getSymbol(), fillPrice, livePrice, request.price());
            order.setStatus("COMPLETE");
            order.setFilledQty(order.getQuantity());
            order.setAvgPrice(fillPrice);
            order = orderRepository.save(order);

            // Step 5: Publish order.completed event to Kafka
            publishOrderEvent(order);
        }

        return OrderResponse.fromEntity(order);
    }

    /**
     * Cancels a PENDING order.
     *
     * WHY only allow cancellation of PENDING orders?
     * Completed or already cancelled orders can't be undone.
     * This matches real exchange rules: once filled, the order is final.
     */
    public OrderResponse cancelOrder(UUID orderId, UUID userId) {
        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Order not found: " + orderId));

        if (!"PENDING".equals(order.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only PENDING orders can be cancelled. Current status: " + order.getStatus());
        }

        order.setStatus("CANCELLED");
        order = orderRepository.save(order);
        log.info("Order {} cancelled", orderId);
        return OrderResponse.fromEntity(order);
    }

    /**
     * Modifies a pending LIMIT/SL order's quantity or price.
     *
     * WHY only PENDING orders?
     * Filled or cancelled orders are final — real exchanges don't allow modification.
     * PENDING orders haven't matched yet so the price/qty can still be amended.
     *
     * WHY not MARKET orders?
     * MARKET orders fill immediately — they're never in PENDING state.
     * By the time the client calls modify, the order is already COMPLETE.
     *
     * WHY PATCH semantics (null = no-change)?
     * The client might want to update only the price without touching quantity.
     * Sending null for a field means "leave it as-is".
     */
    public OrderResponse modifyOrder(UUID orderId, UUID userId, OrderModifyRequest request) {
        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Order not found: " + orderId));

        if (!"PENDING".equals(order.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only PENDING orders can be modified. Current status: " + order.getStatus());
        }
        if ("MARKET".equals(order.getOrderType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "MARKET orders cannot be modified — they fill immediately.");
        }

        if (request.quantity() != null) {
            order.setQuantity(request.quantity());
        }
        if (request.price() != null) {
            order.setPrice(request.price());
        }

        order = orderRepository.save(order);
        log.info("Order {} modified: qty={} price={}", orderId, order.getQuantity(), order.getPrice());
        return OrderResponse.fromEntity(order);
    }

    /**
     * Publishes an 'order.events' Kafka message when an order completes.
     * portfolio-service consumes this to update the user's holdings.
     *
     * WHY private method?
     * Publishing is an internal concern of placeOrder — not a public API.
     * Keeping it private prevents accidental calls from outside.
     *
     * WHY catch JsonProcessingException and log instead of throw?
     * The order is already saved in DB. If Kafka publishing fails,
     * we don't want to roll back the order — it happened.
     * In production, use an outbox pattern (transactional outbox) to guarantee
     * the event is eventually published even if Kafka is temporarily down.
     */
    private void publishOrderEvent(Order order) {
        try {
            OrderEventDto event = new OrderEventDto(
                    order.getId(),
                    order.getUserId(),
                    order.getSymbol(),
                    order.getTransactionType(),
                    order.getQuantity(),
                    order.getAvgPrice(),
                    order.getStatus()
            );
            String json = objectMapper.writeValueAsString(event);
            // WHY userId as Kafka key?
            // All events for the same user go to the same partition.
            // portfolio-service processes them in order — no race conditions
            // on the same user's holdings from concurrent order events.
            kafkaTemplate.send(ORDER_EVENTS_TOPIC, order.getUserId().toString(), json);
            log.info("Published order event for order {}", order.getId());
        } catch (JsonProcessingException e) {
            log.error("Failed to publish order event for order {}: {}", order.getId(), e.getMessage());
        }
    }
}
