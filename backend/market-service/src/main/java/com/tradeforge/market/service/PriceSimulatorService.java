package com.tradeforge.market.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tradeforge.market.dto.StockQuoteDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Random;

/**
 * WHY a price simulator?
 * In production, you'd subscribe to a live NSE/BSE data feed or use
 * a vendor like Finnhub. For local development, we simulate realistic
 * price movement so we can test the full WebSocket pipeline end-to-end
 * without paying for a live data subscription.
 *
 * WHY @Service + @Scheduled?
 * Spring's task scheduler runs the annotated method on a fixed timer.
 * @EnableScheduling (in the Application class or config) activates it.
 *
 * How the price simulation works:
 * Random walk with drift — each tick applies a small random Gaussian change
 * (±0.05% of current price). This mimics realistic intraday volatility.
 * We don't let prices drift more than ±3% from the previous close
 * to keep the simulation grounded.
 */
@Service
public class PriceSimulatorService {

    private static final Logger log = LoggerFactory.getLogger(PriceSimulatorService.class);

    // WHY Random?
    // ThreadLocalRandom would be safer in multi-threaded contexts, but since this
    // service runs on a single scheduler thread, java.util.Random is fine.
    private final Random random = new Random();

    /**
     * WHY these constants?
     * VOLATILITY: 0.0005 = ±0.05% per tick. With ticks every 1 second,
     * this gives ~3.5% daily volatility — realistic for large-cap Indian stocks.
     * MAX_DRIFT_PCT: Caps how far the price can move from previous close (3%).
     * Prevents prices from drifting to absurd values during a long dev session.
     */
    private static final double VOLATILITY = 0.0005;
    private static final double MAX_DRIFT_PCT = 0.03;

    private static final String MARKET_TICKS_TOPIC = "market.ticks";

    private final MarketDataService marketDataService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    // WHY PriceAlertService here? Each tick needs to fire any matching user alerts.
    // We check after applyTick so the new price is committed before comparison.
    private final PriceAlertService priceAlertService;

    /**
     * WHY constructor injection (not @Autowired)?
     * Constructor injection makes dependencies explicit and testable.
     * Spring auto-wires when there's a single constructor.
     */
    public PriceSimulatorService(MarketDataService marketDataService,
                                  KafkaTemplate<String, String> kafkaTemplate,
                                  ObjectMapper objectMapper,
                                  PriceAlertService priceAlertService) {
        this.marketDataService = marketDataService;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.priceAlertService = priceAlertService;
    }

    /**
     * WHY fixedRate = 1000?
     * Publishes one price tick per stock per second.
     * Matches a real trading terminal's refresh rate.
     * Angular receives updates via WebSocket at the same pace.
     *
     * WHY not fixedDelay?
     * fixedDelay waits for the method to complete before counting delay.
     * fixedRate fires at a consistent wall-clock interval, so the schedule
     * stays regular even if a tick takes 50ms to publish.
     *
     * WHY fixedRateString? Reads from config property so cloud deployment can slow down
     * to 300000ms (5 min) to stay within Upstash Kafka free tier (10K messages/day).
     * Local default stays 1000ms.
     */
    @Scheduled(fixedRateString = "${price.simulator.fixed-rate:1000}")
    public void publishTicks() {
        List<StockQuoteDto> quotes = marketDataService.getAllQuotes();
        for (StockQuoteDto quote : quotes) {
            double currentPrice = quote.price();
            double previousClose = quote.previousClose();

            // Random walk: Gaussian random with mean=0, std=VOLATILITY
            double change = currentPrice * VOLATILITY * random.nextGaussian();

            // Cap drift from previous close to ±MAX_DRIFT_PCT
            double newPrice = currentPrice + change;
            double maxPrice = previousClose * (1 + MAX_DRIFT_PCT);
            double minPrice = previousClose * (1 - MAX_DRIFT_PCT);
            newPrice = Math.min(Math.max(newPrice, minPrice), maxPrice);

            // Round to 2 decimal places — matches real exchange tick size
            newPrice = Math.round(newPrice * 100.0) / 100.0;

            // Update in-memory state so REST API always returns fresh prices
            marketDataService.applyTick(quote.symbol(), newPrice);

            // WHY check alerts here? After each tick, evaluate if any user alert conditions
            // have been met. Fired alerts are published to Kafka and removed (one-shot).
            priceAlertService.checkAlerts(quote.symbol(), newPrice);

            // Get the updated quote (with recalculated change/changePercent)
            marketDataService.getQuote(quote.symbol()).ifPresent(updated -> {
                try {
                    // WHY JSON string as Kafka value?
                    // Kafka messages are byte arrays. JSON is a universal format
                    // that any consumer (WebSocket gateway) can deserialize.
                    // Alternative: Avro (schema registry) — overkill for dev.
                    String json = objectMapper.writeValueAsString(updated);

                    // WHY use symbol as the Kafka key?
                    // Kafka partitions messages by key. Same symbol → same partition → ordered delivery.
                    // All ticks for RELIANCE are consumed in order by the WebSocket gateway.
                    kafkaTemplate.send(MARKET_TICKS_TOPIC, updated.symbol(), json);
                } catch (JsonProcessingException e) {
                    log.error("Failed to serialize tick for {}: {}", quote.symbol(), e.getMessage());
                }
            });
        }
    }
}
