// Markets page — multi-watchlist management with live prices
// 3 named watchlists (10 stocks each), 5-symbol dashboard pin, reorder, rename.

import { Component, inject, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MarketActions, StockQuote } from './state/market.actions';
import { selectAllQuotes, selectWatchlists, selectDashboardSymbols, selectMarketLoading, selectSearchResults } from './state/market.selectors';
import { WatchlistGroup } from './state/market.reducer';
import { WebSocketService } from '../../core/services/websocket.service';
import { OrderFormComponent } from '../orders/order-form/order-form.component';
import { TransactionType } from '../../core/models/order.models';
import { selectAccessToken } from '../auth/state/auth.selectors';

@Component({
  selector: 'app-markets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatProgressBarModule, MatButtonModule, MatTooltipModule, OrderFormComponent],
  template: `
    <div class="mp-page">

      <!-- ── Page Header ──────────────────────────────────────────────── -->
      <div class="mp-header">
        <div class="mp-title-group">
          <h1 class="mp-title">
            <mat-icon class="mp-title-icon">candlestick_chart</mat-icon>
            Watchlist
          </h1>
          <span class="mp-subtitle">3 watchlists · 10 stocks each · Pin up to 5 to Dashboard</span>
        </div>
        <div class="ws-indicator" [class.connected]="wsConnected()">
          <span class="ws-dot"></span>
          {{ wsConnected() ? 'Live' : 'Connecting...' }}
        </div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" class="mp-loader"></mat-progress-bar> }

      <!-- Order form slide-in -->
      @if (selectedQuote()) {
        <div class="order-panel">
          <app-order-form
            [symbol]="selectedQuote()!.symbol"
            [currentPrice]="selectedQuote()!.price"
            [defaultType]="orderType()"
            (onClose)="selectedQuote.set(null)"
            (onOrderPlaced)="selectedQuote.set(null)">
          </app-order-form>
        </div>
      }

      <!-- ── Watchlist Tabs ─────────────────────────────────────────────── -->
      <div class="wl-tabs">
        @for (wl of watchlists(); track wl.name; let i = $index) {
          <button class="wl-tab" [class.active]="activeTab() === i" (click)="activeTab.set(i)">
            <mat-icon class="wl-tab-icon">bookmark</mat-icon>
            <span class="wl-tab-name">{{ wl.name }}</span>
            <span class="wl-tab-count" [class.full]="wl.symbols.length >= 10">
              {{ wl.symbols.length }}/10
            </span>
          </button>
        }
      </div>

      <!-- ── Active Watchlist Card ──────────────────────────────────────── -->
      @if (activeWatchlist(); as wl) {
        <div class="wl-card">

          <!-- ── Card header: title + rename + pin summary ──────────── -->
          <div class="wl-card-header">
            @if (renamingTab() === activeTab()) {
              <input class="wl-rename-input"
                [value]="wl.name"
                (blur)="finishRename($event)"
                (keydown.enter)="finishRename($event)"
                (keydown.escape)="renamingTab.set(null)"
                autofocus>
            } @else {
              <span class="wl-card-title">{{ wl.name }}</span>
              <button class="wl-rename-btn" (click)="startRename()" matTooltip="Rename watchlist">
                <mat-icon>edit</mat-icon>
              </button>
            }
            <span class="wl-card-spacer"></span>
            <span class="dash-pin-summary" matTooltip="Symbols pinned to Dashboard widget">
              <mat-icon class="dash-pin-icon">push_pin</mat-icon>
              Dashboard: {{ dashboardSymbols().length }}/5
            </span>
          </div>

          <!-- ── Search bar at top — 3+ chars shows suggestions ──────── -->
          <div class="wl-search-section">
            @if (wl.symbols.length >= 10) {
              <div class="wl-full-msg">
                <mat-icon>info_outline</mat-icon>
                <span>Watchlist full (10/10) — remove a stock to add another</span>
              </div>
            } @else {
              <div class="wl-search-wrap">
                <mat-icon class="wl-search-icon">search</mat-icon>
                <input class="wl-search-input"
                  [value]="addQuery()"
                  (input)="onSearchInput($event)"
                  placeholder="Type 3+ characters to search &amp; add a symbol…"
                  autocomplete="off">
                @if (addQuery()) {
                  <button class="wl-search-clear" (click)="addQuery.set('')">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
              @if (addSuggestions().length > 0) {
                <div class="wl-suggestions">
                  @for (q of addSuggestions(); track q.symbol) {
                    <button class="wl-suggestion-row" (click)="addSymbol(q.symbol)">
                      <mat-icon class="sug-add-icon">add_circle_outline</mat-icon>
                      <span class="sug-sym">{{ q.symbol }}</span>
                      <span class="sug-name">{{ q.name }}</span>
                      <span class="sug-price text-mono">₹{{ q.price | number:'1.2-2' }}</span>
                    </button>
                  }
                </div>
              }
            }
          </div>

          <!-- ── Table (scroll wrapper — horizontal scroll on mobile only) ── -->
          <div class="wl-scroll-outer">
            <div class="wl-scroll-inner">

              <!-- ── Table header ─────────────────────────────────────── -->
              @if (wl.symbols.length > 0) {
                <div class="wl-table-head">
                  <span class="col-sym">Symbol</span>
                  <span class="col-price">Price</span>
                  <span class="col-chg">Change</span>
                  <span class="col-vol">Volume</span>
                  <span class="col-acts">Actions</span>
                </div>
              }

              <!-- ── Rows ─────────────────────────────────────────────── -->
              @if (wl.symbols.length === 0) {
                <div class="wl-empty">
                  <mat-icon>bookmark_border</mat-icon>
                  <p>This watchlist is empty.</p>
                  <span>Search for a symbol above to add stocks.</span>
                </div>
              } @else {
                <div class="wl-rows">
                  @for (symbol of wl.symbols; track symbol; let i = $index) {
                    @if (quotes()[symbol]; as q) {
                      <div class="wl-row" (click)="goToDetail(symbol)">

                        <div class="col-sym">
                          <span class="wl-sym">{{ q.symbol }}</span>
                          <span class="wl-name">{{ q.name }}</span>
                        </div>

                        <div class="col-price">
                          <span class="wl-price text-mono">₹{{ q.price | number:'1.2-2' }}</span>
                        </div>

                        <div class="col-chg">
                          <span class="wl-chg-pct"
                            [class.text-green]="q.changePercent >= 0"
                            [class.text-red]="q.changePercent < 0">
                            {{ q.changePercent >= 0 ? '+' : '' }}{{ q.changePercent | number:'1.2-2' }}%
                          </span>
                          <span class="wl-chg-abs text-mono"
                            [class.text-green]="q.change >= 0"
                            [class.text-red]="q.change < 0">
                            {{ q.change >= 0 ? '+' : '' }}{{ q.change | number:'1.2-2' }}
                          </span>
                        </div>

                        <div class="col-vol">
                          <span class="wl-vol text-mono text-muted">{{ q.volume | number }}</span>
                        </div>

                        <div class="col-acts" (click)="$event.stopPropagation()">
                          <button class="act-btn buy-btn" (click)="openOrder(q, 'BUY')" matTooltip="Buy">B</button>
                          <button class="act-btn sell-btn" (click)="openOrder(q, 'SELL')" matTooltip="Sell">S</button>

                          <span class="act-divider"></span>

                          <button class="act-icon-btn pin-btn"
                            [class.pinned]="isPinned(symbol)"
                            [matTooltip]="isPinned(symbol) ? 'Unpin from Dashboard' : (dashboardSymbols().length >= 5 ? 'Dashboard full (5/5)' : 'Pin to Dashboard')"
                            (click)="togglePin(symbol)">
                            <mat-icon>{{ isPinned(symbol) ? 'star' : 'star_border' }}</mat-icon>
                          </button>

                          <span class="act-divider"></span>

                          <button class="act-icon-btn reorder-btn"
                            [disabled]="i === 0" matTooltip="Move up" (click)="moveUp(i)">
                            <mat-icon>keyboard_arrow_up</mat-icon>
                          </button>
                          <button class="act-icon-btn reorder-btn"
                            [disabled]="i === wl.symbols.length - 1" matTooltip="Move down" (click)="moveDown(i)">
                            <mat-icon>keyboard_arrow_down</mat-icon>
                          </button>

                          <span class="act-divider"></span>

                          <button class="act-icon-btn remove-btn"
                            matTooltip="Remove from watchlist" (click)="removeSymbol(i)">
                            <mat-icon>close</mat-icon>
                          </button>
                        </div>

                      </div>
                    }
                  }
                </div>
              }

            </div><!-- /wl-scroll-inner -->
          </div><!-- /wl-scroll-outer -->

          <!-- Mobile swipe hint -->
          @if (wl.symbols.length > 0) {
            <div class="scroll-hint-bar mobile-only">
              <mat-icon class="scroll-hint-icon">swipe</mat-icon>
              Swipe to see all columns
            </div>
          }

        </div>
      }

    </div>
  `,
  styles: [`
    mat-icon {
      display: inline-flex !important; align-items: center !important;
      justify-content: center !important; line-height: 1 !important; flex-shrink: 0;
    }

    .mp-page { padding: 24px 28px; animation: mpIn 0.3s cubic-bezier(0.4,0,0.2,1); }
    @keyframes mpIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

    /* ── Header ──────────────────────────────────────────────────────── */
    .mp-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .mp-title-group { display: flex; flex-direction: column; gap: 3px; }
    .mp-title {
      display: flex; align-items: center; gap: 10px;
      font-size: 22px; font-weight: 800; color: var(--tf-text-primary); margin: 0;
    }
    .mp-title-icon { font-size: 22px; width: 22px; height: 22px; color: var(--tf-cyan); }
    .mp-subtitle { font-size: 12px; color: var(--tf-text-muted); padding-left: 32px; }
    .mp-loader { border-radius: 0; margin-bottom: 16px; }

    /* ── Live indicator ──────────────────────────────────────────────── */
    .ws-indicator {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600; color: var(--tf-text-muted);
    }
    .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tf-text-muted); flex-shrink: 0; }
    .ws-indicator.connected { color: var(--tf-green); }
    .ws-indicator.connected .ws-dot { background: var(--tf-green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

    /* ── Order panel ─────────────────────────────────────────────────── */
    .order-panel { margin-bottom: 20px; max-width: 400px; }

    /* ── Watchlist Tabs ──────────────────────────────────────────────── */
    .wl-tabs {
      display: flex; gap: 6px; margin-bottom: 14px;
    }
    .wl-tab {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 16px; border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      color: var(--tf-text-secondary); font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s;
    }
    .wl-tab:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .wl-tab.active {
      background: rgba(57,208,216,0.1); border-color: rgba(57,208,216,0.5);
      color: var(--tf-cyan);
    }
    .wl-tab-icon { font-size: 16px; width: 16px; height: 16px; }
    .wl-tab-name { white-space: nowrap; }
    .wl-tab-count {
      font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
      background: rgba(255,255,255,0.06); color: var(--tf-text-muted);
    }
    .wl-tab-count.full { background: rgba(248,81,73,0.12); color: var(--tf-red); }

    /* ── Watchlist Card ──────────────────────────────────────────────── */
    .wl-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); overflow: hidden;
      animation: cardIn 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes cardIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

    /* Card header */
    .wl-card-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; border-bottom: 1px solid var(--tf-border);
      background: rgba(255,255,255,0.02);
    }
    .wl-card-title { font-size: 15px; font-weight: 700; color: var(--tf-text-primary); }
    .wl-rename-btn {
      background: none; border: none; cursor: pointer; padding: 2px;
      color: var(--tf-text-muted); transition: color 0.15s;
      display: inline-flex; align-items: center;
    }
    .wl-rename-btn:hover { color: var(--tf-cyan); }
    .wl-rename-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .wl-rename-input {
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-cyan);
      border-radius: 4px; padding: 4px 10px; color: var(--tf-text-primary);
      font-size: 14px; font-weight: 700; outline: none; min-width: 160px;
    }
    .wl-card-spacer { flex: 1; }
    .dash-pin-summary {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; color: var(--tf-text-muted);
    }
    .dash-pin-icon { font-size: 14px; width: 14px; height: 14px; color: var(--tf-yellow); }

    /* ── Table head ──────────────────────────────────────────────────── */
    .wl-table-head {
      display: flex; align-items: center;
      padding: 8px 18px; gap: 12px;
      font-size: 10px; font-weight: 700; color: var(--tf-text-muted);
      text-transform: uppercase; letter-spacing: 0.07em;
      border-bottom: 1px solid var(--tf-border);
      background: rgba(255,255,255,0.01);
    }

    /* Column widths — shared between head and rows */
    .col-sym   { flex: 1.8; min-width: 0; }
    .col-price { flex: 1; min-width: 80px; }
    .col-chg   { flex: 1.2; min-width: 90px; }
    .col-vol   { flex: 1; min-width: 80px; }
    .col-acts  { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; }

    /* ── Rows ────────────────────────────────────────────────────────── */
    .wl-rows { display: flex; flex-direction: column; }
    .wl-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      cursor: pointer; transition: background 0.12s;
      /* WHY contain: layout style (not paint)?
         layout — prevents descendants from causing reflow outside this row.
         style  — prevents CSS counter/quote bleed to sibling rows.
         Deliberately NO 'paint' containment: paint creates per-row stacking
         contexts. When combined with GPU compositing (transform/will-change),
         multiple stacking contexts can repaint in non-deterministic visual order,
         making rows appear to jump/reorder on every price tick. */
      contain: layout style;
    }
    .wl-row:last-child { border-bottom: none; }
    .wl-row:hover { background: rgba(255,255,255,0.03); }

    .wl-sym   { display: block; font-size: 13px; font-weight: 700; color: var(--tf-text-primary); }
    .wl-name  { display: block; font-size: 11px; color: var(--tf-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* WHY font-variant-numeric + transition?
       font-variant-numeric: tabular-nums — all digits share identical widths.
       Without this, changing e.g. "1" → "7" causes micro layout-shifts (flickering).
       transition: color — price color changes (green/red) fade smoothly instead of flashing. */
    .wl-price {
      font-size: 13px; font-weight: 700;
      font-variant-numeric: tabular-nums;
      transition: color 0.35s ease;
    }
    .wl-chg-pct {
      display: block; font-size: 12px; font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
      transition: color 0.35s ease;
    }
    .wl-chg-abs {
      display: block; font-size: 10px;
      font-variant-numeric: tabular-nums;
      transition: color 0.35s ease;
    }
    .wl-vol { font-size: 12px; font-variant-numeric: tabular-nums; }

    /* Action buttons in each row */
    .act-btn {
      height: 26px; padding: 0 8px; border-radius: 4px; border: none;
      font-size: 11px; font-weight: 800; cursor: pointer; transition: all 0.12s;
    }
    .buy-btn  { background: rgba(63,185,80,0.15); color: var(--tf-green); }
    .buy-btn:hover  { background: rgba(63,185,80,0.3); }
    .sell-btn { background: rgba(248,81,73,0.15); color: var(--tf-red); }
    .sell-btn:hover { background: rgba(248,81,73,0.3); }

    .act-divider { width: 1px; height: 18px; background: var(--tf-border); flex-shrink: 0; }

    .act-icon-btn {
      background: none; border: none; cursor: pointer; padding: 3px;
      color: var(--tf-text-muted); border-radius: 4px; transition: all 0.12s;
      display: inline-flex; align-items: center;
    }
    .act-icon-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .act-icon-btn:hover { background: rgba(255,255,255,0.06); color: var(--tf-text-primary); }
    .act-icon-btn:disabled { opacity: 0.25; cursor: default; }
    .act-icon-btn:disabled:hover { background: none; color: var(--tf-text-muted); }

    .pin-btn:hover { color: var(--tf-yellow); }
    .pin-btn.pinned { color: var(--tf-yellow); }

    .remove-btn:hover { color: var(--tf-red); background: rgba(248,81,73,0.08); }

    /* ── Empty state ─────────────────────────────────────────────────── */
    .wl-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 48px 24px; color: var(--tf-text-muted); text-align: center;
    }
    .wl-empty mat-icon { font-size: 36px; width: 36px; height: 36px; color: var(--tf-border); }
    .wl-empty p { margin: 0; font-size: 14px; font-weight: 600; color: var(--tf-text-secondary); }
    .wl-empty span { font-size: 12px; }

    /* ── Search section (top of card, above table) ───────────────────── */
    .wl-search-section {
      padding: 10px 18px; border-bottom: 1px solid var(--tf-border);
      background: rgba(255,255,255,0.01); position: relative;
    }

    .wl-full-msg {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: var(--tf-text-muted);
    }
    .wl-full-msg mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--tf-yellow); }

    .wl-search-wrap {
      display: flex; align-items: center; gap: 8px;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 8px 12px;
      transition: border-color 0.15s;
    }
    .wl-search-wrap:focus-within { border-color: var(--tf-cyan); }
    .wl-search-icon { font-size: 18px; width: 18px; height: 18px; color: var(--tf-text-muted); }
    .wl-search-input {
      flex: 1; background: none; border: none; outline: none;
      color: var(--tf-text-primary); font-size: 13px;
    }
    .wl-search-input::placeholder { color: var(--tf-text-muted); }
    .wl-search-clear {
      background: none; border: none; cursor: pointer; padding: 0;
      color: var(--tf-text-muted); display: inline-flex; align-items: center;
      transition: color 0.12s;
    }
    .wl-search-clear:hover { color: var(--tf-text-primary); }
    .wl-search-clear mat-icon { font-size: 16px; width: 16px; height: 16px; }

    /* Suggestions dropdown — floats over the table, doesn't push layout */
    .wl-suggestions {
      position: absolute; left: 18px; right: 18px; top: calc(100% - 10px);
      z-index: 50; margin-top: 4px;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-cyan);
      border-top: none; border-radius: 0 0 var(--tf-radius-sm) var(--tf-radius-sm);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: sugIn 0.15s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes sugIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
    .wl-suggestion-row {
      width: 100%; display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: none; border: none;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      cursor: pointer; transition: background 0.12s; text-align: left;
    }
    .wl-suggestion-row:last-child { border-bottom: none; }
    .wl-suggestion-row:hover { background: rgba(57,208,216,0.05); }
    .sug-add-icon { font-size: 16px; width: 16px; height: 16px; color: var(--tf-cyan); flex-shrink: 0; }
    .sug-sym  { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); min-width: 80px; }
    .sug-name { font-size: 12px; color: var(--tf-text-muted); flex: 1; text-align: left; }
    .sug-price { font-size: 12px; color: var(--tf-text-secondary); font-variant-numeric: tabular-nums; }

    /* ── Scroll wrapper (mobile-only horizontal scroll) ─────────────── */
    .wl-scroll-outer {
      position: relative; /* anchor for the fade gradient */
    }
    .wl-scroll-inner { /* no special styles on desktop */ }

    /* ── Mobile swipe hint (hidden on desktop) ───────────────────────── */
    .scroll-hint-bar {
      display: none; /* hidden by default; shown on mobile via media query */
    }

    /* ── Responsive ───────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .mp-page { padding: 12px 14px; }
      .mp-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .mp-title { font-size: 18px; }
      .wl-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .wl-tab  { white-space: nowrap; flex-shrink: 0; }

      /* Drop horizontal scroll — no more gradient shadow */
      .wl-scroll-outer { overflow: visible; }
      .wl-scroll-inner { overflow: visible; }
      .wl-scroll-inner .wl-table-head,
      .wl-scroll-inner .wl-rows { min-width: unset; }

      /* Hide column header — layout is self-evident in compact rows */
      .wl-table-head { display: none; }

      /* Compact row: [sym+name] [price+chg] [actions] */
      .wl-row { padding: 10px 14px; gap: 10px; }

      /* Hide volume and change columns — keeps Symbol | Price | Actions only */
      .col-vol { display: none; }
      .col-chg { display: none; }

      /* Hide reorder buttons and the divider that sits between pin and reorder */
      .reorder-btn { display: none; }
      .col-acts > :nth-child(5) { display: none; } /* divider before reorder */

      /* Swipe hint no longer needed */
      .scroll-hint-bar { display: none; }
    }
  `]
})
export class MarketsComponent implements OnInit, OnDestroy {

