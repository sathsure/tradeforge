// WHY a Markets Reducer?
// Manages the state of all market data in the app:
// - Live price quotes (updated multiple times per second via WebSocket)
// - User's watchlist (which symbols they're tracking)
// - Search results
// - Loading/error states
//
// WHY store market data in NgRx vs component state?
// Multiple components need the same data:
// - Markets page shows price table
// - Dashboard shows index summary
// - Order form shows current price
// NGRx: one subscription, shared data, one source of truth.

import { createReducer, on } from '@ngrx/store';
import { MarketActions, StockQuote } from './market.actions';

// WHY WatchlistGroup? Each named watchlist holds up to 10 symbols.
// 3 watchlists = 30 total capacity. Name is user-editable.
export interface WatchlistGroup {
  name: string;
  symbols: string[]; // max 10
}

export interface MarketState {
  // WHY Record<string, StockQuote> (object map)?
  // Lookups by symbol are O(1): quotes['INFY'] vs quotes.find(q => q.symbol === 'INFY')
  // When WebSocket sends 100 ticks/second, O(1) vs O(n) matters.
  quotes: Record<string, StockQuote>;

  // WHY 3 watchlist groups? Bloomberg/Kite allow multiple named watchlists.
  // 3 × 10 = 30 total symbols — enough for most retail traders.
  watchlists: WatchlistGroup[];

  // WHY dashboardSymbols separate? Dashboard widget shows only 5 hand-picked stocks.
  // User stars any row in any watchlist — at most 5 at a time.
  dashboardSymbols: string[];

  // WHY keep flat watchlist? Backward-compat for stock-detail's addToWatchlist action
  // and for selectWatchlist selector used to check "is this symbol in any watchlist".
  watchlist: string[];

  // Search state
  searchResults: StockQuote[];
  searchQuery: string;

  loading: boolean;
  error: string | null;
}

