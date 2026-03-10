// WHY Market Actions?
// Every interaction with market data is modeled as an action:
// - "User opened watchlist" → MarketActions.loadWatchlist
// - "WebSocket pushed a tick" → MarketActions.priceTickReceived
// - "User searched for INFY" → MarketActions.searchSymbol
//
// This event-driven model makes the app auditable:
// You can replay the action log and see exactly what market data was received and when.
// Critical for debugging "why did the order trigger at that price?"

import { createActionGroup, emptyProps, props } from '@ngrx/store';

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

export const MarketActions = createActionGroup({
  source: 'Market',
  events: {

    // ── Watchlist Loading ────────────────────────────────────────────────
    'Load Watchlist': emptyProps(),
    // Dispatched when user navigates to Markets or Dashboard loads

    'Load Watchlist Success': props<{ quotes: StockQuote[] }>(),
    'Load Watchlist Failure': props<{ error: string }>(),

    // ── Live Price Updates ────────────────────────────────────────────────
    'Price Tick Received': props<{ quote: StockQuote }>(),
    // WHY this action? WebSocket ticks are side effects.
    // The WebSocket service dispatches this action for each incoming tick.
    // Reducer updates the quote map → components re-render with new price.

    // WHY updateQuote separate from priceTickReceived?
    // Sprint 2: WebSocket ticks send partial data (price, change, changePercent).
    // updateQuote allows a partial update — only price fields change,
    // preserving name/high/low/open/previousClose from the HTTP snapshot.
    'Update Quote': props<{ symbol: string; price: number; change: number; changePercent: number }>(),

    // ── Watchlist Management (legacy — stock-detail toggle) ──────────────
    // WHY keep these? stock-detail uses Add/Remove without knowing which watchlist.
    // Add defaults to first watchlist with capacity; Remove finds the WL automatically.
    'Add To Watchlist': props<{ symbol: string }>(),
    'Remove From Watchlist': props<{ symbol: string }>(),

    // ── Multi-Watchlist Management ────────────────────────────────────────
    'Rename Watchlist': props<{ index: number; name: string }>(),
    'Add Symbol To Watchlist': props<{ index: number; symbol: string }>(),
    'Remove Symbol From Watchlist': props<{ index: number; symbol: string }>(),
    // WHY fromPos/toPos? Reorder by swapping adjacent positions (↑↓ buttons).
    'Reorder Symbol In Watchlist': props<{ index: number; fromPos: number; toPos: number }>(),

    // ── Dashboard Pin ─────────────────────────────────────────────────────
    // WHY toggle? Dashboard widget shows up to 5 pinned symbols chosen from all 30.
    // User stars/unstars any row in any watchlist — max 5 at a time.
    'Toggle Dashboard Symbol': props<{ symbol: string }>(),

    // ── Symbol Search ────────────────────────────────────────────────────
    'Search Symbol': props<{ query: string }>(),
    'Search Symbol Success': props<{ results: StockQuote[] }>(),
    'Search Symbol Failure': props<{ error: string }>(),

    // ── Cleanup ─────────────────────────────────────────────────────────
    'Clear Market Data': emptyProps(),
    // Dispatched on logout — clear potentially stale price data
  }
});