  private readonly store    = inject(Store);
  private readonly wsService = inject(WebSocketService);
  private readonly router   = inject(Router);

  // ── Store signals ───────────────────────────────────────────────────────
  readonly watchlists       = toSignal(this.store.select(selectWatchlists),       { initialValue: [] as WatchlistGroup[] });
  readonly dashboardSymbols = toSignal(this.store.select(selectDashboardSymbols), { initialValue: [] as string[] });
  readonly quotes           = toSignal(this.store.select(selectAllQuotes),         { initialValue: {} as Record<string, StockQuote> });
  readonly loading          = toSignal(this.store.select(selectMarketLoading),     { initialValue: false });
  // WHY searchResults signal? Backend search returns a broader symbol pool beyond
  // the 15 pre-loaded WebSocket symbols. Merged with local quotes for suggestions.
  readonly searchResults    = toSignal(this.store.select(selectSearchResults),    { initialValue: [] as StockQuote[] });

  // ── Local UI signals ────────────────────────────────────────────────────
  readonly activeTab    = signal(0);
  readonly renamingTab  = signal<number | null>(null);
  readonly selectedQuote = signal<StockQuote | null>(null);
  readonly orderType    = signal<TransactionType>('BUY');
  readonly wsConnected  = signal(false);
  readonly addQuery     = signal('');

