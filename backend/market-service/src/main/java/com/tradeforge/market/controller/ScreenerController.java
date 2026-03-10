package com.tradeforge.market.controller;

import com.tradeforge.market.dto.CandleDto;
import com.tradeforge.market.dto.MutualFundDto;
import com.tradeforge.market.dto.StockDetailDto;
import com.tradeforge.market.service.MutualFundService;
import com.tradeforge.market.service.StockDetailService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * WHY ScreenerController?
 * Powers both the Stock Screener (/screener) and MF Screener (/mf-screener) pages.
 * Screener data is search/filter-heavy — separate from the stock detail panel endpoints.
 *
 * WHY @RequestMapping("/api/screener")?
 * A distinct path prefix makes Gateway routing simple:
 * /api/screener/** → lb://market-service (single new gateway route).
 */
@RestController
@RequestMapping("/api/screener")
public class ScreenerController {

    private final StockDetailService stockDetailService;
    private final MutualFundService mutualFundService;

    public ScreenerController(StockDetailService stockDetailService,
                               MutualFundService mutualFundService) {
        this.stockDetailService = stockDetailService;
        this.mutualFundService = mutualFundService;
    }

    /**
     * Returns filtered and sorted stock list for the stock screener.
     *
     * @param q      Free-text search (matches symbol, name, sector)
     * @param sector Filter by sector (ALL or blank = no filter)
     * @param sort   Sort field: pe_asc, pe_desc, mcap_desc, roe_desc, div_desc
     *               Default: mcap_desc (market cap descending — most common screener default)
     *
     * WHY include live price in StockDetailDto?
     * The screener table shows current price and change% — requires live data.
     * StockDetailService.getDetail() merges fundamentals with live MarketDataService price.
     */
    @GetMapping("/stocks")
    public List<StockDetailDto> searchStocks(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "") String sector,
            @RequestParam(defaultValue = "mcap_desc") String sort) {
        return stockDetailService.search(q, sector, sort);
    }

    /**
     * Returns filtered mutual fund list for the MF screener.
     *
     * @param q        Free-text search (matches fund name, AMC name, sub-category)
     * @param category Filter by category: EQUITY, DEBT, HYBRID, INDEX, ALL
     *
     * WHY sort by 1Y returns by default?
     * Users visiting an MF screener are typically looking for recent performance.
     * The sort order in MutualFundService.searchFunds() uses returns1Y descending.
     */
    @GetMapping("/mutual-funds")
    public List<MutualFundDto> searchMutualFunds(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "") String category) {
        return mutualFundService.searchFunds(q, category);
    }

    /**
     * Returns NAV history for a mutual fund — used by the MF chart in the screener.
     *
     * @param code   Fund code (e.g., MIRAE-LARGE-CAP)
     * @param period 1Y, 3Y, 5Y — mapped to days in MutualFundService
     *
     * WHY same CandleDto as stock history?
     * Frontend can reuse the same lightweight-charts rendering component.
     * MF uses area/line chart (open=high=low=close=nav) — the chart component
     * decides series type; the DTO structure is identical.
     */
    @GetMapping("/mutual-funds/{code}/history")
    public List<CandleDto> getMfHistory(
            @PathVariable String code,
            @RequestParam(defaultValue = "1Y") String period) {
        return mutualFundService.getNavHistory(code.toUpperCase(), period);
    }
}
