package com.tradeforge.market.service;

import com.tradeforge.market.dto.StockQuoteDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WHY @Service?
 * Marks this as a Spring-managed service bean.
 * MarketController and PriceSimulatorService both inject this single instance.
 * Spring guarantees a single shared instance (@Service is singleton-scoped by default).
 *
 * WHY not just use a static list in the controller (like Sprint 1)?
 * Sprint 2 has PriceSimulatorService updating prices every second.
 * A shared service with a ConcurrentHashMap is the right place for mutable state
 * shared between the scheduler and the REST controller.
 *
 * Sprint 2 Note:
 * In a production system, stock prices would come from an external data vendor
 * (Finnhub, NSE live feed, etc.). For our dev environment, we simulate realistic
 * price movement using a random walk algorithm.
 */
@Service
public class MarketDataService {

    private static final Logger log = LoggerFactory.getLogger(MarketDataService.class);

    /**
     * WHY ConcurrentHashMap?
     * PriceSimulatorService updates prices on a background thread (@Scheduled).
     * REST controller reads on request threads.
     * ConcurrentHashMap prevents ConcurrentModificationException during simultaneous
     * read + write operations. HashMap would cause data corruption.
     */
    private final Map<String, StockQuoteDto> quotes = new ConcurrentHashMap<>();

    /**
     * WHY inject initial data in the constructor?
     * Ensures quotes map is populated before any request comes in.
     * @PostConstruct would also work, but constructor injection is simpler here
     * since there are no Spring dependencies needed to build this initial data.
     */
    public MarketDataService() {
        initializeStocks();
    }

    /**
     * Returns all stock quotes — used by GET /api/markets/quotes.
     * Returns a new ArrayList so the caller can't modify our internal map.
     */
    public List<StockQuoteDto> getAllQuotes() {
        return new ArrayList<>(quotes.values());
    }

    /**
     * Returns filtered quotes by symbol list — used by GET /api/markets/quotes?symbols=...
     * WHY stream + filter? Efficient functional approach; no manual loop needed.
     */
    public List<StockQuoteDto> getQuotesBySymbols(Set<String> symbols) {
        return quotes.values().stream()
                .filter(q -> symbols.contains(q.symbol()))
                .toList();
    }

    /**
     * Returns a single quote by symbol — used by GET /api/markets/quotes/{symbol}
     * WHY Optional? Caller decides how to handle missing symbols (404, error map, etc.)
     */
    public Optional<StockQuoteDto> getQuote(String symbol) {
        return Optional.ofNullable(quotes.get(symbol.toUpperCase()));
    }

    /**
     * Search stocks by symbol or name prefix (case-insensitive).
     * Used by GET /api/markets/search?q=...
     */
    public List<StockQuoteDto> search(String query) {
        String q = query.toLowerCase();
        return quotes.values().stream()
                .filter(s -> s.symbol().toLowerCase().contains(q)
                        || s.name().toLowerCase().contains(q))
                .toList();
    }

    /**
     * Called by PriceSimulatorService every second to apply a simulated price tick.
     * WHY ConcurrentHashMap.compute?
     * Atomic read-modify-write — prevents race conditions between the scheduler
     * thread and request threads reading the map concurrently.
     */
    public void applyTick(String symbol, double newPrice) {
        quotes.compute(symbol, (k, existing) -> {
            if (existing == null) return null;
            return existing.withNewPrice(newPrice);
        });
    }

    /**
     * Returns the current price for a symbol — used by PriceSimulatorService
     * to calculate the next simulated price based on the current one.
     */
    public double getCurrentPrice(String symbol) {
        StockQuoteDto q = quotes.get(symbol);
        return q != null ? q.price() : 0.0;
    }

