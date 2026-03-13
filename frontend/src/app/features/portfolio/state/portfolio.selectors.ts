import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PortfolioState } from './portfolio.reducer';

const selectPortfolioState = createFeatureSelector<PortfolioState>('portfolio');
// WHY 'portfolio'? Matches provideStore({ portfolio: portfolioReducer }) in app.config.ts

export const selectAllHoldings = createSelector(
  selectPortfolioState,
  (state) => state.holdings
  // Used by: PortfolioComponent table
);

export const selectPortfolioSummary = createSelector(
  selectPortfolioState,
  (state) => state.summary
  // Used by: DashboardComponent portfolio overview cards
);

export const selectPortfolioLoading = createSelector(
  selectPortfolioState,
  (state) => state.loading
);

export const selectPortfolioError = createSelector(
  selectPortfolioState,
  (state) => state.error
);

export const selectLastUpdated = createSelector(
  selectPortfolioState,
  (state) => state.lastUpdated
);

// Derived: sort holdings by absolute P&L (biggest gainers/losers first)
export const selectHoldingsSortedByPnl = createSelector(
  selectAllHoldings,
  (holdings) => [...holdings].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
  // WHY spread? sort() mutates the array in place.
  // Mutating NgRx state would break immutability and change detection.
  // spread creates a new array → sort the copy.
);

// Derived: holdings with positive P&L (gainers)
export const selectGainers = createSelector(
  selectAllHoldings,
  (holdings) => holdings.filter(h => h.pnl > 0)
);

// Derived: holdings with negative P&L (losers)
export const selectLosers = createSelector(
  selectAllHoldings,
  (holdings) => holdings.filter(h => h.pnl < 0)
);

// Derived: is portfolio profitable overall?
export const selectIsPortfolioProfitable = createSelector(
  selectPortfolioSummary,
  (summary) => summary ? summary.totalPnl > 0 : null
);

// WHY selectAvailableBalance? Used by order-form (Feature 7) to show/block
// BUY orders when the user has insufficient funds.
// Also used by add-funds page to display current balance.
export const selectAvailableBalance = createSelector(
  selectPortfolioSummary,
  (summary) => summary?.availableBalance ?? 0
);

// WHY selectIsNewUser? Drives the empty-state dashboard (Feature 3).
// True when the user has no holdings AND has not invested anything yet.
// Avoids showing "Add Funds" empty state to returning traders who have a portfolio.
export const selectIsNewUser = createSelector(
  selectAllHoldings,
  selectPortfolioSummary,
  (holdings, summary) =>
    holdings.length === 0 && (summary?.totalInvested ?? 0) === 0
);

// WHY selectHasHoldings? Convenience selector — avoids using holdings.length > 0
// in multiple components. Semantically clearer than checking array length.
export const selectHasHoldings = createSelector(
  selectAllHoldings,
  (holdings) => holdings.length > 0
);
