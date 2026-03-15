// WHY Portfolio Reducer?
// Pure function: portfolio state + action → new portfolio state.
// The most complex state transitions: updating P&L when price changes requires:
// 1. Find the holding by symbol
// 2. Recalculate pnl = (newPrice - avgPrice) * quantity
// 3. Recalculate pnlPercent
// 4. Create new state (immutable update)
// All of this is pure computation — no API calls, no side effects.

import { createReducer, on } from '@ngrx/store';
import { PortfolioActions, Holding, PortfolioSummary } from './portfolio.actions';

export interface PortfolioState {
  holdings: Holding[];
  summary: PortfolioSummary | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;  // Unix timestamp — UI shows "Last updated: 2 min ago"
}

const initialState: PortfolioState = {
  holdings: [],
  summary: null,
  loading: false,
  error: null,
  lastUpdated: null,
};

export const portfolioReducer = createReducer(
  initialState,

  on(PortfolioActions.loadPortfolio, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(PortfolioActions.refreshPortfolio, (state) => ({
    ...state,
    loading: true,
  })),

  on(PortfolioActions.loadPortfolioSuccess, (state, { holdings, summary }) => ({
    ...state,
    holdings,
    summary,
    loading: false,
    error: null,
    lastUpdated: Date.now(),
  })),

  on(PortfolioActions.loadPortfolioFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // ── Live Price Update ─────────────────────────────────────────────────
  on(PortfolioActions.updateHoldingPrice, (state, { symbol, currentPrice }) => {
    const holdingIndex = state.holdings.findIndex(h => h.symbol === symbol);
    if (holdingIndex === -1) return state;
    // WHY early return? If we don't hold this symbol, no state change needed.
    // This is called for every WebSocket tick — must be fast.

    const holding = state.holdings[holdingIndex];
    const invested = holding.averagePrice * holding.quantity;
    const currentValue = currentPrice * holding.quantity;
    const pnl = currentValue - invested;
    const pnlPercent = (pnl / invested) * 100;

    const updatedHolding: Holding = {
      ...holding,
      currentPrice,
      pnl,
      pnlPercent,
    };

    // Immutable array update — don't mutate state.holdings
    const newHoldings = [
      ...state.holdings.slice(0, holdingIndex),
      updatedHolding,
      ...state.holdings.slice(holdingIndex + 1),
    ];
    // WHY slice not map? When updating ONE item in a large array,
    // slice avoids iterating the entire array — O(1) update vs O(n).
    // At 10 holdings this doesn't matter; at 100+ holdings per tick it does.

    // Recalculate summary
    const totalCurrentValue = newHoldings.reduce((sum, h) => sum + (h.currentPrice * h.quantity), 0);
    const totalInvested = newHoldings.reduce((sum, h) => sum + (h.averagePrice * h.quantity), 0);
    const totalPnl = totalCurrentValue - totalInvested;

    return {
      ...state,
      holdings: newHoldings,
      summary: state.summary
        ? {
            ...state.summary,
            currentValue: totalCurrentValue,
            totalPnl,
            totalPnlPercent: (totalPnl / totalInvested) * 100,
          }
        : null,
    };
  }),

  // ── Cleanup ──────────────────────────────────────────────────────────────
  on(PortfolioActions.clearPortfolio, () => initialState),

  // ── Add Cash ──────────────────────────────────────────────────────────────
  // WHY no-op on addCash? The effect handles the HTTP call.
  // We wait for the server response (addCashSuccess) before updating the balance.
  // This prevents the balance from briefly showing an incorrect value if the
  // backend rejects the deposit (e.g., invalid amount, auth failure).
  on(PortfolioActions.addCash, (state) => state),

  // WHY update on addCashSuccess (not addCash)?
  // The backend returns the authoritative new balance. We use that exact value —
  // no client-side arithmetic that could drift from the server's ledger.
  on(PortfolioActions.addCashSuccess, (state, { availableBalance }) => ({
    ...state,
    summary: state.summary
      ? { ...state.summary, availableBalance }
      : state.summary,
  })),

  // WHY no-op on addCashFailure?
  // Balance stays unchanged — the deposit did not go through.
  // The component is responsible for showing the error to the user.
  on(PortfolioActions.addCashFailure, (state) => state),
);
