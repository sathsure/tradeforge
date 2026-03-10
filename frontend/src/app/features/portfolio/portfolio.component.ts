// WHY Portfolio redesign (Sprint 4)?
// The Sprint 2 portfolio page was a basic flat table.
// Sprint 4 adds: SVG allocation donut chart, visual P&L bars per holding,
// sort controls, and click-through to stock detail for deeper analysis.
// Uses toSignal() to bridge NgRx Observables to Angular Signals
// so computed() can derive the chart and sorted table from live state.

import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatIconModule }        from '@angular/material/icon';
import { MatButtonModule }      from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule }     from '@angular/material/tooltip';

import { PortfolioActions, Holding } from './state/portfolio.actions';
import {
  selectAllHoldings, selectPortfolioSummary, selectPortfolioLoading
} from './state/portfolio.selectors';

// Colour palette for the donut chart slices — works on dark background
const PALETTE = [
  '#58a6ff', '#3fb950', '#f0883e', '#d2992a',
  '#bc8cff', '#f85149', '#39d0d8', '#ffa657',
  '#79c0ff', '#a8ff96', '#ffa8b2', '#d2a8ff',
  '#ffba08', '#48cae4', '#f72585',
];

type SortKey = 'pnl' | 'name' | 'value';

interface DonutSegment {
  symbol: string;
  name:   string;
  color:  string;
  pct:    number;         // 0–1
  value:  number;         // rupees
  dashArray:  string;     // SVG stroke-dasharray
  dashOffset: number;     // SVG stroke-dashoffset
}

