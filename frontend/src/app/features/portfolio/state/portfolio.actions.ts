// WHY Portfolio Actions?
// Portfolio is the most important section for a trader:
// - Current holdings (what they own)
// - P&L per position (gaining or losing)
// - Overall account balance
//
// These actions model every portfolio data operation as a discrete event.
// This audit trail is valuable: "Why did my portfolio P&L change?"
// → replay actions → see each price update that caused it.

import { createActionGroup, emptyProps, props } from '@ngrx/store';

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;   // Cost basis per share
  currentPrice: number;   // Live price (updated by WebSocket ticks)
  pnl: number;            // (currentPrice - averagePrice) * quantity
  pnlPercent: number;     // (pnl / invested) * 100
  dayChange: number;      // Change from previous close
  dayChangePct: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayPnl: number;
  dayPnlPercent: number;
  availableBalance: number;
}

export const PortfolioActions = createActionGroup({
  source: 'Portfolio',
  events: {

    // ── Load Portfolio ────────────────────────────────────────────────────
    'Load Portfolio': emptyProps(),
    'Load Portfolio Success': props<{ holdings: Holding[]; summary: PortfolioSummary }>(),
    'Load Portfolio Failure': props<{ error: string }>(),

    // ── Live P&L Updates ──────────────────────────────────────────────────
    // Dispatched when WebSocket tick arrives for a symbol the user holds.
    // Reducer recalculates P&L for that holding.
    'Update Holding Price': props<{ symbol: string; currentPrice: number }>(),

    // ── Portfolio Refresh ─────────────────────────────────────────────────
    'Refresh Portfolio': emptyProps(),
    // User pulls-to-refresh or navigates back to portfolio

    // ── Cleanup ──────────────────────────────────────────────────────────
    'Clear Portfolio': emptyProps(),
    // Called on logout — don't show another user's portfolio

    // ── Add Cash ─────────────────────────────────────────────────────────
    // WHY three actions for cash deposit?
    // addCash = user clicked Confirm → triggers the HTTP POST effect
    // addCashSuccess = backend confirmed the deposit → reducer updates the balance
    // addCashFailure = backend rejected → reducer shows the error
    // The optimistic-only pattern was replaced: balance now persists in the DB.
    'Add Cash': props<{ amount: number }>(),
    'Add Cash Success': props<{ availableBalance: number }>(),
    'Add Cash Failure': props<{ error: string }>(),
  }
});
