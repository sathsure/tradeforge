// WHY different URLs for prod? The Angular build replaces environment.ts with
// environment.prod.ts at compile time (ng build --configuration production).
// This ensures the production bundle points to cloud services, not localhost.
export const environment = {
  production: true,
  apiUrl: 'https://tradeforge-gateway.onrender.com',
  // WHY wss://? Render serves HTTPS only — WebSocket must use secure wss:// scheme.
  // /ws is the STOMP endpoint registered in WebSocketConfig.java.
  wsUrl: 'wss://tradeforge-websocket.onrender.com/ws',
  // WHY warmupUrls? Each Render free-tier service sleeps independently after 15 min.
  // Pinging only the gateway wakes it but auth-service stays asleep — "Bad Gateway"
  // on first form submit. Listing all service URLs lets app.component.ts wake them all.
  // WHY gateway URLs instead of direct service URLs?
  // Direct service URLs (tradeforge-market.onrender.com) have no CORS headers.
  // Even with mode:'no-cors', Render's load balancer response triggers CORS errors.
  // Routing through the gateway (/api/warmup/*) means CorsWebFilter adds the header,
  // and the gateway internally proxies to the real service — waking it up.
  warmupUrls: [
    'https://tradeforge-gateway.onrender.com/actuator/health',
    'https://tradeforge-gateway.onrender.com/api/warmup/auth',
    'https://tradeforge-gateway.onrender.com/api/warmup/market',
    'https://tradeforge-gateway.onrender.com/api/warmup/order',
    'https://tradeforge-gateway.onrender.com/api/warmup/portfolio',
  ],
};
