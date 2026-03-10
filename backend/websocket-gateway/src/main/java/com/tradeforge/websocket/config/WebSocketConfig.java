package com.tradeforge.websocket.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WHY @EnableWebSocketMessageBroker?
 * Enables STOMP WebSocket message handling.
 * STOMP = Simple Text Oriented Messaging Protocol.
 * Adds message routing on top of raw WebSocket:
 * - Angular subscribes to /topic/prices/RELIANCE
 * - Server broadcasts to /topic/prices/* → all subscribed clients receive it
 *
 * WHY SockJS?
 * Raw WebSocket can be blocked by corporate firewalls or old browsers.
 * SockJS falls back to XHR polling if WebSocket is unavailable.
 * Angular's @stomp/stompjs + SockJS handles this transparently.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // WHY /topic prefix? Standard STOMP convention.
        // /topic = one-to-many broadcasts (market ticks → all subscribers)
        // /queue = one-to-one messages (personal alerts)
        registry.enableSimpleBroker("/topic", "/queue");

        // WHY /app prefix? Messages from Angular → Server are prefixed with /app
        // Angular sends to /app/subscribe-symbol
        // Server @MessageMapping("/subscribe-symbol") handles it
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // WHY /ws endpoint? Angular connects to ws://localhost:8088/ws
        // SockJS fallback uses HTTP polling on the same URL
        // WHY no withSockJS()?
        // Angular's @stomp/stompjs Client uses native WebSocket via brokerURL: 'ws://...'
        // SockJS requires HTTP URL + SockJS client library. We use native WS which is
        // simpler and sufficient for localhost dev (SockJS fallback is for corporate firewalls).
        // With SockJS removed, the browser can connect directly via ws://localhost:8088/ws.
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*");
                // WHY allowedOriginPatterns("*")?
                // Development: Angular at localhost:4200 connects to localhost:8088.
    }
}
