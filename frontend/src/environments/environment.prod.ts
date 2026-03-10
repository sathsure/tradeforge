// WHY different URLs for prod? The Angular build replaces environment.ts with
// environment.prod.ts at compile time (ng build --configuration production).
// This ensures the production bundle points to cloud services, not localhost.
export const environment = {
  production: true,
  apiUrl: 'https://tradeforge-gateway.onrender.com',
  wsUrl: 'https://tradeforge-websocket.onrender.com',
};
