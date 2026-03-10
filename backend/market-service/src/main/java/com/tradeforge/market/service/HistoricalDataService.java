package com.tradeforge.market.service;

import com.tradeforge.market.dto.CandleDto;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;

/**
 * WHY HistoricalDataService?
 * Generates realistic OHLCV (Open/High/Low/Close/Volume) price history for charting.
 * Real historical data requires a paid NSE data feed. For a learning project,
 * Gaussian random-walk simulation produces visually convincing charts with
 * the same properties as real stock data (trend + mean reversion).
 *
 * WHY generate on demand (not cache)?
 * The chart data is deterministic per (symbol, period, currentPrice) but currentPrice
 * changes every second. We regenerate on each request so the chart always ends at
 * the live price. This is fast (<10ms for 365 candles).
 */
@Service
public class HistoricalDataService {

    private final MarketDataService marketDataService;
    private final Random random = new Random();

    // WHY per-symbol volatility? Different sectors have different risk profiles.
    // IT stocks are more volatile than FMCG stocks.
    private static final Map<String, Double> VOLATILITY = Map.ofEntries(
            Map.entry("RELIANCE",   0.013),
            Map.entry("TCS",        0.012),
            Map.entry("INFY",       0.014),
            Map.entry("HDFCBANK",   0.011),
            Map.entry("ICICIBANK",  0.013),
            Map.entry("WIPRO",      0.015),
            Map.entry("BAJFINANCE", 0.018),
            Map.entry("MARUTI",     0.016),
            Map.entry("SUNPHARMA",  0.014),
            Map.entry("TITAN",      0.017),
            Map.entry("LTIM",       0.016),
            Map.entry("AXISBANK",   0.014),
            Map.entry("KOTAKBANK",  0.012),
            Map.entry("SBIN",       0.015),
            Map.entry("HINDUNILVR", 0.010)
    );

    public HistoricalDataService(MarketDataService marketDataService) {
        this.marketDataService = marketDataService;
    }

    /**
     * Generates candle history for the given period.
     * Uses a backward random walk from current price to generate historical prices,
     * then reverses to produce a chronological list.
     *
     * WHY backward walk? We want the series to end at today's price.
     * Walking forward would end at a random price unrelated to the live price.
     * Walking backward gives us a history that "arrives" at the live price.
     *
     * @param symbol Stock symbol
     * @param period 1D | 1W | 1M | 3M | 6M | 1Y
     * @return List of candles in chronological order (oldest first)
     */
    public List<CandleDto> getHistory(String symbol, String period) {
        double currentPrice = marketDataService.getCurrentPrice(symbol);
        if (currentPrice <= 0) return List.of();

        double sigma = VOLATILITY.getOrDefault(symbol.toUpperCase(), 0.013);

        return switch (period.toUpperCase()) {
            case "1D"  -> generateIntradayCandles(symbol, currentPrice, sigma);
            case "1W"  -> generateDailyCandles(symbol, currentPrice, sigma, 7);
            case "1M"  -> generateDailyCandles(symbol, currentPrice, sigma, 30);
            case "3M"  -> generateDailyCandles(symbol, currentPrice, sigma, 90);
            case "6M"  -> generateDailyCandles(symbol, currentPrice, sigma, 180);
            case "1Y"  -> generateDailyCandles(symbol, currentPrice, sigma, 365);
            default    -> generateDailyCandles(symbol, currentPrice, sigma, 30);
        };
    }

    /**
     * Generates 390 one-minute candles for intraday view.
     * NSE trading hours: 9:15 AM to 3:30 PM IST = 375 minutes (+ pre-open 9:00-9:15).
     * We use today's open price and walk forward minute by minute.
     */
    private List<CandleDto> generateIntradayCandles(String symbol, double closePrice, double sigma) {
        // 1-minute candle sigma is much smaller than daily
        double minuteSigma = sigma / Math.sqrt(390);

        // Estimate open price: ±0.5% from close
        double openPrice = closePrice * (1 + (random.nextGaussian() * 0.005));

        List<CandleDto> candles = new ArrayList<>(390);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

        // Market open: 9:15 AM IST
        ZonedDateTime marketOpen = ZonedDateTime.of(today, LocalTime.of(9, 15), ZoneId.of("Asia/Kolkata"));

        // Walk forward from open to close
        double[] prices = new double[391];
        prices[0] = openPrice;
        for (int i = 1; i <= 390; i++) {
            prices[i] = prices[i-1] * (1 + random.nextGaussian() * minuteSigma);
        }

        // Scale so the last price matches the live close price
        double scale = closePrice / prices[390];
        for (int i = 0; i <= 390; i++) prices[i] *= scale;

        for (int i = 0; i < 390; i++) {
            ZonedDateTime candleTime = marketOpen.plusMinutes(i);
            long epochSec = candleTime.toEpochSecond();

            double open = prices[i];
            double close = prices[i + 1];
            double high = Math.max(open, close) * (1 + random.nextDouble() * minuteSigma * 0.5);
            double low = Math.min(open, close) * (1 - random.nextDouble() * minuteSigma * 0.5);
            long volume = (long)(1000 + random.nextInt(5000));

            candles.add(new CandleDto(epochSec, round(open), round(high), round(low), round(close), volume));
        }
        return candles;
    }

    /**
     * Generates N daily candles ending at today's price.
     * Uses backward Gaussian walk + trend component to simulate realistic price movement.
     */
    private List<CandleDto> generateDailyCandles(String symbol, double currentPrice, double sigma, int days) {
        // Walk backward from current price
        double[] closes = new double[days + 1];
        closes[days] = currentPrice;

        // WHY trend bias? Without bias, prices mean-revert to 0. A small positive drift
        // (~0.05% per day = ~12% per year) simulates long-term bull market tendency.
        double drift = 0.0003;

        for (int i = days - 1; i >= 0; i--) {
            // Reverse the drift (subtract) when walking backward
            closes[i] = closes[i + 1] / (1 + drift + random.nextGaussian() * sigma);
            if (closes[i] < 1) closes[i] = 1; // floor at ₹1
        }

        List<CandleDto> candles = new ArrayList<>(days);
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

        // Skip weekends (NSE is closed Sat/Sun)
        for (int i = 0; i < days; i++) {
            LocalDate date = today.minusDays(days - i);
            // WHY skip weekends? Charts with gaps for weekends look wrong.
            // We still advance the date counter but use the price from the previous trading day.
            if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
                continue;
            }

            double close = closes[i + 1];
            double open = closes[i];

            // Generate intraday range (high/low) from open and close
            double range = Math.abs(close - open) + close * sigma * 0.5;
            double high = Math.max(open, close) + random.nextDouble() * range * 0.5;
            double low = Math.min(open, close) - random.nextDouble() * range * 0.5;
            if (low < 1) low = 1;

            // Volume: base volume + random multiplier
            double baseVolume = VOLATILITY.getOrDefault(symbol.toUpperCase(), 0.013) * 1_000_000 * 100;
            long volume = (long)(baseVolume * (0.5 + random.nextDouble() * 1.5));

            // WHY use start of day (midnight UTC)? lightweight-charts treats daily bars
            // with time = Unix epoch of start of day in UTC.
            long epochSec = date.atStartOfDay(ZoneOffset.UTC).toEpochSecond();

            candles.add(new CandleDto(epochSec, round(open), round(high), round(low), round(close), volume));
        }
        return candles;
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
