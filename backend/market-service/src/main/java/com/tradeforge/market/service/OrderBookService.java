package com.tradeforge.market.service;

import com.tradeforge.market.dto.OrderBookDto;
import com.tradeforge.market.dto.OrderBookLevelDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * WHY OrderBookService?
 * Generates realistic market depth (bid/ask order book) for a given stock.
 * Real order book requires an exchange feed (NSE Level 2 data, paid).
 * Simulated depth is functionally identical for UI/learning purposes.
 *
 * WHY L-shaped quantity distribution?
 * In a real order book, there is more quantity close to the current price
 * (market makers and limit traders cluster near the best bid/ask) and
 * less quantity far from the price. The L-shape captures this property.
 *
 * The order book refreshes on each call — randomness simulates real-time changes
 * without needing WebSocket updates for the order book itself.
 */
@Service
public class OrderBookService {

    private final MarketDataService marketDataService;
    private final Random random = new Random();

    // WHY 10 levels? Matches professional terminal depth (NSE Kite shows 5, TWS shows 10).
    private static final int LEVELS = 10;

    public OrderBookService(MarketDataService marketDataService) {
        this.marketDataService = marketDataService;
    }

    public OrderBookDto getOrderBook(String symbol) {
        double lastPrice = marketDataService.getCurrentPrice(symbol);
        if (lastPrice <= 0) {
            return new OrderBookDto(symbol, 0, List.of(), List.of(), 0, 0);
        }

        // Tick size: minimum price movement
        // WHY variable tick size? NSE tick sizes vary by price range.
        // < ₹100: ₹0.05 tick, ₹100-500: ₹0.10, ₹500+: ₹0.25
        double tick = lastPrice < 100 ? 0.05 : lastPrice < 500 ? 0.10 : 0.25;

        List<OrderBookLevelDto> bids = new ArrayList<>(LEVELS);
        List<OrderBookLevelDto> asks = new ArrayList<>(LEVELS);

        long totalBidQty = 0;
        long totalAskQty = 0;

        // Best bid just below last price, best ask just above
        double bestBid = Math.floor(lastPrice / tick) * tick;
        double bestAsk = bestBid + tick;

        for (int i = 0; i < LEVELS; i++) {
            double bidPrice = bestBid - (i * tick);
            double askPrice = bestAsk + (i * tick);

            // L-shaped distribution: more qty at levels close to best bid/ask
            // Factor decreases as we go further from the spread
            double factor = 1.0 / (1 + i * 0.4);

            long bidQty = (long)(baseQty(lastPrice) * factor * (0.6 + random.nextDouble() * 0.8));
            long askQty = (long)(baseQty(lastPrice) * factor * (0.6 + random.nextDouble() * 0.8));

            int bidOrders = (int)(1 + random.nextInt(Math.max(1, (int)(bidQty / 100))));
            int askOrders = (int)(1 + random.nextInt(Math.max(1, (int)(askQty / 100))));

            bids.add(new OrderBookLevelDto(round(bidPrice, tick), bidQty, bidOrders));
            asks.add(new OrderBookLevelDto(round(askPrice, tick), askQty, askOrders));

            totalBidQty += bidQty;
            totalAskQty += askQty;
        }

        return new OrderBookDto(symbol, lastPrice, bids, asks, totalBidQty, totalAskQty);
    }

    /**
     * Base quantity at the best level depends on price (high-priced stocks have lower lot sizes).
     * Approximates how NSE stocks trade (high-value stocks have smaller volumes per tick).
     */
    private long baseQty(double price) {
        if (price > 10000) return 500;
        if (price > 5000)  return 1000;
        if (price > 1000)  return 2000;
        if (price > 500)   return 5000;
        return 10000;
    }

    private double round(double price, double tick) {
        return Math.round(price / tick) * tick;
    }
}
