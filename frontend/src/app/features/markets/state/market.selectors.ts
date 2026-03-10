// WHY Market Selectors?
// Components use these to subscribe to exactly the data they need.
// Memoization: if watchlist didn't change, selectWatchlistQuotes returns
// the SAME array reference → component doesn't re-render (performance critical
// in a trading app where state updates 100x/second for price ticks).

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MarketState } from './market.reducer';

const selectMarketState = createFeatureSelector<MarketState>('market');
// WHY 'market'? Must match the key in provideStore({ market: marketReducer })

export const selectAllQuotes = createSelector(
  selectMarketState,
  (state) => state.quotes
);

export const selectWatchlist = createSelector(
  selectMarketState,
  (state) => state.watchlist // flat list of ALL symbols across all 3 watchlists
);

export const selectWatchlists = createSelector(
  selectMarketState,
  (state) => state.watchlists
);

export const selectDashboardSymbols = createSelector(
  selectMarketState,
  (state) => state.dashboardSymbols
);

// WHY dashboardSymbols for selectWatchlistQuotes?
// Dashboard widget shows the 5 user-pinned stocks, not all 30.
// selectWatchlistQuotes is consumed by DashboardComponent — this aligns with the UX.
export const selectWatchlistQuotes = createSelector(
  selectAllQuotes,
  selectDashboardSymbols,
  (quotes, symbols) => symbols.map(s => quotes[s]).filter(Boolean)
);

// Selector for a specific symbol's quote
// WHY factory selector? Takes a parameter (symbol) and returns a selector.
// Usage: this.store.select(selectQuoteBySymbol('INFY'))
export const selectQuoteBySymbol = (symbol: string) => createSelector(
  selectAllQuotes,
  (quotes) => quotes[symbol] ?? null
);

export const selectMarketLoading = createSelector(
  selectMarketState,
  (state) => state.loading
);

export const selectMarketError = createSelector(
  selectMarketState,
  (state) => state.error
);

export const selectSearchResults = createSelector(
  selectMarketState,
  (state) => state.searchResults
);

// Derived: overall market sentiment from watchlist
export const selectMarketSentiment = createSelector(
  selectWatchlistQuotes,
  (quotes) => {
    if (!quotes.length) return null;
    const gainers = quotes.filter(q => q.changePercent > 0).length;
    const losers = quotes.filter(q => q.changePercent < 0).length;
    return { gainers, losers, total: quotes.length };
    // Used by Dashboard header to show "8 up, 2 down today"
  }
);
