package com.tradeforge.market.controller;

import com.tradeforge.market.dto.PriceAlertDto;
import com.tradeforge.market.security.JwtUtil;
import com.tradeforge.market.service.MarketDataService;
import com.tradeforge.market.service.PriceAlertService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WHY PriceAlertController?
 * Provides CRUD for user price alerts (set a target, get notified when crossed).
 * This is the only controller in market-service that requires authentication —
 * alerts are user-specific, so we must know the userId from the JWT.
 *
 * WHY manual JWT extraction instead of a security filter?
 * Keeps the security model consistent with order-service.
 * The API Gateway already validates the JWT; we only extract the userId claim.
 * Full filter-based auth is a Sprint 4 enhancement (defense-in-depth).
 *
 * WHY @RequestMapping("/api/alerts")?
 * Separate prefix → separate gateway route → isolated from market-service's
 * existing /api/markets routes. Easier to add auth middleware later.
 */
@RestController
@RequestMapping("/api/alerts")
public class PriceAlertController {

    private final PriceAlertService priceAlertService;
    private final MarketDataService marketDataService;
    private final JwtUtil jwtUtil;

    public PriceAlertController(PriceAlertService priceAlertService,
                                 MarketDataService marketDataService,
                                 JwtUtil jwtUtil) {
        this.priceAlertService = priceAlertService;
        this.marketDataService = marketDataService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * Returns all active alerts for the authenticated user.
     * WHY include priceAtCreation? The UI can show "Alert set when price was ₹2847".
     * Useful context for the user to remember why they set the alert.
     */
    @GetMapping
    public ResponseEntity<List<PriceAlertDto>> getAlerts(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(priceAlertService.getAlerts(userId.toString()));
    }

    /**
     * Creates a new price alert.
     * Body: { "symbol": "RELIANCE", "targetPrice": 2900.0, "condition": "ABOVE" }
     *
     * WHY capture priceAtCreation?
     * Stored on the alert so the notification can say "RELIANCE crossed ₹2900 (was ₹2847 when set)".
     * Fetched from live MarketDataService at creation time.
     *
     * WHY 400 if symbol not found?
     * Alerts for unknown symbols would never fire — better to reject upfront.
     */
    @PostMapping
    public ResponseEntity<PriceAlertDto> createAlert(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody Map<String, Object> body) {

        UUID userId = extractUserId(authHeader);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String symbol = ((String) body.get("symbol")).toUpperCase();
        double targetPrice = ((Number) body.get("targetPrice")).doubleValue();
        String condition = ((String) body.get("condition")).toUpperCase();

        // WHY validate condition? Only ABOVE and BELOW are supported.
        if (!condition.equals("ABOVE") && !condition.equals("BELOW")) {
            return ResponseEntity.badRequest().build();
        }

        // WHY check if symbol exists? Alerts for unknown symbols would never fire.
        double currentPrice = marketDataService.getCurrentPrice(symbol);
        if (currentPrice <= 0) return ResponseEntity.badRequest().build();

        PriceAlertDto created = priceAlertService.addAlert(
                userId.toString(), symbol, targetPrice, condition, currentPrice);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Deletes a price alert by ID.
     * WHY 404 if not found? Standard REST semantics — DELETE on a non-existent resource = 404.
     * The alert may have already fired (one-shot) or never existed.
     */
    @DeleteMapping("/{alertId}")
    public ResponseEntity<Void> deleteAlert(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String alertId) {

        UUID userId = extractUserId(authHeader);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        boolean removed = priceAlertService.removeAlert(userId.toString(), alertId);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    /**
     * WHY a private helper?
     * Avoids repeating the "Bearer " stripping + JWT parsing in every method.
     * Returns null on any exception so callers can return 401 cleanly.
     *
     * WHY return null instead of throwing?
     * Throwing would require a try/catch in every endpoint or an @ExceptionHandler.
     * Null check is simpler given we only have 3 endpoints.
     */
    private UUID extractUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        try {
            return jwtUtil.extractUserId(authHeader.substring(7));
        } catch (Exception e) {
            return null;
        }
    }
}
