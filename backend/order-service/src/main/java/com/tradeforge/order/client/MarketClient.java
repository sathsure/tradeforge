package com.tradeforge.order.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Map;

/**
 * WHY a dedicated MarketClient?
 * Encapsulates all HTTP communication with market-service in one place.
 * OrderService stays focused on order business logic — not HTTP details.
 * If the market-service URL or API changes, only this class needs updating.
 *
 * WHY call market-service for MARKET order prices?
 * MARKET orders must fill at the current market price, not a hardcoded value.
 * Using the real price ensures portfolio holdings show accurate cost basis
 * and P&L calculations are correct.
 *
 * WHY fallback to null on error?
 * If market-service is down, we still want the order to succeed.
 * OrderService will use the request price if provided, or the last known price.
 * The alternative (throwing) would block all MARKET orders during market-service outage.
 */
@Component
public class MarketClient {

    private static final Logger log = LoggerFactory.getLogger(MarketClient.class);

    private final RestTemplate restTemplate;

    // WHY market-service.url? Matches the config key in application.yml so cloud
    // deployment can inject MARKET_SERVICE_URL (Render URL) without code changes.
    @Value("${market-service.url:http://localhost:8083}")
    private String marketServiceUrl;

    public MarketClient(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * Fetches the current last traded price for a stock symbol.
     * Calls GET /api/markets/quotes/{symbol} on market-service.
     *
     * WHY @SuppressWarnings("unchecked")?
     * RestTemplate returns a raw Map when the response is a JSON object.
     * The cast is safe here — we know market-service always returns a Map.
     *
     * @param symbol stock ticker (e.g. "RELIANCE")
     * @return current price or null if market-service is unreachable
     */
    @SuppressWarnings("unchecked")
    public BigDecimal getLivePrice(String symbol) {
        try {
            String url = marketServiceUrl + "/api/markets/quotes/" + symbol;
            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            if (response != null && response.containsKey("price")) {
                Object price = response.get("price");
                if (price instanceof Number) {
                    return BigDecimal.valueOf(((Number) price).doubleValue());
                }
            }
            log.warn("Could not parse price from market-service response for {}", symbol);
            return null;
        } catch (Exception e) {
            log.warn("Failed to fetch live price for {} from market-service: {}", symbol, e.getMessage());
            return null;
        }
    }
}
