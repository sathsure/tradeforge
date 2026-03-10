package com.tradeforge.websocket.dto;

/**
 * WHY a StockTickDto here?
 * The Kafka message from market-service contains the full StockQuoteDto JSON.
 * We deserialize it into this local record before broadcasting via STOMP.
 *
 * WHY not import market-service's StockQuoteDto?
 * Microservices must not share compiled classes — independent JAR files.
 * This local record is websocket-gateway's "anti-corruption layer" —
 * it defines what fields this service cares about from the Kafka message.
 *
 * WHY only these fields (not all of StockQuoteDto)?
 * Angular's WebSocket subscription only needs the tick data to update the price.
 * Less data = smaller message payload = lower bandwidth over many connections.
 */
public record StockTickDto(
        String symbol,
        double price,
        double change,
        double changePercent,
        long volume
) {}
