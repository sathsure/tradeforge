// WHY a Dashboard?
// First page a trader sees after login — the "command center".
// Shows portfolio health at a glance: total investments, P&L, top movers.
// Redesigned in Sprint 3: uses real NgRx portfolio state instead of hardcoded data.
// Segregated into: Summary → Stock Holdings → Mutual Funds teaser → Quick Access.

import {
  Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { selectCurrentUser } from '../auth/state/auth.selectors';
import { UserInfo } from '../../core/models/auth.models';
import { PortfolioActions, Holding, PortfolioSummary } from '../portfolio/state/portfolio.actions';
import { MarketActions } from '../markets/state/market.actions';
import {
  selectPortfolioSummary, selectAllHoldings, selectPortfolioLoading,
  selectIsNewUser, selectAvailableBalance
} from '../portfolio/state/portfolio.selectors';
import { selectWatchlistQuotes } from '../markets/state/market.selectors';
import { StockQuote } from '../markets/state/market.actions';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatTooltipModule,
  ],
  templateUrl: './dashboard.component.html',
  styles: [`
    /* Page entry */
    .dashboard {
      padding: 24px; display: flex; flex-direction: column; gap: 20px;
      animation: dashSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    @keyframes dashSlideIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
    .greeting-text { font-size: 22px; font-weight: 700; color: var(--tf-text-primary); margin: 0; }
    .greeting-date { font-size: 13px; color: var(--tf-text-muted); margin: 4px 0 0; }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    .action-btn { font-size: 13px !important; }
    .primary-btn { background: var(--tf-cyan) !important; color: #000 !important; font-weight: 600 !important; }
    .load-bar { border-radius: 0; }

    /* ── Market Indices Strip ────────────────────────────────────────────── */
    .indices-strip {
      display: flex; gap: 12px; overflow-x: auto; padding: 2px 0;
      scrollbar-width: none;
      animation: cardFadeUp 0.3s 0.04s cubic-bezier(0.4,0,0.2,1) both;
    }
    .indices-strip::-webkit-scrollbar { display: none; }
    .idx-item {
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 8px 14px;
      transition: border-color 0.15s;
    }
    .idx-item:hover { border-color: rgba(79,172,254,0.3); }
    .idx-item.idx-up  { border-left: 2px solid var(--tf-green); }
    .idx-item.idx-dn  { border-left: 2px solid var(--tf-red); }
    .idx-name { font-size: 11px; font-weight: 600; color: var(--tf-text-secondary); white-space: nowrap; }
    .idx-val  { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); }
    .idx-chg  { font-size: 11px; font-weight: 600; white-space: nowrap; }
    .idx-item.idx-up  .idx-chg { color: var(--tf-green); }
    .idx-item.idx-dn  .idx-chg { color: var(--tf-red); }
    .idx-dot {
      width: 6px; height: 6px; border-radius: 50%;
      animation: blink 2s ease-in-out infinite;
    }
    .idx-item.idx-up .idx-dot { background: var(--tf-green); }
    .idx-item.idx-dn .idx-dot { background: var(--tf-red); }
    @keyframes blink {
      0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
    }

    /* ── Combined Portfolio Banner ──────────────────────────────────────── */
    .portfolio-banner {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 24px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px 22px;
      animation: cardFadeUp 0.35s 0.08s cubic-bezier(0.4,0,0.2,1) both;
    }
    @keyframes cardFadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .pb-identity { display: flex; align-items: center; gap: 10px; }
    /* WHY explicit width/height on icon? mat-icon uses font-size for visual size but
       the element box defaults to 24px — setting both ensures it never clips. */
    .pb-icon {
      font-size: 32px; width: 32px; height: 32px;
      line-height: 32px; display: flex; align-items: center; justify-content: center;
      color: var(--tf-cyan); animation: pulse 3s infinite; flex-shrink: 0;
    }
    .pb-title { font-size: 14px; font-weight: 700; color: var(--tf-text-primary); }
    .pb-sub { font-size: 11px; color: var(--tf-text-muted); }

    /* 3-column grid for the 3 stats — each separated by a left border */
    .pb-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      align-items: center;
    }
    .pb-stat {
      display: flex; flex-direction: column; gap: 3px;
      padding: 0 24px;
      border-left: 1px solid var(--tf-border);
    }
    .pb-stat:first-child { border-left: none; padding-left: 0; }
    .pb-s-label { font-size: 10px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .pb-s-val { font-size: 18px; font-weight: 700; color: var(--tf-text-primary); line-height: 1.1; }
    .pb-s-pct { font-size: 11px; font-weight: 600; }
    /* P&L value + % badge side by side on the same baseline line */
    .pb-pnl-row { display: flex; align-items: baseline; gap: 7px; }

    /* "View Full Portfolio" CTA badge */
    .pb-cta {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 18px 9px 14px; border-radius: 24px;
      background: rgba(79,172,254,0.08); border: 1px solid rgba(79,172,254,0.28);
      color: var(--tf-cyan); font-size: 13px; font-weight: 600;
      text-decoration: none; white-space: nowrap;
      position: relative; overflow: hidden; align-self: center;
      transition: background 0.28s ease, border-color 0.28s ease,
                  box-shadow 0.28s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    .pb-cta::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(108deg, transparent 35%, rgba(79,172,254,0.2) 50%, transparent 65%);
      transform: translateX(-130%); transition: transform 0.5s ease; pointer-events: none;
    }
    .pb-cta:hover::before { transform: translateX(200%); }
    .pb-cta:hover {
      background: rgba(79,172,254,0.15); border-color: rgba(79,172,254,0.6);
      box-shadow: 0 0 18px rgba(79,172,254,0.2); transform: translateY(-1px);
    }
    .pb-cta-icon { font-size: 16px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
    .pb-cta-arrow { font-size: 16px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
    .pb-cta:hover .pb-cta-arrow { transform: translateX(5px); }

    /* Content grid */
    .content-grid { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
    @media (max-width: 1100px) { .content-grid { grid-template-columns: 1fr; } }

    /* Tab bar */
    .tab-bar {
      position: relative; display: flex; gap: 0;
      background: var(--tf-bg-surface);
      border: 1px solid var(--tf-border); border-radius: var(--tf-radius-md); overflow: hidden;
      margin-bottom: 10px;
    }
    .tab-btn {
      flex: 1; padding: 10px 16px; display: flex; align-items: center; justify-content: center; gap: 6px;
      border: none; background: transparent; color: var(--tf-text-secondary);
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; position: relative; z-index: 1;
    }
    .tab-btn:hover { color: var(--tf-text-primary); }
    .tab-btn.active { color: var(--tf-cyan); font-weight: 700; }
    .tab-btn mat-icon { font-size: 18px; }
    /* Animated slider pill behind the active tab */
    .tab-slider {
      position: absolute; top: 4px; bottom: 4px; left: 4px;
      width: calc(50% - 8px); background: rgba(79,172,254,0.10);
      border: 1px solid rgba(79,172,254,0.25); border-radius: calc(var(--tf-radius-md) - 4px);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .tab-slider.slide-right { transform: translateX(calc(100% + 8px)); }

    /* Holdings column — outer card: slightly elevated vs page bg */
    .holdings-column {
      background: var(--tf-bg-surface);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md);
      padding: 20px;
    }

    /* Metrics strip — sits on a distinct darker tinted bg to separate from card list */
    .metrics-strip {
      background: rgba(79,172,254,0.03);
      border: 1px solid rgba(79,172,254,0.10);
      border-radius: var(--tf-radius-sm);
      padding: 10px;
      margin-bottom: 14px;
      transition: background 0.3s ease, border-color 0.3s ease;
    }
    /* Tab-reactive tints: stocks = green, MF = blue */
    .metrics-strip.metrics-stocks {
      background: rgba(63,185,80,0.04);
      border-color: rgba(63,185,80,0.18);
    }
    .metrics-strip.metrics-mf {
      background: rgba(88,166,255,0.04);
      border-color: rgba(88,166,255,0.18);
    }

    /* Card list area — deliberately lighter than holdings-column bg so cards pop */
    .holdings-list {
      display: flex; flex-direction: column; gap: 6px;
      background: rgba(255,255,255,0.015);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm);
      padding: 8px;
    }
    .mf-fund-list {
      display: flex; flex-direction: column; gap: 6px;
      background: rgba(255,255,255,0.015);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm);
      padding: 8px;
    }

    /* Unified holding card — 2-column × 3-row grid
       Left col : Qty·Avg / Symbol / Invested
       Right col: P&L%   / P&L₹  / LTP+dayChg  */
    .hcard {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto auto;
      column-gap: 12px; row-gap: 2px;
      padding: 10px 14px; border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-left: 3px solid var(--tf-border);
      cursor: pointer; transition: transform 0.15s ease-out, background 0.15s;
    }
    .hcard:hover { transform: translateX(3px); background: rgba(255,255,255,0.04); }
    .hcard-profit  { border-left-color: var(--tf-green); }
    .hcard-loss    { border-left-color: var(--tf-red); }
    .hcard-neutral { border-left-color: var(--tf-text-muted); }

    /* Row 1 */
    .hc-meta    { grid-column:1; grid-row:1; font-size:11px; color:var(--tf-text-secondary); align-self:center; }
    .hc-pnl-pct { grid-column:2; grid-row:1; font-size:13px; font-weight:700; text-align:right; align-self:center; }

    /* Row 2 */
    .hc-symbol  { grid-column:1; grid-row:2; font-size:16px; font-weight:700; color:var(--tf-text-primary); align-self:center; letter-spacing:0.01em; }
    .hc-pnl-amt { grid-column:2; grid-row:2; font-size:15px; font-weight:700; text-align:right; align-self:center; }

    /* Row 3 */
    .hc-invested { grid-column:1; grid-row:3; font-size:12px; font-weight:600; color:var(--tf-text-secondary); align-self:center; }
    .hc-ltp      { grid-column:2; grid-row:3; font-size:11px; color:var(--tf-text-secondary); text-align:right; align-self:center; white-space:nowrap; }
    .hc-day-chg  { font-size:10px; font-weight:600; }

    /* ── 6-Metric Strip grid ─────────────────────────────────────────────── */
    .metrics-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
    @media (max-width: 860px) { .metrics-strip { grid-template-columns: repeat(3, 1fr); } }
    .ms-card {
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 9px 10px;
      display: flex; flex-direction: column; gap: 3px;
      border-left: 2px solid transparent;
    }
    .ms-profit { border-left-color: var(--tf-green); background: rgba(63,185,80,0.07); border-color: rgba(63,185,80,0.22); }
    .ms-loss   { border-left-color: var(--tf-red);   background: rgba(248,81,73,0.07);  border-color: rgba(248,81,73,0.22); }
    .ms-rate   { border-color: rgba(63,185,80,0.2); background: rgba(63,185,80,0.04); }
    .ms-label  { font-size: 9px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
    .ms-val    { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ms-sub    { font-size: 10px; font-weight: 600; }

    .empty-holdings { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px; color: var(--tf-text-muted); text-align: center; }
    .empty-holdings mat-icon { font-size: 40px; width: 40px; height: 40px; color: var(--tf-border); }

    /* Tab content slide-in — @if destroys/recreates DOM on switch → animation retriggers */
    .tab-content-panel,
    .mf-tab-content {
      animation: tabSlideIn 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    @keyframes tabSlideIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Staggered holding card entrance */
    .hcard { animation: hcardIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) both; }
    .hcard:nth-child(1) { animation-delay: 0.04s; }
    .hcard:nth-child(2) { animation-delay: 0.09s; }
    .hcard:nth-child(3) { animation-delay: 0.14s; }
    .hcard:nth-child(4) { animation-delay: 0.19s; }
    .hcard:nth-child(5) { animation-delay: 0.24s; }
    .hcard:nth-child(n+6) { animation-delay: 0.28s; }
    @keyframes hcardIn {
      from { opacity: 0; transform: translateX(-10px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    /* Staggered MF fund card entrance */
    .mf-fcard { animation: hcardIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) both; }
    .mf-fcard:nth-child(1) { animation-delay: 0.08s; }
    .mf-fcard:nth-child(2) { animation-delay: 0.13s; }
    .mf-fcard:nth-child(3) { animation-delay: 0.18s; }
    .mf-fcard:nth-child(4) { animation-delay: 0.23s; }
    .mf-fcard:nth-child(5) { animation-delay: 0.28s; }
    .mf-fcard:nth-child(n+6) { animation-delay: 0.32s; }

    /* MF tab */
    .mf-tab-content { display: flex; flex-direction: column; gap: 12px; }

    /* Per-fund card */
    .mf-fcard {
      padding: 10px 12px; border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-left: 3px solid var(--tf-border);
      display: flex; flex-direction: column; gap: 4px;
      cursor: pointer; transition: transform 0.15s ease-out, background 0.15s;
    }
    .mf-fcard:hover { transform: translateX(3px); background: rgba(255,255,255,0.04); }
    .mf-fcard-profit { border-left-color: var(--tf-green); }
    .mf-fcard-loss   { border-left-color: var(--tf-red); }

    /* Top row: name+badge | P&L % */
    .mf-fcard-name-row {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
    }
    .mf-fcard-name-wrap { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
    .mf-fcard-name { font-size: 12px; font-weight: 600; color: var(--tf-text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mf-fcard-cat {
      font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px;
      text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; flex-shrink: 0;
      background: rgba(79,172,254,0.12); color: var(--tf-cyan);
    }
    .mf-fcard-cat[data-cat="EQUITY"]  { background: rgba(63,185,80,0.12); color: var(--tf-green); }
    .mf-fcard-cat[data-cat="HYBRID"]  { background: rgba(57,208,216,0.12); color: var(--tf-cyan); }
    .mf-fcard-cat[data-cat="DEBT"]    { background: rgba(88,166,255,0.12); color: var(--tf-blue); }
    .mf-fcard-cat[data-cat="ELSS"]    { background: rgba(210,153,34,0.12); color: var(--tf-yellow); }
    /* P&L % is intentionally smaller than the ₹ amount — % is context, amount is signal */
    .mf-pnl-pct { font-size: 11px; font-weight: 600; flex-shrink: 0; }

    /* Bottom row: Invested | P&L amount */
    .mf-fcard-bottom-row {
      display: flex; justify-content: space-between; align-items: center;
    }
    .mf-fcard-invested { font-size: 12px; font-weight: 600; color: var(--tf-text-secondary); }
    .mf-pnl-amt { font-size: 14px; font-weight: 700; }

    /* Footer: XIRR · CAGR chips */
    .mf-fcard-rates { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .mf-rate-pill {
      font-size: 10px; font-weight: 600; color: var(--tf-text-secondary);
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: 4px; padding: 1px 6px;
    }
    .mf-rate-sep { font-size: 10px; color: var(--tf-border); }

    /* Right column */
    .right-column { display: flex; flex-direction: column; gap: 14px; }
    .widget-card { background: var(--tf-bg-surface); border: 1px solid var(--tf-border); border-radius: var(--tf-radius-md); padding: 16px 20px; }
    .widget-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .widget-title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--tf-text-primary); }
    .widget-title mat-icon { font-size: 18px; color: var(--tf-cyan); }
    .live-chip { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: var(--tf-green); letter-spacing: 0.05em; }
    .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--tf-green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }

    /* Indices */
    .indices-list { display: flex; flex-direction: column; gap: 8px; }
    .index-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .idx-name { font-size: 12px; font-weight: 500; color: var(--tf-text-secondary); }
    .idx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .idx-value { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); }
    .idx-change { font-size: 11px; font-weight: 600; }

    /* Watchlist widget */
    .wl-list { display: flex; flex-direction: column; gap: 2px; }
    .wl-row {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 6px; border-radius: var(--tf-radius-sm);
      cursor: pointer; transition: background 0.15s;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      text-decoration: none;
    }
    .wl-row:last-child { border-bottom: none; }
    .wl-row:hover { background: rgba(255,255,255,0.04); }
    .wl-sym {
      font-size: 13px; font-weight: 700; color: var(--tf-text-primary);
      min-width: 72px; flex-shrink: 0;
    }
    .wl-name {
      font-size: 11px; color: var(--tf-text-muted);
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .wl-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
    .wl-price { font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--tf-text-primary); }
    .wl-chg { font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
    .wl-empty {
      text-align: center; padding: 20px 12px;
      color: var(--tf-text-muted); font-size: 12px;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .wl-empty mat-icon { font-size: 28px; width: 28px; height: 28px; color: var(--tf-border); }
    .wl-empty-link {
      font-size: 11px; color: var(--tf-cyan); text-decoration: none; font-weight: 600;
    }
    .wl-empty-link:hover { text-decoration: underline; }

    /* Quick grid */
    .quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .quick-card {
      display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
      padding: 12px; border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      color: var(--tf-text-secondary); text-decoration: none; cursor: pointer; transition: all 0.15s;
    }
    .quick-card:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); transform: translateY(-1px); }
    .quick-card mat-icon { font-size: 20px; color: var(--tf-cyan); }
    .quick-card span { font-size: 12px; font-weight: 600; color: var(--tf-text-primary); }
    .qc-desc { font-size: 10px; color: var(--tf-text-muted) !important; font-weight: 400 !important; }

    /* ── Mobile floating pills — hidden on desktop ──────────────────────── */
    .mobile-panel-btns { display: none; }
    .mpb-backdrop { display: none; }
    .mpb-panel { display: none; }

    @media (max-width: 1100px) {
      /* Hide right column from normal flow — replaced by floating pills */
      .right-column { display: none; }

      /* Floating pill row — fixed top-right below the shell nav */
      .mobile-panel-btns {
        display: flex;
        position: fixed;
        top: 68px;
        right: 16px;
        gap: 8px;
        z-index: 1000;
      }
      .mpb-pill {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 12px;
        background: var(--tf-bg-surface);
        border: 1px solid var(--tf-border);
        border-radius: 20px;
        color: var(--tf-text-secondary);
        font-size: 12px; font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      }
      .mpb-pill mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 15px; }
      .mpb-pill:hover { color: var(--tf-cyan); border-color: var(--tf-cyan); }
      .mpb-pill.active {
        color: var(--tf-cyan);
        border-color: var(--tf-cyan);
        background: rgba(79,172,254,0.12);
      }

      /* Semi-transparent backdrop — closes panel on outside tap */
      .mpb-backdrop {
        display: block;
        position: fixed; inset: 0;
        z-index: 999;
        background: rgba(0,0,0,0.45);
        animation: mpbFadeIn 0.18s ease;
      }

      /* Slide-down panel */
      .mpb-panel {
        display: block;
        position: fixed;
        top: 110px;
        right: 16px;
        width: min(340px, calc(100vw - 32px));
        z-index: 1001;
        background: var(--tf-bg-surface);
        border: 1px solid var(--tf-border);
        border-radius: var(--tf-radius-md);
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        max-height: calc(100vh - 140px);
        overflow-y: auto;
        animation: mpbSlideDown 0.2s cubic-bezier(0.4,0,0.2,1);
      }

      @keyframes mpbSlideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes mpbFadeIn {
        from { opacity: 0; } to { opacity: 1; }
      }
    }

    /* ── Responsive ──────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      /* Portfolio banner: stack identity → stats → CTA */
      .portfolio-banner {
        grid-template-columns: 1fr;
        gap: 14px;
        padding: 14px 16px;
      }

      /* Stats: keep 3 columns but compact padding & font */
      .pb-stats { gap: 0; }
      .pb-stat  { padding: 0 12px; }
      .pb-stat:first-child { padding-left: 0; }
      .pb-s-val { font-size: 15px; }
      .pb-s-pct { font-size: 10px; }
      .pb-pnl-row { gap: 4px; flex-wrap: wrap; }

      /* "View Full Portfolio" — stretch to full width */
      .pb-cta { width: 100%; justify-content: center; }

      /* Metrics strip: 2-col on mobile */
      .metrics-strip { grid-template-columns: repeat(2, 1fr); }

      /* Dashboard header */
      .dashboard-header { flex-direction: column; gap: 10px; }

      /* MF cards: allow fund name to wrap so long names don't squeeze P&L % off-screen */
      .mf-fcard-name { white-space: normal; line-height: 1.35; }
      .mf-fcard-name-row { align-items: flex-start; }
      .mf-pnl-pct { padding-top: 2px; }

      /* Hide shortcut buttons on mobile — all pages reachable via bottom nav.
         Hiding these clears the top-right area for the floating pills. */
      .header-actions { display: none; }
    }

    @media (max-width: 480px) {
      /* Stats: 2 cols on very small phones, P&L moves to full row below */
      .pb-stats { grid-template-columns: 1fr 1fr; row-gap: 12px; }
      .pb-stat:last-child {
        grid-column: 1 / -1;
        border-left: none;
        border-top: 1px solid var(--tf-border);
        padding: 12px 0 0;
      }
      .pb-s-val { font-size: 16px; }
    }

    /* ── Empty State (new user, no holdings) ─────────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 24px;
      text-align: center;
      min-height: 60vh;
    }
    .empty-icon {
      width: 96px; height: 96px;
      border-radius: 50%;
      background: rgba(0, 212, 170, 0.1);
      border: 2px solid rgba(0, 212, 170, 0.3);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 32px;
    }
    .empty-main-icon {
      font-size: 48px; width: 48px; height: 48px;
      color: var(--tf-cyan);
    }
    .empty-title {
      font-size: 28px; font-weight: 700;
      color: var(--tf-text-primary);
      margin: 0 0 12px;
    }
    .empty-subtitle {
      font-size: 16px; color: var(--tf-text-secondary);
      line-height: 1.6; margin: 0 0 40px;
      max-width: 360px;
    }
    .empty-actions {
      display: flex; gap: 16px; flex-wrap: wrap;
      justify-content: center; margin-bottom: 28px;
    }
    .empty-btn-primary {
      padding: 0 28px; height: 48px;
      font-size: 15px; font-weight: 600;
    }
    .empty-btn-mf {
      padding: 0 28px; height: 48px;
      font-size: 15px; font-weight: 600;
      background: rgba(79,172,254,0.12) !important;
      color: var(--tf-cyan) !important;
      border: 1px solid rgba(79,172,254,0.4) !important;
    }
    .empty-btn-mf:hover { background: rgba(79,172,254,0.22) !important; }

    /* Explore links — catchy discovery rows below the primary CTAs */
    .empty-explore {
      display: flex; flex-direction: column; gap: 10px;
      width: 100%; max-width: 440px; margin-bottom: 40px;
    }
    .explore-link {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); text-decoration: none;
      transition: border-color 0.18s, background 0.18s, transform 0.15s;
    }
    .explore-link:hover {
      border-color: var(--tf-cyan); background: rgba(79,172,254,0.06);
      transform: translateX(4px);
    }
    .explore-link > mat-icon:first-child {
      font-size: 22px; width: 22px; height: 22px;
      color: var(--tf-cyan); flex-shrink: 0;
    }
    .explore-link-text { display: flex; flex-direction: column; flex: 1; text-align: left; }
    .explore-link-title {
      font-size: 14px; font-weight: 600; color: var(--tf-text-primary);
    }
    .explore-link-sub {
      font-size: 11px; color: var(--tf-text-muted); margin-top: 2px;
    }
    .explore-link-arrow {
      font-size: 18px; color: var(--tf-text-muted); flex-shrink: 0;
      transition: color 0.15s;
    }
    .explore-link:hover .explore-link-arrow { color: var(--tf-cyan); }

    .empty-features {
      display: flex; gap: 32px; flex-wrap: wrap;
      justify-content: center;
    }
    .empty-feature {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: var(--tf-text-secondary);
    }
    .ef-icon { font-size: 18px; width: 18px; height: 18px; }

    /* Empty holdings inside the Stocks tab (when user has portfolio but no stocks yet) */
    .empty-holdings-actions {
      display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px;
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {

  private readonly store  = inject(Store);
  private readonly router = inject(Router);

  // WHY isNewUser / availableBalance as signals?
  // Drives the empty-state template branch (@if isNewUser()) and the funds display.
  // toSignal avoids async pipes and plays well with OnPush change detection.
  readonly isNewUser = toSignal(this.store.select(selectIsNewUser), { initialValue: true });
  readonly availableBalance = toSignal(this.store.select(selectAvailableBalance), { initialValue: 0 });

  // WHY keep Observables alongside signals? The async pipe in the template still needs them.
  // toSignal() versions are used in computed() where the injection context is available.
  readonly currentUser$: Observable<UserInfo | null> = this.store.select(selectCurrentUser);
  readonly summary$: Observable<PortfolioSummary | null> = this.store.select(selectPortfolioSummary);
  readonly holdings$: Observable<Holding[]> = this.store.select(selectAllHoldings);
  readonly loading$: Observable<boolean> = this.store.select(selectPortfolioLoading);
  readonly watchlist$: Observable<StockQuote[]> = this.store.select(selectWatchlistQuotes);

  // WHY toSignal? Lets computed() react to portfolio state without async pipes.
  private readonly summaryS = toSignal(this.store.select(selectPortfolioSummary), { initialValue: null as PortfolioSummary | null });

  // WHY signal for tab? Local UI state — no need for NgRx for a view-only toggle.
  readonly activeTab = signal<'stocks' | 'mf'>('stocks');

  // WHY activePanel signal? Controls which mobile popup panel is visible — local UI state only.
  readonly activePanel = signal<'watchlist' | 'indices' | null>(null);

  // WHY mock MF holdings? Portfolio-service only tracks stock holdings.
  // Full MF integration (buy/sell NAV units) is a future sprint.
  // For now, show realistic mock data so the dashboard MF tab has content.
  // WHY xirr/cagr on mock data? XIRR needs actual cashflow dates — approximated here.
  // CAGR is back-calculated from (currentValue/invested)^(1/years)−1 with assumed hold durations.
  readonly mfHoldings = signal([
    { name: 'Mirae Asset Large Cap Fund',      fundId: 'MIRAE-LARGE-CAP',  category: 'EQUITY', invested: 25000, currentValue: 31240, pnl: 6240,  pnlPct: 24.96, xirr: 9.8,  cagr: 8.2  },
    { name: 'HDFC Mid-Cap Opportunities Fund', fundId: 'HDFC-MIDCAP',      category: 'EQUITY', invested: 15000, currentValue: 21750, pnl: 6750,  pnlPct: 45.0,  xirr: 18.4, cagr: 14.7 },
    { name: 'ICICI Pru Balanced Advantage',    fundId: 'ICICI-BAF',        category: 'HYBRID', invested: 12000, currentValue: 14208, pnl: 2208,  pnlPct: 18.4,  xirr: 7.2,  cagr: 6.8  },
    { name: 'Axis ELSS Tax Saver Fund',        fundId: 'AXIS-ELSS',        category: 'ELSS',   invested: 18000, currentValue: 23238, pnl: 5238,  pnlPct: 29.1,  xirr: 11.5, cagr: 9.4  },
    { name: 'HDFC Short Term Debt Fund',       fundId: 'HDFC-SHORT-DEBT',  category: 'DEBT',   invested: 20000, currentValue: 21440, pnl: 1440,  pnlPct: 7.2,   xirr: 6.8,  cagr: 6.5  },
  ]);

  readonly mfInvested     = computed(() => this.mfHoldings().reduce((s, m) => s + m.invested,      0));
  readonly mfCurrentValue = computed(() => this.mfHoldings().reduce((s, m) => s + m.currentValue,  0));
  readonly mfPnl          = computed(() => this.mfCurrentValue() - this.mfInvested());
  readonly mfPnlPct       = computed(() => this.mfInvested() > 0 ? (this.mfPnl() / this.mfInvested()) * 100 : 0);
  // WHY weighted avg for totals? Portfolio XIRR/CAGR aggregated by invested-capital weight.
  readonly mfTotalXirr    = computed(() => {
    const h = this.mfHoldings(), inv = this.mfInvested();
    return inv > 0 ? h.reduce((s, m) => s + m.xirr * m.invested, 0) / inv : 0;
  });
  readonly mfTotalCagr    = computed(() => {
    const h = this.mfHoldings(), inv = this.mfInvested();
    return inv > 0 ? h.reduce((s, m) => s + m.cagr * m.invested, 0) / inv : 0;
  });

  // WHY mock MF today P&L? MF NAVs update once daily (not real-time).
  // Approximated as ~0.15% of current value for dashboard display.
  readonly mfTodayPnl    = computed(() => this.mfCurrentValue() * 0.0015);
  readonly mfTodayPnlPct = computed(() => 0.15);

  // WHY annualized approximation for stock XIRR/CAGR?
  // Real XIRR needs individual cashflow dates per buy transaction — not available here.
  // Approximation: assume 2-year avg holding period, derive annualized rate from total P&L %.
  // XIRR carries a ~1.08x premium over CAGR due to SIP cashflow timing.
  readonly stockCagr = computed(() => {
    const pct = this.summaryS()?.totalPnlPercent ?? 0;
    if (pct === 0) return 0;
    return (Math.pow(1 + pct / 100, 0.5) - 1) * 100;
  });
  readonly stockXirr = computed(() => this.stockCagr() * 1.08);

  // Combined portfolio (stocks + MF) — for the top banner
  readonly portfInvested = computed(() => (this.summaryS()?.totalInvested ?? 0) + this.mfInvested());
  readonly portfCurrent  = computed(() => (this.summaryS()?.currentValue  ?? 0) + this.mfCurrentValue());
  readonly portfPnl      = computed(() => this.portfCurrent() - this.portfInvested());
  readonly portfPnlPct   = computed(() =>
    this.portfInvested() > 0 ? (this.portfPnl() / this.portfInvested()) * 100 : 0);

  // WHY tabMetrics computed? A single reactive object that switches values when the user
  // clicks Stocks ↔ Mutual Funds — drives the 6-metric strip without any manual event handling.
  readonly tabMetrics = computed(() => {
    if (this.activeTab() === 'mf') {
      return {
        invested:    this.mfInvested(),
        currentVal:  this.mfCurrentValue(),
        totalPnl:    this.mfPnl(),
        totalPnlPct: this.mfPnlPct(),
        dayPnl:      this.mfTodayPnl(),
        dayPnlPct:   this.mfTodayPnlPct(),
        xirr:        this.mfTotalXirr(),
        cagr:        this.mfTotalCagr(),
      };
    }
    const s = this.summaryS();
    return {
      invested:    s?.totalInvested   ?? 0,
      currentVal:  s?.currentValue    ?? 0,
      totalPnl:    s?.totalPnl        ?? 0,
      totalPnlPct: s?.totalPnlPercent ?? 0,
      dayPnl:      s?.dayPnl          ?? 0,
      dayPnlPct:   s?.dayPnlPercent   ?? 0,
      xirr:        this.stockXirr(),
      cagr:        this.stockCagr(),
    };
  });

  // WHY simulated live indices? Real NSE index feed requires a paid data subscription.
  // We simulate small ±0.05% tick movements every 3 seconds using a seeded formula
  // so the indices strip feels alive without a real data source.
  private readonly _indexBase = [
    { name: 'NIFTY 50',   symbol: 'NIFTY',     base: 22147.85, dayChange:  184.30 },
    { name: 'SENSEX',     symbol: 'SENSEX',     base: 73088.33, dayChange:  612.21 },
    { name: 'BANK NIFTY', symbol: 'BANKNIFTY',  base: 47621.40, dayChange:  -89.15 },
    { name: 'NIFTY IT',   symbol: 'NIFTYIT',    base: 38412.60, dayChange:  521.80 },
  ];
  readonly indices = signal(this._indexBase.map(i => ({
    name: i.name, symbol: i.symbol,
    value: i.base, change: i.dayChange,
    changePct: parseFloat(((i.dayChange / (i.base - i.dayChange)) * 100).toFixed(2)),
  })));
  private _indexTimer: ReturnType<typeof setInterval> | null = null;

  today = new Date();

  ngOnInit(): void {
    // WHY dispatch both? Dashboard needs portfolio P&L and market prices.
    // Portfolio service enriches holdings with live prices from market-service.
    this.store.dispatch(PortfolioActions.loadPortfolio());
    this.store.dispatch(MarketActions.loadWatchlist());

    // WHY setInterval for indices? Simulates real-time index ticks.
    // Each tick applies a small ±0.05% variation using a sin-based deterministic formula
    // so the numbers feel live without a paid NSE data feed.
    this._indexTimer = setInterval(() => {
      const t = Date.now() / 1000;
      this.indices.update(list => list.map((idx, i) => {
        const base = this._indexBase[i].base;
        const noise = Math.sin(t * (0.3 + i * 0.17)) * base * 0.0003;
        const newValue = parseFloat((base + this._indexBase[i].dayChange + noise).toFixed(2));
        const newChange = parseFloat((newValue - base).toFixed(2));
        return { ...idx, value: newValue, change: newChange,
                 changePct: parseFloat(((newChange / base) * 100).toFixed(2)) };
      }));
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this._indexTimer) clearInterval(this._indexTimer);
  }

  // WHY helper methods on component?
  // Angular templates can only call methods on the component.
  // These are small, pure computations — fine for OnPush since they're called
  // with stable inputs and don't trigger extra change detection.

  getPnlColor(pnl: number): string {
    if (pnl > 0) return 'var(--tf-green)';
    if (pnl < 0) return 'var(--tf-red)';
    return 'var(--tf-text-secondary)';
  }

  getPnlIcon(pnl: number): string {
    if (pnl > 0) return 'trending_up';
    if (pnl < 0) return 'trending_down';
    return 'trending_flat';
  }

  formatPnl(pnl: number): string {
    const abs = Math.abs(pnl);
    const sign = pnl >= 0 ? '+' : '-';
    return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }

  // WHY isNeutral? Stocks with < 0.5% absolute change show a gray neutral border
  // instead of green/red — avoids false signal on tiny price movements.
  isNeutral(h: Holding): boolean {
    return Math.abs(h.pnlPercent) < 0.5;
  }

  // WHY goToMF? Navigates to the MF screener with source=dashboard so buy/sell options
  // are shown when the user selects a fund (source-aware routing).
  goToMF(): void {
    this.router.navigate(['/mutual-funds'], { queryParams: { source: 'dashboard' } });
  }

  // WHY goToFundDetail? Clicking a specific MF holding card should open that fund's detail
  // directly instead of dropping the user on the screener and making them search again.
  goToFundDetail(fundId: string): void {
    this.router.navigate(['/mutual-funds'], { queryParams: { source: 'dashboard', fundId } });
  }

  // WHY sort by invested amount instead of pnlPercent?
  // pnlPercent updates on every WebSocket price tick → list re-sorted 15×/sec
  // → items visually jumped positions constantly (re-ordering flicker).
  // Invested amount (qty × avgPrice) never changes during a session → stable order.
  // Largest position first is the most useful default for a trader dashboard.
  sortedHoldings(holdings: Holding[]): Holding[] {
    return [...holdings].sort(
      (a, b) => (b.quantity * b.averagePrice) - (a.quantity * a.averagePrice)
    );
  }

  // WHY setTab instead of activeTab.set() directly in template?
  // Centralizes tab switch logic — if we need animations or side effects later,
  // there's one place to add them.
  setTab(tab: 'stocks' | 'mf'): void {
    this.activeTab.set(tab);
  }

  // WHY togglePanel? Tapping the same pill again closes it; tapping another switches panels.
  togglePanel(panel: 'watchlist' | 'indices'): void {
    this.activePanel.update(cur => cur === panel ? null : panel);
  }
}