    // ─── Seed Data ──────────────────────────────────────────────────────────
    // Top NSE/BSE stocks with realistic prices as of early 2025.
    // WHY not fetch from a real API? This is a local dev environment.
    // The simulator will move these prices realistically after startup.
    private void initializeStocks() {
        addStock("RELIANCE",   "Reliance Industries Ltd",             2847.35, 42.15,  1.50, 4521000, 2861.00, 2798.50, 2810.00, 2805.20);
        addStock("TCS",        "Tata Consultancy Services",           3942.80, -18.40, -0.46, 1234000, 3978.00, 3925.50, 3965.00, 3961.20);
        addStock("INFY",       "Infosys Ltd",                         1847.65, 23.90,  1.31, 3456000, 1858.00, 1821.00, 1825.00, 1823.75);
        addStock("HDFCBANK",   "HDFC Bank Ltd",                       1689.40, -12.35, -0.73, 2890000, 1710.00, 1682.00, 1700.00, 1701.75);
        addStock("ICICIBANK",  "ICICI Bank Ltd",                      1124.75, 8.20,   0.73, 5123000, 1130.00, 1115.00, 1117.00, 1116.55);
        addStock("WIPRO",      "Wipro Ltd",                           548.30,  5.00,   0.92, 2340000, 552.00,  541.00,  543.30,  543.30);
        addStock("BAJFINANCE", "Bajaj Finance Ltd",                   7124.50, -79.30, -1.10, 890000, 7220.00, 7080.00, 7200.00, 7203.80);
        addStock("MARUTI",     "Maruti Suzuki India Ltd",             12480.00, 80.70, 0.65, 432000, 12530.00, 12380.00, 12400.00, 12399.30);
        addStock("SUNPHARMA",  "Sun Pharmaceutical Industries",       1580.25, 6.30,   0.40, 1230000, 1592.00, 1568.00, 1574.00, 1573.95);
        addStock("TITAN",      "Titan Company Ltd",                   3285.60, 27.75,  0.85, 654000,  3300.00, 3255.00, 3260.00, 3257.85);
        addStock("LTIM",       "LTIMindtree Ltd",                     5624.30, 45.20,  0.81, 345000,  5660.00, 5580.00, 5590.00, 5579.10);
        addStock("AXISBANK",   "Axis Bank Ltd",                       1089.75, -8.45,  -0.77, 3210000, 1100.00, 1080.00, 1095.00, 1098.20);
        addStock("KOTAKBANK",  "Kotak Mahindra Bank Ltd",             1742.80, 12.60,  0.73, 1890000, 1758.00, 1730.00, 1732.00, 1730.20);
        addStock("SBIN",       "State Bank of India",                 778.45,  5.30,   0.69, 6780000, 785.00,  770.00,  773.00,  773.15);
        addStock("HINDUNILVR", "Hindustan Unilever Ltd",              2398.50, -18.90, -0.78, 876000, 2420.00, 2390.00, 2415.00, 2417.40);
        // ── Technology ──────────────────────────────────────────────────────
        addStock("HCLTECH",    "HCL Technologies Ltd",               1798.40, 14.20,  0.80, 1120000, 1820.00, 1780.00, 1785.00, 1784.20);
        addStock("TECHM",      "Tech Mahindra Ltd",                  1524.35, -9.45, -0.62, 980000,  1548.00, 1512.00, 1530.00, 1533.80);
        addStock("MPHASIS",    "Mphasis Ltd",                        2845.60, 22.80,  0.81, 234000,  2870.00, 2815.00, 2820.00, 2822.80);
        // ── Banking ─────────────────────────────────────────────────────────
        addStock("INDUSINDBK", "IndusInd Bank Ltd",                  1098.75, -8.20, -0.74, 2340000, 1120.00, 1088.00, 1105.00, 1106.95);
        addStock("PNB",        "Punjab National Bank",                114.80,  0.95,  0.83, 8920000, 117.50,  112.00,  113.85,  113.85);
        addStock("BANKBARODA", "Bank of Baroda",                     247.55,  2.10,  0.86, 5670000, 252.00,  244.00,  245.45,  245.45);
        // ── FMCG ────────────────────────────────────────────────────────────
        addStock("ITC",        "ITC Ltd",                            420.15,  3.45,  0.83, 7890000, 424.00,  415.00,  417.00,  416.70);
        addStock("NESTLEIND",  "Nestle India Ltd",                  22780.00, -185.00,-0.80, 98000,  23200.00,22650.00,22900.00,22965.00);
        addStock("BRITANNIA",  "Britannia Industries Ltd",           4818.50, 38.40,  0.80, 145000,  4860.00, 4775.00, 4780.00, 4780.10);
        // ── Pharma ──────────────────────────────────────────────────────────
        addStock("DRREDDY",    "Dr Reddy's Laboratories",           1248.30, 10.50,  0.85, 412000,  1265.00, 1238.00, 1240.00, 1237.80);
        addStock("CIPLA",      "Cipla Ltd",                         1444.85, -11.20,-0.77, 890000,  1462.00, 1436.00, 1455.00, 1456.05);
        addStock("LUPIN",      "Lupin Ltd",                         1892.40, 16.80,  0.90, 678000,  1910.00, 1872.00, 1876.00, 1875.60);
        // ── Auto ────────────────────────────────────────────────────────────
        addStock("TATAMOTORS", "Tata Motors Ltd",                    902.45,  7.30,  0.82, 3450000, 915.00,  892.00,  895.00,  895.15);
        addStock("BAJAJ-AUTO", "Bajaj Auto Ltd",                    8850.20, -62.50,-0.70, 198000,  8950.00, 8800.00, 8890.00, 8912.70);
        addStock("HEROMOTOCO", "Hero MotoCorp Ltd",                  4785.60, 34.20,  0.72, 289000,  4820.00, 4748.00, 4755.00, 4751.40);
        // ── Energy ──────────────────────────────────────────────────────────
        addStock("NTPC",       "NTPC Ltd",                           382.30,  2.85,  0.75, 4560000, 388.00,  378.00,  379.50,  379.45);
        addStock("POWERGRID",  "Power Grid Corp of India",           344.15, -2.40, -0.69, 3210000, 350.00,  341.00,  346.55,  346.55);
        addStock("COALINDIA",  "Coal India Ltd",                     467.85,  4.20,  0.91, 2890000, 473.00,  461.00,  463.65,  463.65);
        // ── Metals ──────────────────────────────────────────────────────────
        addStock("TATASTEEL",  "Tata Steel Ltd",                     172.40,  1.35,  0.79, 8920000, 175.50,  170.00,  171.05,  171.05);
        addStock("JSWSTEEL",   "JSW Steel Ltd",                      908.75, -7.80, -0.85, 1890000, 922.00,  901.00,  915.55,  916.55);
        addStock("HINDALCO",   "Hindalco Industries Ltd",            627.85,  5.40,  0.87, 3120000, 634.00,  620.00,  622.45,  622.45);
        // ── Consumer / Auto-adjacent ─────────────────────────────────────────
        addStock("ASIANPAINT", "Asian Paints Ltd",                  2598.20, -22.30,-0.85, 765000,  2640.00, 2585.00, 2620.20, 2620.50);

        // ── Technology (additional) ──────────────────────────────────────────
        addStock("PERSISTENT", "Persistent Systems Ltd",            4842.60,  52.40, 1.09, 198000,  4890.00, 4780.00, 4800.00, 4790.20);
        addStock("LTTS",       "L&T Technology Services",           5248.30, -38.20,-0.72, 145000,  5320.00, 5200.00, 5280.00, 5286.50);
        addStock("COFORGE",    "Coforge Ltd",                       7285.40,  84.60, 1.17, 112000,  7350.00, 7180.00, 7210.00, 7200.80);

        // ── Banking & Finance (additional) ──────────────────────────────────
        addStock("FEDERALBNK", "Federal Bank Ltd",                   168.45,   1.30, 0.78, 7820000, 172.00,  165.80,  167.15,  167.15);
        addStock("IDFCFIRSTB", "IDFC First Bank Ltd",                 82.30,  -0.65,-0.78, 9450000,  84.50,   81.20,   82.95,   82.95);
        addStock("BANDHANBNK", "Bandhan Bank Ltd",                   195.80,   1.65, 0.85, 4320000, 199.50,  193.00,  194.15,  194.15);

        // ── FMCG (additional) ───────────────────────────────────────────────
        addStock("MARICO",     "Marico Ltd",                         578.25,   4.80, 0.84, 1560000, 585.00,  571.00,  573.45,  573.45);
        addStock("DABUR",      "Dabur India Ltd",                    524.70,  -3.85,-0.73, 1890000, 532.00,  521.00,  528.55,  528.55);

        // ── Pharma (additional) ─────────────────────────────────────────────
        addStock("BIOCON",     "Biocon Ltd",                         298.45,   2.30, 0.78, 3450000, 304.00,  294.00,  296.15,  296.15);
        addStock("DIVISLAB",   "Divi's Laboratories Ltd",           4820.50,  36.80, 0.77, 312000,  4875.00, 4770.00, 4785.00, 4783.70);

        // ── Financial Services (additional) ─────────────────────────────────
        addStock("CHOLAFIN",   "Cholamandalam Investment & Finance", 1142.35, -9.40,-0.82, 890000,  1162.00, 1130.00, 1151.75, 1151.75);
        addStock("BAJAJFINSV", "Bajaj Finserv Ltd",                 1624.80,  12.40, 0.77, 678000,  1648.00, 1608.00, 1612.40, 1612.40);

        // ── Auto (additional) ───────────────────────────────────────────────
        addStock("EICHERMOT",  "Eicher Motors Ltd",                 4842.75,  38.50, 0.80, 234000,  4895.00, 4790.00, 4808.00, 4804.25);
        addStock("MM",         "Mahindra & Mahindra Ltd",           2820.45,  21.30, 0.76, 1120000, 2854.00, 2795.00, 2802.00, 2799.15);

        // ── Consumer Durables (additional) ──────────────────────────────────
        addStock("VOLTAS",     "Voltas Ltd",                        1485.60,  11.20, 0.76, 456000,  1502.00, 1468.00, 1474.40, 1474.40);
        addStock("HAVELLS",    "Havells India Ltd",                 1724.35, -13.80,-0.79, 567000,  1748.00, 1712.00, 1738.15, 1738.15);

        // ── Energy (additional) ─────────────────────────────────────────────
        addStock("ADANIGREEN", "Adani Green Energy Ltd",            1124.50,   9.80, 0.88, 2340000, 1142.00, 1108.00, 1115.00, 1114.70);
        addStock("TATAPOWER",  "Tata Power Company Ltd",             415.30,   3.20, 0.78, 3780000, 420.00,  410.00,  412.10,  412.10);

        // ── Metals (additional) ─────────────────────────────────────────────
        addStock("VEDL",       "Vedanta Ltd",                        458.25,   4.10, 0.90, 5670000, 465.00,  452.00,  454.15,  454.15);
        addStock("SAIL",       "Steel Authority of India Ltd",        128.40,  -0.95,-0.73, 9870000, 131.00,  126.50,  129.35,  129.35);

        log.info("MarketDataService initialized with {} stocks", quotes.size());
    }

    private void addStock(String symbol, String name, double price, double change,
                          double changePct, long volume, double high, double low,
                          double open, double prevClose) {
        quotes.put(symbol, new StockQuoteDto(symbol, name, price, change, changePct,
                volume, high, low, open, prevClose));
    }
}
