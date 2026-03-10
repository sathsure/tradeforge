// environment.ts — LOCAL DEVELOPMENT
// WHY environment files?
// Different URLs for local vs deployed.
// ng build → uses environment.ts
// ng build --configuration production → uses environment.prod.ts
// Angular CLI swaps the file at build time — code never needs to change.

export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080',      // API Gateway running locally via Docker
  wsUrl: 'ws://localhost:8088/ws',      // WebSocket Gateway running locally
  finnhubKey: 'demo'                    // Free Finnhub demo key for local dev
};
