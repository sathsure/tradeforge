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
