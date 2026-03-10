package com.tradeforge.market.controller;

import com.tradeforge.market.dto.*;
import com.tradeforge.market.service.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * WHY @RestController?
 * Combines @Controller + @ResponseBody.
 * Every method return value is serialized as JSON automatically by Jackson.
 *
 * WHY @RequestMapping("/api/markets")?
 * All endpoints are prefixed /api/markets — matches API Gateway route Path=/api/markets/**
 *
 * Sprint 3 additions (over Sprint 2):
 * - GET /stocks/screener — fundamental screener for stocks
 * - GET /stocks/{symbol}/detail — full stock detail (fundamentals + corporate actions)
 * - GET /stocks/{symbol}/history — OHLCV history for charting
 * - GET /stocks/{symbol}/orderbook — Level 2 market depth
 * - GET /mutual-funds — MF screener list
 * - GET /mutual-funds/{code}/nav — NAV history for MF chart
 */
@RestController
@RequestMapping("/api/markets")
// WHY no @CrossOrigin? CORS handled centrally by API Gateway CorsWebFilter.
// Adding it here duplicates the Access-Control-Allow-Origin header — browsers reject.
public class MarketController {

    private static final Logger log = LoggerFactory.getLogger(MarketController.class);

    // WHY constructor injection for all services?
    // Makes dependencies explicit and testable — mockable in unit tests without Spring context.
    private final MarketDataService marketDataService;
    private final StockDetailService stockDetailService;
    private final HistoricalDataService historicalDataService;
    private final OrderBookService orderBookService;
    private final MutualFundService mutualFundService;

    public MarketController(
            MarketDataService marketDataService,
            StockDetailService stockDetailService,
            HistoricalDataService historicalDataService,
            OrderBookService orderBookService,
            MutualFundService mutualFundService) {
        this.marketDataService = marketDataService;
        this.stockDetailService = stockDetailService;
        this.historicalDataService = historicalDataService;
        this.orderBookService = orderBookService;
        this.mutualFundService = mutualFundService;
    }

    // ─── Sprint 2 Endpoints (unchanged) ──────────────────────────────────────

    /**
     * GET /api/markets/quotes
     * Returns all stocks or filtered by symbols query param.
     * Example: GET /api/markets/quotes?symbols=RELIANCE,TCS
     */
    @GetMapping("/quotes")
    public List<StockQuoteDto> getQuotes(@RequestParam(required = false) String symbols) {
        log.debug("GET /api/markets/quotes symbols={}", symbols);
        if (symbols == null || symbols.isBlank()) {
            return marketDataService.getAllQuotes();
        }
        Set<String> requested = new HashSet<>(Arrays.asList(symbols.toUpperCase().split(",")));
        return marketDataService.getQuotesBySymbols(requested);
    }

