package com.tradeforge.portfolio.service;

import com.tradeforge.portfolio.dto.*;
import com.tradeforge.portfolio.entity.CashBalance;
import com.tradeforge.portfolio.entity.Holding;
import com.tradeforge.portfolio.repository.CashBalanceRepository;
import com.tradeforge.portfolio.repository.HoldingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * WHY @Service?
 * Business logic layer — separate from controller (HTTP) and repository (DB).
 * PortfolioService: loads holdings from DB + enriches with live prices from market-service.
 *
 * Key responsibility: join data from two sources:
 * 1. PostgreSQL (portfolio schema): user's holdings — quantity and cost basis
 * 2. market-service REST API: live prices, day change, company names
 *
 * WHY not store live prices in portfolio DB?
 * Stock prices change every second. Storing them in DB creates:
 * - Stale data between updates
 * - Race conditions with price updates
 * - Unnecessary writes (15 stocks × N users × every second = huge write volume)
 * Correct approach: DB stores the stable cost basis, REST fetches live prices at query time.
 */
@Service
@Transactional
public class PortfolioService {

    private static final Logger log = LoggerFactory.getLogger(PortfolioService.class);

    // WHY ₹0 default?
    // New users should see ₹0 available cash until they explicitly add funds.
    // Showing ₹1L by default was confusing — it implied funds were already deposited.
    // Users add their own cash via POST /api/portfolio/cash/deposit, which persists to the DB.
    private static final BigDecimal DEFAULT_STARTING_BALANCE = new BigDecimal("0.00");

    private final HoldingRepository holdingRepository;
    private final CashBalanceRepository cashBalanceRepository;
    private final RestTemplate restTemplate;

    @Value("${market-service.url:http://localhost:8083}")
    private String marketServiceUrl;

    public PortfolioService(HoldingRepository holdingRepository,
                            CashBalanceRepository cashBalanceRepository,
                            RestTemplate restTemplate) {
        this.holdingRepository = holdingRepository;
        this.cashBalanceRepository = cashBalanceRepository;
        this.restTemplate = restTemplate;
    }

