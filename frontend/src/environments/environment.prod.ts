// environment.prod.ts — PRODUCTION (Render + Vercel)
// These values are your deployed service URLs.
// Update RENDER_APP_NAME with your actual Render service names.

export const environment = {
  production: true,
  apiUrl: 'https://tradeforge-gateway.onrender.com',
  wsUrl: 'wss://tradeforge-ws.onrender.com/ws',
  // WHY wss:// not ws://? In production, HTTPS site cannot make unencrypted
  // WebSocket connections. wss:// is WebSocket over TLS — required for HTTPS pages.
  finnhubKey: ''  // Set via CI/CD secret, not committed to Git
};
