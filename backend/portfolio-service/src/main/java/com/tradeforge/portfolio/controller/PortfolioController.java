package com.tradeforge.portfolio.controller;

import com.tradeforge.portfolio.dto.HoldingDto;
import com.tradeforge.portfolio.dto.PortfolioResponse;
import com.tradeforge.portfolio.dto.PortfolioSummaryDto;
import com.tradeforge.portfolio.security.JwtUtil;
import com.tradeforge.portfolio.service.PortfolioService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * WHY @RestController + @RequestMapping("/api/portfolio")?
 * API Gateway routes /api/portfolio/** to this service.
 *
 * Sprint 2 vs Sprint 1:
 * - Real PostgreSQL-backed holdings (not mock data)
 * - Live prices fetched from market-service at query time
 * - JWT-based user filtering: users see only their own portfolio
 * - Typed DTOs throughout (HoldingDto, PortfolioSummaryDto, PortfolioResponse)
 */
@RestController
@RequestMapping("/api/portfolio")
// WHY no @CrossOrigin? CORS is handled centrally by the API Gateway's CorsWebFilter.
// Adding it here duplicates the Access-Control-Allow-Origin header → browsers reject it.
public class PortfolioController {

    private static final Logger log = LoggerFactory.getLogger(PortfolioController.class);

    private final PortfolioService portfolioService;
    private final JwtUtil jwtUtil;

    public PortfolioController(PortfolioService portfolioService, JwtUtil jwtUtil) {
        this.portfolioService = portfolioService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * GET /api/portfolio
     * Returns full portfolio: holdings enriched with live prices + summary.
     */
    @GetMapping
    public PortfolioResponse getPortfolio(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        log.debug("GET /api/portfolio for user {}", userId);
        return portfolioService.getPortfolio(userId);
    }

    /**
     * GET /api/portfolio/holdings
     * Returns just the holdings list (without summary).
     */
    @GetMapping("/holdings")
    public List<HoldingDto> getHoldings(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        return portfolioService.getPortfolio(userId).holdings();
    }

    /**
     * GET /api/portfolio/summary
     * Returns just the portfolio summary (total P&L, invested, current value).
     * Used by the dashboard header.
     */
    @GetMapping("/summary")
    public PortfolioSummaryDto getSummary(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        return portfolioService.getPortfolio(userId).summary();
    }

    private UUID extractUserId(String authHeader) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Missing or invalid Authorization header");
            }
            return jwtUtil.extractUserId(authHeader.substring(7));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("JWT extraction failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
    }
}