const DEFAULT_WATCHLISTS: WatchlistGroup[] = [
  { name: 'Watchlist 1', symbols: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'] },
  { name: 'Watchlist 2', symbols: ['WIPRO', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'TITAN'] },
  { name: 'Watchlist 3', symbols: ['LTIM', 'AXISBANK', 'KOTAKBANK', 'SBIN', 'HINDUNILVR'] },
];

const initialState: MarketState = {
  quotes: {},
  watchlists: DEFAULT_WATCHLISTS,
  // WHY these 5 as default dashboard pins? Most recognised NSE large-caps —
  // meaningful for first-time users before they customise.
  dashboardSymbols: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'],
  watchlist: DEFAULT_WATCHLISTS.flatMap(wl => wl.symbols),
  searchResults: [],
  searchQuery: '',
  loading: false,
  error: null,
};

export const marketReducer = createReducer(
  initialState,

  on(MarketActions.loadWatchlist, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(MarketActions.loadWatchlistSuccess, (state, { quotes }) => {
    // Convert array to map for O(1) lookups
    const quotesMap = quotes.reduce((acc, quote) => ({
      ...acc,
      [quote.symbol]: quote
    }), {} as Record<string, StockQuote>);

    return {
      ...state,
      quotes: { ...state.quotes, ...quotesMap },
      // WHY merge not replace? Don't blow away WebSocket updates that arrived
      // while the HTTP call was in-flight.
      loading: false,
    };
  }),

  on(MarketActions.loadWatchlistFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // ── Live Price Updates ─────────────────────────────────────────────────
  on(MarketActions.priceTickReceived, (state, { quote }) => ({
    ...state,
    quotes: {
      ...state.quotes,
      [quote.symbol]: quote
      // WHY spread the quotes map? Creates a new object reference.
      // Angular's change detection (and NgRx selectors with memoization)
      // detect changes via reference equality. Same reference = no re-render.
    }
  })),

  // WHY updateQuote?
  // Sprint 2: WebSocket ticks provide partial data (price/change).
  // We merge with the existing quote to preserve name, high, low, open, previousClose.
  // This prevents flickering UI where non-price fields momentarily go undefined.
  on(MarketActions.updateQuote, (state, { symbol, price, change, changePercent }) => {
    const existing = state.quotes[symbol];
    if (!existing) return state; // Don't create quotes for symbols not loaded
    return {
      ...state,
      quotes: {
        ...state.quotes,
        [symbol]: { ...existing, price, change, changePercent }
      }
    };
  }),

  // ── Legacy Watchlist Toggle (stock-detail) ─────────────────────────────
  on(MarketActions.addToWatchlist, (state, { symbol }) => {
    // Already in any watchlist — no-op
    if (state.watchlist.includes(symbol)) return state;
    // Add to first watchlist that has capacity
    const idx = state.watchlists.findIndex(wl => wl.symbols.length < 10);
    if (idx === -1) return state; // all full
    const wls = state.watchlists.map((wl, i) =>
      i === idx ? { ...wl, symbols: [...wl.symbols, symbol] } : wl
    );
    return { ...state, watchlists: wls, watchlist: wls.flatMap(wl => wl.symbols) };
  }),

  on(MarketActions.removeFromWatchlist, (state, { symbol }) => {
    const wls = state.watchlists.map(wl => ({
      ...wl, symbols: wl.symbols.filter(s => s !== symbol)
    }));
    return {
      ...state,
      watchlists: wls,
      watchlist: wls.flatMap(wl => wl.symbols),
      dashboardSymbols: state.dashboardSymbols.filter(s => s !== symbol),
    };
  }),

  // ── Multi-Watchlist Management ─────────────────────────────────────────
  on(MarketActions.renameWatchlist, (state, { index, name }) => ({
    ...state,
    watchlists: state.watchlists.map((wl, i) => i === index ? { ...wl, name } : wl),
  })),

  on(MarketActions.addSymbolToWatchlist, (state, { index, symbol }) => {
    const wl = state.watchlists[index];
    // Guard: capacity, duplicates within the TARGET watchlist only.
    // WHY not state.watchlist (all watchlists)? The same symbol can legitimately
    // appear in multiple watchlists (e.g. RELIANCE in both WL1 and WL2).
    if (!wl || wl.symbols.length >= 10 || wl.symbols.includes(symbol)) return state;
    const wls = state.watchlists.map((w, i) =>
      i === index ? { ...w, symbols: [...w.symbols, symbol] } : w
    );
    return { ...state, watchlists: wls, watchlist: wls.flatMap(w => w.symbols) };
  }),

  on(MarketActions.removeSymbolFromWatchlist, (state, { index, symbol }) => {
    const wls = state.watchlists.map((wl, i) =>
      i === index ? { ...wl, symbols: wl.symbols.filter(s => s !== symbol) } : wl
    );
    return {
      ...state,
      watchlists: wls,
      watchlist: wls.flatMap(wl => wl.symbols),
      dashboardSymbols: state.dashboardSymbols.filter(s => s !== symbol),
    };
  }),

  on(MarketActions.reorderSymbolInWatchlist, (state, { index, fromPos, toPos }) => {
    const wl = state.watchlists[index];
    if (!wl) return state;
    const symbols = [...wl.symbols];
    const [moved] = symbols.splice(fromPos, 1);
    symbols.splice(toPos, 0, moved);
    const wls = state.watchlists.map((w, i) => i === index ? { ...w, symbols } : w);
    return { ...state, watchlists: wls };
  }),

  // ── Dashboard Pin ──────────────────────────────────────────────────────
  on(MarketActions.toggleDashboardSymbol, (state, { symbol }) => {
    const isIn = state.dashboardSymbols.includes(symbol);
    if (isIn) {
      return { ...state, dashboardSymbols: state.dashboardSymbols.filter(s => s !== symbol) };
    }
    if (state.dashboardSymbols.length >= 5) return state; // max 5 — no-op
    return { ...state, dashboardSymbols: [...state.dashboardSymbols, symbol] };
  }),

  // ── Search ─────────────────────────────────────────────────────────────
  on(MarketActions.searchSymbol, (state, { query }) => ({
    ...state,
    searchQuery: query,
    loading: true,
  })),

  on(MarketActions.searchSymbolSuccess, (state, { results }) => ({
    ...state,
    searchResults: results,
    loading: false,
  })),

  on(MarketActions.searchSymbolFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // ── Cleanup ─────────────────────────────────────────────────────────────
  on(MarketActions.clearMarketData, () => initialState),
);
