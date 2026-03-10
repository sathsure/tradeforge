package com.tradeforge.market.controller;

import com.tradeforge.market.dto.CandleDto;
import com.tradeforge.market.dto.CorporateActionDto;
import com.tradeforge.market.dto.OrderBookDto;
import com.tradeforge.market.dto.StockDetailDto;
import com.tradeforge.market.service.HistoricalDataService;
import com.tradeforge.market.service.OrderBookService;
import com.tradeforge.market.service.StockDetailService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * WHY StockDetailController?
 * Provides the deep-dive endpoints consumed by the stock detail slide-out panel.
 * Fundamentals, price history, corporate actions, and order book depth all live here.
 *
 * WHY @RequestMapping("/api/markets")?
 * Extends the existing /api/markets route already registered in the API Gateway.
 * No new gateway route needed — the existing market-service predicate covers it.
 * Example: GET /api/markets/RELIANCE/detail → this controller → StockDetailService
 */
@RestController
@RequestMapping("/api/markets")
public class StockDetailController {

    private final StockDetailService stockDetailService;
    private final HistoricalDataService historicalDataService;
    private final OrderBookService orderBookService;

    public StockDetailController(StockDetailService stockDetailService,
                                  HistoricalDataService historicalDataService,
                                  OrderBookService orderBookService) {
        this.stockDetailService = stockDetailService;
        this.historicalDataService = historicalDataService;
        this.orderBookService = orderBookService;
    }

    /**
     * Returns fundamental analysis data for the stock detail panel.
     * Merges static fundamentals (P/E, ROE, sector) with live price from MarketDataService.
     *
     * WHY merge live price here? The StockDetailDto includes the current price and
     * change% so the panel header shows live data without a separate price call.
     */
    @GetMapping("/{symbol}/detail")
    public ResponseEntity<StockDetailDto> getDetail(@PathVariable String symbol) {
        return stockDetailService.getDetail(symbol.toUpperCase())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Returns OHLCV candle history for lightweight-charts.
     * Period: 1D (intraday 1-min candles), 1W, 1M, 3M, 6M, 1Y (daily candles).
     *
     * WHY epoch seconds? lightweight-charts time axis expects Unix timestamps.
     * CandleDto.time is already epoch seconds — no client-side conversion needed.
     */
    @GetMapping("/{symbol}/history")
    public List<CandleDto> getHistory(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1M") String period) {
        return historicalDataService.getHistory(symbol.toUpperCase(), period);
    }

    /**
     * Returns the list of past corporate actions for the stock.
     * Shown in the "Corporate Actions" tab of the stock detail panel.
     * Includes dividends, stock splits, bonus issues.
     */
    @GetMapping("/{symbol}/corporate-actions")
    public List<CorporateActionDto> getCorporateActions(@PathVariable String symbol) {
        return stockDetailService.getCorporateActions(symbol.toUpperCase());
    }

    /**
     * Returns real-time order book depth (10 bid + 10 ask levels).
     * Each call regenerates the order book with fresh random quantities —
     * simulates the live-changing nature of a real order book.
     */
    @GetMapping("/{symbol}/orderbook")
    public ResponseEntity<OrderBookDto> getOrderBook(@PathVariable String symbol) {
        OrderBookDto book = orderBookService.getOrderBook(symbol.toUpperCase());
        if (book.lastPrice() <= 0) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(book);
    }
}