    /**
     * Deposits cash into the user's portfolio balance.
     *
     * WHY upsert logic (find + create if absent)?
     * First-time users won't have a cash_balance row yet.
     * On first deposit, we create the row with (DEFAULT_STARTING_BALANCE + amount).
     * On subsequent deposits, we add to the existing balance.
     *
     * WHY return BigDecimal?
     * Controller returns the new balance to Angular so the store updates immediately.
     * No need for a second GET /portfolio call just to refresh the balance.
     *
     * @param userId UUID of the user making the deposit
     * @param amount Amount in INR to add to the cash balance
     * @return Updated available balance after the deposit
     */
    public BigDecimal depositCash(UUID userId, BigDecimal amount) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Deposit amount must be positive");
        }

        CashBalance cashBalance = cashBalanceRepository.findById(userId)
                .orElseGet(() -> {
                    // WHY start from DEFAULT_STARTING_BALANCE for first deposit?
                    // User already had ₹1L simulated balance. First real deposit ADDS to it.
                    // This keeps the portfolio consistent — existing holdings are still covered.
                    CashBalance cb = new CashBalance();
                    cb.setUserId(userId);
                    cb.setBalance(BigDecimal.ZERO); // first deposit starts from ₹0
                    return cb;
                });

        cashBalance.setBalance(cashBalance.getBalance().add(amount));
        cashBalanceRepository.save(cashBalance);
        log.info("Cash deposit: user={} amount={} newBalance={}", userId, amount, cashBalance.getBalance());
        return cashBalance.getBalance().setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Returns the full portfolio for a user: holdings enriched with live prices + summary.
     *
     * WHY readOnly = true here?
     * This method only reads data. @Transactional(readOnly=true) tells JPA not to
     * dirty-check entities and tells the DB driver this transaction is read-only.
     */
    @Transactional(readOnly = true)
    public PortfolioResponse getPortfolio(UUID userId) {
        List<Holding> holdings = holdingRepository.findByUserId(userId);

        // Read cash balance from DB (or fall back to default for new users)
        BigDecimal availableBalance = cashBalanceRepository.findById(userId)
                .map(CashBalance::getBalance)
                .orElse(DEFAULT_STARTING_BALANCE);

        if (holdings.isEmpty()) {
            return new PortfolioResponse(List.of(), emptyPortfolioSummary(availableBalance));
        }

        // Build comma-separated symbol list for market-service query
        String symbols = holdings.stream()
                .map(Holding::getSymbol)
                .collect(Collectors.joining(","));

        // Fetch live prices from market-service
        // WHY call market-service synchronously?
        // Users expect up-to-date P&L when they open the portfolio page.
        // Stale cached data would show wrong gains/losses.
        Map<String, MarketQuoteDto> quotesBySymbol = fetchQuotes(symbols);

        // Enrich holdings with live market data
        List<HoldingDto> holdingDtos = holdings.stream()
                .map(h -> enrichHolding(h, quotesBySymbol))
                .toList();

        PortfolioSummaryDto summary = computeSummary(holdingDtos, availableBalance);
        return new PortfolioResponse(holdingDtos, summary);
    }

    /**
     * Updates holdings when an order completes.
     * Called by OrderEventConsumer when 'order.events' Kafka message arrives.
     *
     * BUY logic: increase quantity, recalculate weighted average price
     * SELL logic: decrease quantity, keep avg price (cost basis unchanged)
     *
     * WHY weighted average for BUY?
     * If you own 10 RELIANCE @ ₹2800 and buy 5 more @ ₹2900:
     * newAvgPrice = (10 × 2800 + 5 × 2900) / 15 = ₹2833.33
     * Simple average (2850) would be wrong — it ignores quantity weighting.
     *
     * WHY delete holding when quantity reaches 0?
     * A holding of 0 shares is meaningless. Keeping it would clutter the portfolio
     * and create confusion (showing stocks you don't own).
     */
    public void updateHolding(UUID userId, String symbol, String transactionType,
                               int quantity, BigDecimal avgFillPrice) {
        Optional<Holding> existingOpt = holdingRepository.findByUserIdAndSymbol(userId, symbol);

        if ("BUY".equals(transactionType)) {
            Holding holding = existingOpt.orElseGet(() -> {
                Holding h = new Holding();
                h.setUserId(userId);
                h.setSymbol(symbol);
                h.setQuantity(0);
                h.setAvgPrice(BigDecimal.ZERO);
                return h;
            });

            // Weighted average price calculation:
            // newAvgPrice = (existingQty × existingAvg + newQty × fillPrice) / totalQty
            int existingQty = holding.getQuantity();
            BigDecimal existingValue = holding.getAvgPrice().multiply(BigDecimal.valueOf(existingQty));
            BigDecimal newValue = avgFillPrice.multiply(BigDecimal.valueOf(quantity));
            int totalQty = existingQty + quantity;
            BigDecimal newAvg = existingValue.add(newValue)
                    .divide(BigDecimal.valueOf(totalQty), 2, RoundingMode.HALF_UP);

            holding.setQuantity(totalQty);
            holding.setAvgPrice(newAvg);
            holdingRepository.save(holding);
            log.info("Updated holding for user {} symbol {}: qty={} avgPrice={}", userId, symbol, totalQty, newAvg);

        } else if ("SELL".equals(transactionType)) {
            existingOpt.ifPresent(holding -> {
                int newQty = holding.getQuantity() - quantity;
                if (newQty <= 0) {
                    holdingRepository.delete(holding);
                    log.info("Deleted holding for user {} symbol {} (fully sold)", userId, symbol);
                } else {
                    holding.setQuantity(newQty);
                    holdingRepository.save(holding);
                    log.info("Updated holding for user {} symbol {}: qty={}", userId, symbol, newQty);
                }
            });
        }
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * WHY a separate fetchQuotes method?
     * Single responsibility: isolates the market-service HTTP call.
     * If market-service is down, this method can return an empty map (graceful degradation)
     * and the portfolio will show without live prices (shows avgPrice as currentPrice).
     */
    private Map<String, MarketQuoteDto> fetchQuotes(String symbols) {
        try {
            String url = marketServiceUrl + "/api/markets/quotes?symbols=" + symbols;
            List<MarketQuoteDto> quotes = restTemplate.exchange(
                    url, HttpMethod.GET, null,
                    new ParameterizedTypeReference<List<MarketQuoteDto>>() {}
            ).getBody();

            if (quotes == null) return Map.of();

            return quotes.stream()
                    .collect(Collectors.toMap(MarketQuoteDto::symbol, q -> q));
        } catch (Exception e) {
            log.warn("Failed to fetch live prices from market-service: {}. " +
                    "Falling back to cost basis as current price.", e.getMessage());
            return Map.of();
        }
    }

    /**
     * WHY enrichHolding?
     * Combines DB data (quantity, avgPrice) with live market data (currentPrice, dayChange).
     * Computes P&L which the DB doesn't store — it's always calculated fresh.
     */
    private HoldingDto enrichHolding(Holding holding, Map<String, MarketQuoteDto> quotes) {
        MarketQuoteDto quote = quotes.get(holding.getSymbol());

        // Graceful degradation: if market-service didn't return this symbol,
        // use avgPrice as currentPrice (shows 0 P&L, better than an error)
        BigDecimal currentPrice = quote != null ? quote.price() : holding.getAvgPrice();
        String name = quote != null ? quote.name() : holding.getSymbol();
        BigDecimal dayChange = quote != null ? quote.change() : BigDecimal.ZERO;
        BigDecimal dayChangePct = quote != null ? quote.changePercent() : BigDecimal.ZERO;

        BigDecimal totalInvested = holding.getAvgPrice()
                .multiply(BigDecimal.valueOf(holding.getQuantity()));
        BigDecimal totalCurrent = currentPrice
                .multiply(BigDecimal.valueOf(holding.getQuantity()));
        BigDecimal pnl = totalCurrent.subtract(totalInvested);
        BigDecimal pnlPct = totalInvested.compareTo(BigDecimal.ZERO) > 0
                ? pnl.divide(totalInvested, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        return new HoldingDto(
                holding.getSymbol(),
                name,
                holding.getQuantity(),
                holding.getAvgPrice().setScale(2, RoundingMode.HALF_UP),
                currentPrice.setScale(2, RoundingMode.HALF_UP),
                pnl.setScale(2, RoundingMode.HALF_UP),
                pnlPct.setScale(2, RoundingMode.HALF_UP),
                dayChange.setScale(2, RoundingMode.HALF_UP),
                dayChangePct.setScale(2, RoundingMode.HALF_UP)
        );
    }

    /**
     * WHY computeSummary?
     * Aggregates all holdings into a single summary for the portfolio header.
     * Computed from holdings list (not DB) — always consistent with the enriched data.
     */
    private PortfolioSummaryDto computeSummary(List<HoldingDto> holdings, BigDecimal availableBalance) {
        BigDecimal totalInvested = holdings.stream()
                .map(h -> h.averagePrice().multiply(BigDecimal.valueOf(h.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal currentValue = holdings.stream()
                .map(h -> h.currentPrice().multiply(BigDecimal.valueOf(h.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalPnl = currentValue.subtract(totalInvested);
        BigDecimal totalPnlPct = totalInvested.compareTo(BigDecimal.ZERO) > 0
                ? totalPnl.divide(totalInvested, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        BigDecimal dayPnl = holdings.stream()
                .map(h -> h.dayChange().multiply(BigDecimal.valueOf(h.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Day P&L % relative to previous day's portfolio value (currentValue - dayPnl)
        BigDecimal prevValue = currentValue.subtract(dayPnl);
        BigDecimal dayPnlPct = prevValue.compareTo(BigDecimal.ZERO) > 0
                ? dayPnl.divide(prevValue, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                : BigDecimal.ZERO;

        return new PortfolioSummaryDto(
                totalInvested.setScale(2, RoundingMode.HALF_UP),
                currentValue.setScale(2, RoundingMode.HALF_UP),
                totalPnl.setScale(2, RoundingMode.HALF_UP),
                totalPnlPct.setScale(2, RoundingMode.HALF_UP),
                dayPnl.setScale(2, RoundingMode.HALF_UP),
                dayPnlPct.setScale(2, RoundingMode.HALF_UP),
                availableBalance.setScale(2, RoundingMode.HALF_UP)
        );
    }

    private PortfolioSummaryDto emptyPortfolioSummary(BigDecimal availableBalance) {
        // WHY pass availableBalance in? New users with no holdings still have their cash.
        // Shows correct deposited funds even when the holdings list is empty.
        return new PortfolioSummaryDto(
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                availableBalance.setScale(2, RoundingMode.HALF_UP)
        );
    }
}