    /**
     * GET /api/markets/quotes/{symbol}
     * Single stock quote. Returns 404 if symbol not found.
     */
    @GetMapping("/quotes/{symbol}")
    public ResponseEntity<StockQuoteDto> getQuote(@PathVariable String symbol) {
        log.debug("GET /api/markets/quotes/{}", symbol);
        return marketDataService.getQuote(symbol)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/markets/search?q=query
     * Quick search by symbol or name prefix.
     */
    @GetMapping("/search")
    public List<StockQuoteDto> search(@RequestParam String q) {
        log.debug("GET /api/markets/search q={}", q);
        return marketDataService.search(q);
    }

    // ─── Sprint 3: Stock Screener ─────────────────────────────────────────────

    /**
     * GET /api/markets/stocks/screener?q=&sector=&sortBy=
     * Fundamental screener — search and filter all stocks by key metrics.
     *
     * WHY separate from /search?
     * /search returns live quote data (price, change, volume).
     * /screener returns fundamental data (PE, ROE, MCap) — different use case.
     * Mixing them would create a bloated DTO used inconsistently.
     *
     * Supported sortBy values: pe_asc, pe_desc, mcap, roe, div_yield, change
     */
    @GetMapping("/stocks/screener")
    public List<StockDetailDto> screener(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sector,
            @RequestParam(required = false) String sortBy) {
        log.debug("GET /api/markets/stocks/screener q={} sector={} sortBy={}", q, sector, sortBy);
        return stockDetailService.search(q, sector, sortBy);
    }

    /**
     * GET /api/markets/stocks/{symbol}/detail
     * Full stock detail: fundamentals + corporate actions.
     *
     * WHY one endpoint for both?
     * The stock detail page needs everything at once — one spinner, one error state.
     * Corporate actions are included in the response via StockDetailService.getCorporateActions().
     */
    @GetMapping("/stocks/{symbol}/detail")
    public ResponseEntity<StockDetailResponse> getStockDetail(@PathVariable String symbol) {
        log.debug("GET /api/markets/stocks/{}/detail", symbol);
        return stockDetailService.getDetail(symbol)
                .map(detail -> {
                    List<CorporateActionDto> actions = stockDetailService.getCorporateActions(symbol);
                    return ResponseEntity.ok(new StockDetailResponse(detail, actions));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * WHY a wrapper record instead of a Map?
     * Type-safe response — Angular knows the exact shape.
     * Jackson serializes record components as camelCase JSON fields.
     */
    public record StockDetailResponse(
            StockDetailDto detail,
            List<CorporateActionDto> corporateActions
    ) {}

    // ─── Sprint 3: Historical Chart Data ─────────────────────────────────────

    /**
     * GET /api/markets/stocks/{symbol}/history?period=1D
     * OHLCV bars for the lightweight-charts candlestick/area chart.
     *
     * WHY path variable for symbol and query param for period?
     * Symbol identifies the resource (URL noun), period is a filter (URL verb/modifier).
     * This is REST best practice: nouns in path, modifiers in query params.
     *
     * Supported periods: 1D, 1W, 1M, 3M, 6M, 1Y, 5Y
     */
    @GetMapping("/stocks/{symbol}/history")
    public ResponseEntity<List<CandleDto>> getHistory(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1M") String period) {
        log.debug("GET /api/markets/stocks/{}/history period={}", symbol, period);
        List<CandleDto> candles = historicalDataService.getHistory(symbol, period);
        if (candles.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(candles);
    }

    // ─── Sprint 3: Order Book Depth ───────────────────────────────────────────

    /**
     * GET /api/markets/stocks/{symbol}/orderbook
     * Level 2 market depth (10 bid + 10 ask levels).
     *
     * WHY simulate on each call (not cache)?
     * Order books change every millisecond in real markets.
     * Caching would show stale data. Generating on each call produces
     * a "fresh" snapshot that feels live to the user.
     */
    @GetMapping("/stocks/{symbol}/orderbook")
    public ResponseEntity<OrderBookDto> getOrderBook(@PathVariable String symbol) {
        log.debug("GET /api/markets/stocks/{}/orderbook", symbol);
        OrderBookDto book = orderBookService.getOrderBook(symbol.toUpperCase());
        if (book.lastPrice() <= 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(book);
    }

    // ─── Sprint 3: Mutual Funds ───────────────────────────────────────────────

    /**
     * GET /api/markets/mutual-funds?q=&category=
     * Mutual fund screener — search by name/AMC and filter by category.
     *
     * WHY /mutual-funds under /api/markets?
     * Mutual funds are a market instrument. Grouping under /markets keeps the
     * API Gateway route simple: Path=/api/markets/** routes everything here.
     * An alternative would be a dedicated mf-service — premature for this sprint.
     *
     * Supported categories: EQUITY, DEBT, HYBRID, INDEX, ELSS (empty = all)
     */
    @GetMapping("/mutual-funds")
    public List<MutualFundDto> getMutualFunds(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category) {
        log.debug("GET /api/markets/mutual-funds q={} category={}", q, category);
        return mutualFundService.searchFunds(q, category);
    }

    /**
     * GET /api/markets/mutual-funds/{code}
     * Single fund detail — same as list item but ensures consistent access.
     */
    @GetMapping("/mutual-funds/{code}")
    public ResponseEntity<MutualFundDto> getMutualFund(@PathVariable String code) {
        log.debug("GET /api/markets/mutual-funds/{}", code);
        return mutualFundService.getFund(code)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/markets/mutual-funds/{code}/nav?period=1Y
     * NAV history for the MF timeline chart.
     *
     * WHY separate from /mutual-funds/{code}?
     * NAV history can be hundreds of data points. Including it in every fund
     * list response would make the screener endpoint very slow.
     * Lazy loading on detail open = better performance.
     *
     * Supported periods: 1Y, 3Y, 5Y
     */
    @GetMapping("/mutual-funds/{code}/nav")
    public ResponseEntity<List<CandleDto>> getMutualFundNav(
            @PathVariable String code,
            @RequestParam(defaultValue = "1Y") String period) {
        log.debug("GET /api/markets/mutual-funds/{}/nav period={}", code, period);
        List<CandleDto> navHistory = mutualFundService.getNavHistory(code, period);
        if (navHistory.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(navHistory);
    }
}