  // ── Computed ────────────────────────────────────────────────────────────
  readonly activeWatchlist = computed(() => this.watchlists()[this.activeTab()] ?? null);

  // Filter all loaded quotes by search query — exclude symbols already in the ACTIVE watchlist only.
  // WHY not all watchlists? All 15 default symbols are pre-loaded across the 3 watchlists,
  // so filtering by all watchlists produces an empty result every time.
  // A symbol in Watchlist 1 should still be addable to Watchlist 2.
  readonly addSuggestions = computed(() => {
    const q = this.addQuery().trim().toUpperCase();
    if (q.length < 3) return [];
    const activeWl = this.activeWatchlist();
    const inActiveWatchlist = new Set(activeWl ? activeWl.symbols : []);
    return Object.values(this.quotes())
      .filter(qt => (qt.symbol.includes(q) || qt.name.toUpperCase().includes(q)) && !inActiveWatchlist.has(qt.symbol))
      .slice(0, 6);
  });

  private wsStatusSub: any;

  ngOnInit(): void {
    this.store.dispatch(MarketActions.loadWatchlist());

    this.store.select(selectAccessToken).subscribe(token => {
      if (token) {
        this.wsService.connect(token);
        const symbols = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','WIPRO',
                         'BAJFINANCE','MARUTI','SUNPHARMA','TITAN','LTIM','AXISBANK',
                         'KOTAKBANK','SBIN','HINDUNILVR'];
        symbols.forEach(s => this.wsService.subscribeToSymbol(s));
      }
    });

