// environment.ts — LOCAL DEVELOPMENT
// WHY environment files?
// Different URLs for local vs deployed.
// ng build → uses environment.ts
// ng build --configuration production → uses environment.prod.ts
// Angular CLI swaps the file at build time — code never needs to change.

export const environment = {
  production: false,
  apiUrl: 'https://tradeforge-gateway.onrender.com',  // Deployed API Gateway on Render
  wsUrl: 'wss://tradeforge-websocket.onrender.com/ws', // Deployed WebSocket Gateway on Render
  finnhubKey: 'demo'
};