@Component({
  selector: 'app-portfolio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatTooltipModule,
  ],
  template: `
    <div class="portfolio-page">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">
            <mat-icon class="title-icon">pie_chart</mat-icon>
            Portfolio
          </h2>
          @if (!loading()) {
            <span class="holding-count">{{ holdings().length }} holdings</span>
          }
        </div>
        <div class="header-right">
          <div class="sort-chips">
            <span class="sort-label">Sort:</span>
            @for (s of sortOptions; track s.key) {
              <button class="sort-chip"
                [class.active]="sortBy() === s.key"
                (click)="sortBy.set(s.key)">{{ s.label }}</button>
            }
          </div>
          <button mat-icon-button (click)="refresh()" matTooltip="Refresh" class="refresh-btn">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </div>

      <!-- Loading bar -->
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" class="load-bar"></mat-progress-bar>
      }

      <!-- Summary Cards -->
      @if (summary()) {
        <div class="summary-grid">
          <div class="summary-card">
            <span class="sc-label">Total Invested</span>
            <span class="sc-value text-mono">₹{{ summary()!.totalInvested | number:'1.0-0' }}</span>
          </div>
          <div class="summary-card">
            <span class="sc-label">Current Value</span>
            <span class="sc-value text-mono"
              [style.color]="summary()!.totalPnl >= 0 ? 'var(--tf-green)' : 'var(--tf-red)'">
              ₹{{ summary()!.currentValue | number:'1.0-0' }}
            </span>
          </div>
          <div class="summary-card"
            [class.profit]="summary()!.totalPnl >= 0"
            [class.loss]="summary()!.totalPnl < 0">
            <span class="sc-label">Total P&amp;L</span>
            <span class="sc-value text-mono"
              [style.color]="summary()!.totalPnl >= 0 ? 'var(--tf-green)' : 'var(--tf-red)'">
              {{ summary()!.totalPnl >= 0 ? '+' : '' }}₹{{ summary()!.totalPnl | number:'1.0-0' }}
            </span>
            <span class="sc-pct"
              [class.pos]="summary()!.totalPnl >= 0"
              [class.neg]="summary()!.totalPnl < 0">
              {{ summary()!.totalPnlPercent >= 0 ? '+' : '' }}{{ summary()!.totalPnlPercent | number:'1.2-2' }}%
            </span>
          </div>
          <div class="summary-card"
            [class.profit]="summary()!.dayPnl >= 0"
            [class.loss]="summary()!.dayPnl < 0">
            <span class="sc-label">Today's P&amp;L</span>
            <span class="sc-value text-mono"
              [style.color]="summary()!.dayPnl >= 0 ? 'var(--tf-green)' : 'var(--tf-red)'">
              {{ summary()!.dayPnl >= 0 ? '+' : '' }}₹{{ summary()!.dayPnl | number:'1.0-0' }}
            </span>
            <span class="sc-pct"
              [class.pos]="summary()!.dayPnl >= 0"
              [class.neg]="summary()!.dayPnl < 0">
              {{ summary()!.dayPnlPercent >= 0 ? '+' : '' }}{{ summary()!.dayPnlPercent | number:'1.2-2' }}%
            </span>
          </div>
          <div class="summary-card available">
            <span class="sc-label">Available Cash</span>
            <span class="sc-value text-mono text-cyan">₹{{ summary()!.availableBalance | number:'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && holdings().length === 0) {
        <div class="empty-state">
          <mat-icon>account_balance_wallet</mat-icon>
          <h3>No holdings yet</h3>
          <p class="text-muted">Place your first order to see your portfolio here.</p>
        </div>
      }

      <!-- Main content: donut + table -->
      @if (holdings().length > 0) {
        <div class="main-grid">

          <!-- Allocation Donut Chart -->
          <div class="chart-card">
            <h3 class="card-title">Allocation</h3>

            <svg viewBox="0 0 200 200" class="donut-svg"
                 (mouseleave)="hoveredSeg.set(null)"
                 (touchstart)="hoveredSeg.set(null)">

              <!-- Background track -->
              <circle cx="100" cy="100" r="70"
                fill="none" stroke="var(--tf-border)" stroke-width="20"/>

              <!-- Segments -->
              @for (seg of donutSegments(); track seg.symbol) {
                <circle
                  cx="100" cy="100" r="70"
                  fill="none"
                  [attr.stroke]="seg.color"
                  stroke-width="20"
                  [attr.stroke-dasharray]="seg.dashArray"
                  [attr.stroke-dashoffset]="seg.dashOffset"
                  transform="rotate(-90 100 100)"
                  class="donut-seg"
                  [class.donut-seg-active]="hoveredSeg()?.symbol === seg.symbol"
                  (mouseenter)="hoveredSeg.set(seg)"
                  (touchstart)="hoveredSeg.set(seg); $event.stopPropagation()">
                </circle>
              }

              <!-- Center label: shows segment detail on hover/tap, totals otherwise -->
              @if (hoveredSeg(); as s) {
                <text x="100" y="87" text-anchor="middle" class="donut-hover-sym"
                      [attr.fill]="s.color">{{ s.symbol }}</text>
                <text x="100" y="103" text-anchor="middle" class="donut-hover-pct">
                  {{ (s.pct * 100) | number:'1.1-1' }}%
                </text>
                <text x="100" y="117" text-anchor="middle" class="donut-hover-val">
                  ₹{{ (s.value / 100000) | number:'1.1-1' }}L
                </text>
              } @else {
                <text x="100" y="96" text-anchor="middle" class="donut-center-top">Portfolio</text>
                <text x="100" y="113" text-anchor="middle" class="donut-center-val">
                  ₹{{ (totalValue() / 100000) | number:'1.1-1' }}L
                </text>
              }
            </svg>

            <!-- Hint text differs by device -->
            <p class="chart-hint hint-web">Hover segments to explore</p>
            <p class="chart-hint hint-mobile">Tap segments to explore</p>
          </div>

          <!-- Holdings Table -->
          <div class="holdings-card">
            <h3 class="card-title">Holdings</h3>
            <div class="holdings-scroll-outer">
            <div class="holdings-scroll-inner">
            <div class="holdings-list">
              @for (h of sortedHoldings(); track h.symbol; let i = $index) {
                <div class="holding-row" (click)="goToDetail(h.symbol)">

                  <!-- Color indicator matching donut -->
                  <div class="h-color-bar"
                    [style.background]="getColor(h.symbol)"></div>

                  <!-- Symbol + Name -->
                  <div class="h-identity">
                    <span class="h-sym">{{ h.symbol }}</span>
                    <span class="h-name text-muted">{{ h.name }}</span>
                  </div>

                  <!-- Qty + Avg -->
                  <div class="h-cost">
                    <span class="h-qty">{{ h.quantity }} shares</span>
                    <span class="h-avg text-muted">avg ₹{{ h.averagePrice | number:'1.2-2' }}</span>
                  </div>

                  <!-- Current Price + Day Change -->
                  <div class="h-price">
                    <span class="h-ltp text-mono">₹{{ h.currentPrice | number:'1.2-2' }}</span>
                    <span class="h-day"
                      [class.text-green]="h.dayChangePct >= 0"
                      [class.text-red]="h.dayChangePct < 0">
                      {{ h.dayChangePct >= 0 ? '+' : '' }}{{ h.dayChangePct | number:'1.2-2' }}%
                    </span>
                  </div>

                  <!-- Invested vs Current Value -->
                  <div class="h-value">
                    <span class="h-curr text-mono">₹{{ (h.currentPrice * h.quantity) | number:'1.0-0' }}</span>
                    <span class="h-inv text-muted">inv ₹{{ (h.averagePrice * h.quantity) | number:'1.0-0' }}</span>
                  </div>

                  <!-- P&L with visual bar -->
                  <div class="h-pnl-wrap">
                    <div class="h-pnl-bar-bg">
                      <div class="h-pnl-bar"
                        [class.pos]="h.pnl >= 0" [class.neg]="h.pnl < 0"
                        [style.width.%]="getPnlBarWidth(h.pnl)"></div>
                    </div>
                    <div class="h-pnl-text">
                      <span class="text-mono"
                        [class.text-green]="h.pnl >= 0" [class.text-red]="h.pnl < 0">
                        {{ h.pnl >= 0 ? '+' : '' }}₹{{ h.pnl | number:'1.0-0' }}
                      </span>
                      <span class="h-pnl-pct text-mono"
                        [class.text-green]="h.pnlPercent >= 0" [class.text-red]="h.pnlPercent < 0">
                        {{ h.pnlPercent >= 0 ? '+' : '' }}{{ h.pnlPercent | number:'1.2-2' }}%
                      </span>
                    </div>
                  </div>

                  <mat-icon class="h-chevron text-muted">chevron_right</mat-icon>
                </div>
              }
            </div><!-- /holdings-list -->
            </div><!-- /holdings-scroll-inner -->
            </div><!-- /holdings-scroll-outer -->
            <div class="scroll-hint-bar mobile-only">
              <mat-icon class="scroll-hint-icon">swipe</mat-icon>
              Swipe to see all columns
            </div>
          </div>

        </div>
      }

    </div>
  `,
  styles: [`
    .portfolio-page { padding: 24px; }

    /* Header */
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; flex-wrap: wrap; gap: 12px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .page-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 20px; font-weight: 600; color: var(--tf-text-primary); margin: 0;
    }
    .title-icon { color: var(--tf-cyan); }
    .holding-count {
      font-size: 12px; color: var(--tf-text-muted);
      background: var(--tf-bg-elevated); padding: 2px 10px; border-radius: 12px;
    }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .sort-chips { display: flex; align-items: center; gap: 6px; }
    .sort-label { font-size: 12px; color: var(--tf-text-muted); }
    .sort-chip {
      padding: 4px 12px; border-radius: 14px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--tf-border); background: var(--tf-bg-surface);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .sort-chip:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .sort-chip.active { background: var(--tf-cyan); color: #000; border-color: var(--tf-cyan); font-weight: 600; }
    .refresh-btn { color: var(--tf-text-muted) !important; }
    .load-bar { margin-bottom: 12px; }

    /* Summary cards */
    .summary-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px; margin-bottom: 20px;
    }
    .summary-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 14px 16px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .summary-card.profit { border-left: 3px solid var(--tf-green); }
    .summary-card.loss   { border-left: 3px solid var(--tf-red); }
    .summary-card.available { border-left: 3px solid var(--tf-cyan); }
    .sc-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sc-value { font-size: 18px; font-weight: 700; color: var(--tf-text-primary); }
    .sc-pct { font-size: 12px; font-weight: 600; }
    .sc-pct.pos { color: var(--tf-green); }
    .sc-pct.neg { color: var(--tf-red); }
    .text-cyan { color: var(--tf-cyan); }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 60px; text-align: center; color: var(--tf-text-muted);
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--tf-border); }
    .empty-state h3 { color: var(--tf-text-primary); margin: 0; }

    /* Main grid */
    .main-grid {
      display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start;
    }
    /* WHY min-width: 0 on grid children? CSS Grid items default to min-width: auto,
       meaning they expand to fit content (e.g. the 580px holdings table).
       This forces each cell to respect its track width and not overflow. */
    @media (max-width: 900px) {
      .main-grid { grid-template-columns: 1fr; overflow: hidden; }
      .chart-card, .holdings-card { min-width: 0; width: 100%; }
    }

    /* Chart + holdings cards */
    .chart-card, .holdings-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 20px;
    }
    /* WHY flex column + center? Ensures the SVG is always horizontally centered
       regardless of card width — more reliable than margin: 0 auto alone. */
    .chart-card {
      display: flex; flex-direction: column; align-items: center;
    }
    .card-title {
      font-size: 14px; font-weight: 600; color: var(--tf-text-primary);
      margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.04em;
      align-self: flex-start;
    }

    /* SVG donut — margin: 0 auto + flex centering on parent = double guarantee */
    .donut-svg {
      width: 100%; max-width: 220px;
      display: block; margin: 0 auto 8px;
      cursor: pointer;
    }
    .donut-seg {
      transition: opacity 0.18s, stroke-width 0.18s;
      cursor: pointer;
    }
    .donut-seg:hover, .donut-seg-active { opacity: 0.85; stroke-width: 24; }

    /* Center label — default state */
    .donut-center-top { font-size: 11px; fill: var(--tf-text-muted); font-family: system-ui; }
    .donut-center-val {
      font-size: 15px; fill: var(--tf-text-primary); font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Center label — hover state */
    .donut-hover-sym { font-size: 13px; font-weight: 700; font-family: system-ui; }
    .donut-hover-pct { font-size: 14px; font-weight: 700; fill: var(--tf-text-primary); font-family: 'JetBrains Mono', monospace; }
    .donut-hover-val { font-size: 11px; fill: var(--tf-text-muted); font-family: 'JetBrains Mono', monospace; }

    /* Hint text — each variant shown/hidden by media query */
    .chart-hint {
      font-size: 10px; color: var(--tf-text-muted); text-align: center;
      margin: 0; letter-spacing: 0.03em;
    }
    .hint-mobile { display: none; }
    @media (max-width: 768px) {
      .hint-web    { display: none; }
      .hint-mobile { display: block; }
    }


    /* Holdings list */
    .holdings-list { display: flex; flex-direction: column; }
    .holding-row {
      display: grid;
      grid-template-columns: 4px 130px 110px 90px 110px 1fr 24px;
      gap: 12px; align-items: center;
      padding: 12px 8px; cursor: pointer; transition: background 0.12s;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .holding-row:hover { background: var(--tf-bg-elevated); border-radius: 6px; }
    .holding-row:last-child { border-bottom: none; }

    .h-color-bar { width: 4px; height: 32px; border-radius: 2px; align-self: center; }
    .h-identity { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .h-sym { font-weight: 700; font-size: 13px; color: var(--tf-text-primary); }
    .h-name { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .h-cost { display: flex; flex-direction: column; gap: 2px; }
    .h-qty { font-size: 12px; color: var(--tf-text-secondary); }
    .h-avg { font-size: 11px; }
    .h-price { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
    .h-ltp { font-size: 13px; font-weight: 600; }
    .h-day { font-size: 11px; font-weight: 600; }
    .h-value { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
    .h-curr { font-size: 13px; font-weight: 600; color: var(--tf-text-primary); }
    .h-inv { font-size: 11px; }

    /* P&L bar */
    .h-pnl-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .h-pnl-bar-bg { height: 4px; background: var(--tf-border); border-radius: 2px; }
    .h-pnl-bar { height: 100%; border-radius: 2px; transition: width 0.4s; max-width: 100%; }
    .h-pnl-bar.pos { background: var(--tf-green); }
    .h-pnl-bar.neg { background: var(--tf-red); }
    .h-pnl-text { display: flex; justify-content: space-between; align-items: center; }
    .h-pnl-text span { font-size: 12px; font-weight: 600; }
    .h-pnl-pct { font-size: 11px !important; }
    .h-chevron { font-size: 18px !important; color: var(--tf-text-muted); }

    /* ── Scroll hint bar (hidden on desktop) ────────────────────────── */
    .scroll-hint-bar { display: none; }

    /* ── Mobile responsive ───────────────────────────────────────────── */
    @media (max-width: 768px) {
      /* WHY overflow-x: hidden? The holdings table has min-width: 580px which causes
         the page to scroll horizontally, pushing the pie chart off-screen.
         Clamping overflow here keeps the chart fully visible. */
      .portfolio-page { padding: 14px; overflow-x: hidden; }
      .main-grid { width: 100%; max-width: 100%; }

      /* Header: sort chips wrap below the title */
      .page-header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .header-right { width: 100%; justify-content: space-between; }
      .sort-chips { flex-wrap: wrap; gap: 6px; }

      /* Summary: 2-column grid so cards pair up instead of stacking 1-by-1 */
      .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .sc-value { font-size: 15px; }

      /* Chart card: tighter padding, explicit centering */
      .chart-card { padding: 14px; }
      .donut-svg { max-width: 200px; margin: 0 auto 8px; }

      /* Holdings: drop horizontal scroll, show as 2-row card layout instead.
         Row 1: [color] [symbol + name]      [LTP + day%]
         Row 2: [color] [curr val + inv val] [P&L amt + %]        */
      .holdings-card { padding: 14px 10px; }
      .holdings-scroll-outer { overflow: visible; }
      .holdings-scroll-outer::after { display: none; }
      .holdings-scroll-inner { overflow-x: visible; }
      .holdings-scroll-inner .holdings-list { min-width: unset; }
      .scroll-hint-bar { display: none !important; }

      .holding-row {
        grid-template-columns: 4px 1fr auto;
        grid-template-rows: auto auto;
        gap: 2px 10px;
        padding: 10px 6px;
      }
      /* Color bar spans both rows */
      .h-color-bar { grid-row: 1 / 3; height: auto; align-self: stretch; }
      /* Row 1 */
      .h-identity  { grid-column: 2; grid-row: 1; }
      .h-price     { grid-column: 3; grid-row: 1; }
      /* Row 1 right column */
      .h-price    { justify-self: end; align-items: flex-end; }
      /* Row 2 */
      .h-value    { grid-column: 2; grid-row: 2; align-items: flex-start; }
      .h-pnl-wrap { grid-column: 3; grid-row: 2; justify-self: end; align-items: flex-end; min-width: 0; }
      /* Hide qty/avg and chevron — too cramped on mobile */
      .h-cost        { display: none; }
      .h-chevron     { display: none; }
      .h-pnl-bar-bg  { display: none; }
      .h-day         { display: none; }
      .h-pnl-text    { flex-direction: column; align-items: flex-end; gap: 1px; }
    }
  `]
})
export class PortfolioComponent implements OnInit {