    this.wsStatusSub = this.wsService.connectionStatus.subscribe(s => {
      this.wsConnected.set(s === 'connected');
    });
  }

  ngOnDestroy(): void {
    this.wsStatusSub?.unsubscribe();
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  startRename(): void {
    this.renamingTab.set(this.activeTab());
  }

  finishRename(event: Event): void {
    const val = (event.target as HTMLInputElement).value.trim();
    if (val) {
      this.store.dispatch(MarketActions.renameWatchlist({ index: this.activeTab(), name: val }));
    }
    this.renamingTab.set(null);
  }

  // ── Reorder ─────────────────────────────────────────────────────────────
  moveUp(pos: number): void {
    if (pos === 0) return;
    this.store.dispatch(MarketActions.reorderSymbolInWatchlist({
      index: this.activeTab(), fromPos: pos, toPos: pos - 1
    }));
  }

  moveDown(pos: number): void {
    const wl = this.activeWatchlist();
    if (!wl || pos >= wl.symbols.length - 1) return;
    this.store.dispatch(MarketActions.reorderSymbolInWatchlist({
      index: this.activeTab(), fromPos: pos, toPos: pos + 1
    }));
  }

  // ── Remove ──────────────────────────────────────────────────────────────
  removeSymbol(pos: number): void {
    const wl = this.activeWatchlist();
    if (!wl) return;
    this.store.dispatch(MarketActions.removeSymbolFromWatchlist({
      index: this.activeTab(), symbol: wl.symbols[pos]
    }));
  }

  // ── Add Symbol ──────────────────────────────────────────────────────────
  onSearchInput(event: Event): void {
    this.addQuery.set((event.target as HTMLInputElement).value);
  }

  addSymbol(symbol: string): void {
    this.store.dispatch(MarketActions.addSymbolToWatchlist({
      index: this.activeTab(), symbol
    }));
    this.addQuery.set('');
  }

  // ── Dashboard Pin ────────────────────────────────────────────────────────
  isPinned(symbol: string): boolean {
    return this.dashboardSymbols().includes(symbol);
  }

  togglePin(symbol: string): void {
    if (!this.isPinned(symbol) && this.dashboardSymbols().length >= 5) return;
    this.store.dispatch(MarketActions.toggleDashboardSymbol({ symbol }));
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  goToDetail(symbol: string): void {
    this.router.navigate(['/stock-detail', symbol], { queryParams: { source: 'markets' } });
  }

  openOrder(quote: StockQuote, type: TransactionType): void {
    this.selectedQuote.set(quote);
    this.orderType.set(type);
  }
}