  private readonly store = inject(Store);
  private readonly router = inject(Router);

  // WHY toSignal? Converts NgRx Observable to Angular Signal.
  // This lets computed() reactively derive the donut chart and sorted list
  // whenever the store emits new portfolio data (e.g. WebSocket price updates).
  readonly holdings = toSignal(this.store.select(selectAllHoldings), { initialValue: [] as Holding[] });
  readonly summary  = toSignal(this.store.select(selectPortfolioSummary), { initialValue: null });
  readonly loading  = toSignal(this.store.select(selectPortfolioLoading), { initialValue: false });

  readonly sortBy = signal<SortKey>('pnl');

  // WHY signal? Tracks the currently hovered/tapped donut segment.
  // Drives the dynamic center label inside the SVG without any DOM manipulation.
  readonly hoveredSeg = signal<DonutSegment | null>(null);

  readonly sortOptions = [
    { key: 'pnl'   as SortKey, label: 'P&L' },
    { key: 'value' as SortKey, label: 'Value' },
    { key: 'name'  as SortKey, label: 'Name' },
  ];

  // Sorted holdings for the table
  readonly sortedHoldings = computed(() => {
    const list = [...this.holdings()];
    switch (this.sortBy()) {
      case 'pnl':   return list.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
      case 'value': return list.sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity));
      case 'name':  return list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
  });

  // Donut segments sorted by value (biggest slice first)
  readonly donutSegments = computed((): DonutSegment[] => {
    const holdings = this.holdings();
    if (!holdings.length) return [];
    const total = holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0);
    if (!total) return [];

    const R = 70;
    const C = 2 * Math.PI * R;
    let cumulative = 0;

    // Sort by value so biggest allocation gets the first (most prominent) colour
    return [...holdings]
      .sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))
      .map((h, i) => {
        const value = h.currentPrice * h.quantity;
        const pct = value / total;
        const len = pct * C;
        const seg: DonutSegment = {
          symbol: h.symbol,
          name:   h.name,
          color:  PALETTE[i % PALETTE.length],
          pct,
          value,
          dashArray:  `${len} ${C - len}`,
          dashOffset: -cumulative,
        };
        cumulative += len;
        return seg;
      });
  });

  // Total current market value of all holdings
  readonly totalValue = computed(() =>
    this.holdings().reduce((s, h) => s + h.currentPrice * h.quantity, 0));

  // Max absolute P&L across holdings — used to scale the P&L bars
  private readonly maxAbsPnl = computed(() =>
    Math.max(...this.holdings().map(h => Math.abs(h.pnl)), 1));

  // Map symbol → colour for the colour bar beside each holdings row
  private readonly colorMap = computed(() => {
    const map = new Map<string, string>();
    this.donutSegments().forEach(s => map.set(s.symbol, s.color));
    return map;
  });

  ngOnInit(): void {
    this.store.dispatch(PortfolioActions.loadPortfolio());
  }

  refresh(): void {
    this.store.dispatch(PortfolioActions.loadPortfolio());
  }

  goToDetail(symbol: string): void {
    this.router.navigate(['/stock-detail', symbol]);
  }

  getPnlBarWidth(pnl: number): number {
    return Math.min(100, (Math.abs(pnl) / this.maxAbsPnl()) * 100);
  }

  getColor(symbol: string): string {
    return this.colorMap().get(symbol) ?? PALETTE[0];
  }
}
