// WHY StockDetailComponent?
// The full stock analysis page — the "deep dive" view for a single stock.
// Accessible by clicking any stock row in Markets, Screener, or Portfolio.
//
// Sections:
// 1. Header: symbol, name, live price, change, sector badge, watchlist/B/S buttons
// 2. Price Chart: interactive candlestick/area chart with period selector + measure tool
// 3. Key Stats: 52W range, PE, PB, ROE, dividend yield at a glance
// 4. Fundamentals: detailed financial metrics in organized grid
// 5. Company Info: description, ISIN, exchange, face value
// 6. Corporate Actions: history of dividends, splits, bonus issues
// 7. Upcoming Events: earnings, AGM, ex-dividend dates
// 8. Order Book Depth: live bid/ask levels

import {
  Component, inject, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule, DecimalPipe, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

import { MatIconModule }    from '@angular/material/icon';
import { MatButtonModule }  from '@angular/material/button';
import { MatChipsModule }   from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

type DetailTab = 'overview' | 'fundamentals' | 'corporate' | 'orderbook';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';

import { MarketService } from '../../core/services/market.service';
import { NotificationService } from '../../core/services/notification.service';
import { AlertService } from '../../core/services/alert.service';
import { PriceChartComponent, ChartPeriod } from '../../shared/components/price-chart/price-chart.component';
import { OrderFormComponent } from '../orders/order-form/order-form.component';
import {
  StockDetail, CorporateAction, CandleBar, OrderBook
} from '../../core/models/market.models';
import { MarketActions } from '../markets/state/market.actions';
import { selectWatchlistQuotes } from '../markets/state/market.selectors';
import { TransactionType } from '../../core/models/order.models';

@Component({
  selector: 'app-stock-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, DecimalPipe, ReactiveFormsModule,
    MatIconModule, MatButtonModule,
    MatChipsModule, MatProgressBarModule, MatTooltipModule,
    MatInputModule, MatFormFieldModule, MatSnackBarModule,
    PriceChartComponent, OrderFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stock-detail-page">

      <!-- Loading bar -->
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" class="top-progress"></mat-progress-bar>
      }

      @if (detail()) {
        <!-- ── Header ─────────────────────────────────────────────────────── -->
        <div class="stock-header">
          <div class="breadcrumb">
            <button mat-icon-button (click)="goBack()" class="back-btn">
              <mat-icon>arrow_back</mat-icon>
            </button>
            <span class="sector-badge">{{ detail()!.sector }}</span>
            <span class="sep">›</span>
            <span class="industry-badge">{{ detail()!.industry }}</span>
          </div>

          <div class="header-main">
            <!-- header-top: identity (left) + actions (right) on mobile, display:contents on desktop -->
            <div class="header-top">
              <div class="stock-identity">
                <div class="symbol-block">
                  <h1 class="symbol">{{ detail()!.symbol }}</h1>
                  <span class="exchange-tag">{{ detail()!.exchange }}</span>
                </div>
                <p class="stock-name">{{ detail()!.name }}</p>
                <p class="isin text-muted">ISIN: {{ detail()!.isin }} · Face Value ₹{{ detail()!.faceValue }}</p>
              </div>

              <div class="header-actions">
                <button mat-icon-button (click)="toggleWatchlist()"
                        [matTooltip]="inWatchlist() ? 'Remove from Watchlist' : 'Add to Watchlist'">
                  <mat-icon [class.text-cyan]="inWatchlist()">
                    {{ inWatchlist() ? 'bookmark' : 'bookmark_border' }}
                  </mat-icon>
                </button>
                <button mat-icon-button (click)="toggleAlertForm()"
                        [matTooltip]="showAlertForm() ? 'Cancel alert' : 'Set price alert'"
                        [class.alert-btn-active]="showAlertForm()">
                  <mat-icon>notifications_active</mat-icon>
                </button>
                @if (showTrade()) {
                  <button mat-flat-button class="buy-btn" (click)="openOrder('BUY')">BUY</button>
                  <button mat-flat-button class="sell-btn" (click)="openOrder('SELL')">SELL</button>
                }
              </div>
            </div>

            <div class="price-block">
              <div class="current-price">₹{{ detail()!.price | number:'1.2-2' }}</div>
              <div class="price-change" [class.text-green]="detail()!.change >= 0" [class.text-red]="detail()!.change < 0">
                <mat-icon>{{ detail()!.change >= 0 ? 'arrow_drop_up' : 'arrow_drop_down' }}</mat-icon>
                {{ detail()!.change >= 0 ? '+' : '' }}{{ detail()!.change | number:'1.2-2' }}
                <span class="change-pct">({{ detail()!.changePercent >= 0 ? '+' : '' }}{{ detail()!.changePercent | number:'1.2-2' }}%)</span>
              </div>
              <div class="market-cap-pill">MCap {{ detail()!.marketCap }}</div>
            </div>
          </div>
        </div>

        <!-- ── Trade Mode Selection Panel ───────────────────────────────────── -->
        @if (tradePanel() && !tradeMode()) {
          <div class="trade-options-panel">
            <div class="to-header">
              <span class="to-title">
                <mat-icon [class.text-green]="tradePanel() === 'BUY'" [class.text-red]="tradePanel() === 'SELL'">
                  {{ tradePanel() === 'BUY' ? 'add_shopping_cart' : 'remove_shopping_cart' }}
                </mat-icon>
                {{ tradePanel() === 'BUY' ? 'Buy' : 'Sell' }} {{ detail()!.symbol }} — Choose Investment Type
              </span>
              <button mat-icon-button (click)="closeTrade()" class="close-trade-btn">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="to-chips">
              <button class="to-chip" (click)="selectTradeMode('onetime')">
                <mat-icon>shopping_cart</mat-icon>
                <span class="to-chip-label">One-time</span>
                <p class="to-chip-desc">Single buy/sell order at market or limit price</p>
              </button>
              <button class="to-chip" (click)="selectTradeMode('sip')">
                <mat-icon>autorenew</mat-icon>
                <span class="to-chip-label">SIP</span>
                <p class="to-chip-desc">Systematic investment — recurring fixed amount</p>
              </button>
            </div>
          </div>
        }

        <!-- ── SIP Setup Panel ────────────────────────────────────────────── -->
        @if (tradePanel() && tradeMode() === 'sip') {
          <div class="sip-panel">
            <div class="to-header">
              <span class="to-title">
                <mat-icon class="text-cyan">autorenew</mat-icon>
                SIP — {{ detail()!.symbol }}
              </span>
              <button mat-icon-button (click)="closeTrade()" class="close-trade-btn">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="sip-form">
              <div class="sip-field">
                <label class="sip-label">Investment Amount (₹)</label>
                <input class="sip-input text-mono" type="number" min="100" step="100"
                       [formControl]="sipAmt" placeholder="e.g. 5000">
                @if (sipAmt.invalid && sipAmt.touched) {
                  <span class="sip-error">Min ₹100 required</span>
                }
              </div>
              <div class="sip-field">
                <label class="sip-label">Frequency</label>
                <div class="sip-freq-btns">
                  <button class="freq-btn" [class.freq-active]="sipFreq() === 'MONTHLY'"
                          (click)="sipFreq.set('MONTHLY')">Monthly</button>
                  <button class="freq-btn" [class.freq-active]="sipFreq() === 'WEEKLY'"
                          (click)="sipFreq.set('WEEKLY')">Weekly</button>
                </div>
              </div>
              @if (sipFreq() === 'MONTHLY') {
                <div class="sip-field">
                  <label class="sip-label">Day of Month</label>
                  <div class="sip-day-chips">
                    @for (d of [1,5,10,15,20,25]; track d) {
                      <button class="day-chip" [class.day-active]="sipDay() === d"
                              (click)="sipDay.set(d)">{{ d }}</button>
                    }
                  </div>
                </div>
              }
              <div class="sip-summary">
                You invest <strong class="text-mono text-cyan">₹{{ (sipAmt.value ?? 0) | number }}</strong>
                {{ sipFreq() === 'MONTHLY' ? 'every month on day ' + sipDay() : 'every week' }}
                into <strong>{{ detail()!.symbol }}</strong>.
              </div>
              <div class="sip-footer">
                <button mat-stroked-button (click)="tradeMode.set(null)">Back</button>
                <button mat-flat-button class="sip-confirm-btn"
                        [disabled]="sipAmt.invalid"
                        (click)="closeTrade()">
                  Confirm SIP
                </button>
              </div>
            </div>
          </div>
        }

        <!-- ── One-time Order Form (slide-in) ────────────────────────────── -->
        @if (orderType()) {
          <div class="order-panel-wrap">
            <app-order-form
              [symbol]="detail()!.symbol"
              [currentPrice]="detail()!.price"
              [defaultType]="orderType()!"
              (onClose)="closeTrade()"
              (onOrderPlaced)="closeTrade()">
            </app-order-form>
          </div>
        }

        <!-- ── Set Alert Form ─────────────────────────────────────────────── -->
        @if (showAlertForm()) {
          <div class="alert-form-card">
            <div class="alert-form-header">
              <mat-icon class="alert-form-icon">notifications_active</mat-icon>
              <span>Set Price Alert — {{ detail()!.symbol }}</span>
              <button mat-icon-button (click)="showAlertForm.set(false)" class="close-alert-btn">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="alert-form-body">
              <div class="alert-condition-toggle">
                <button class="cond-btn"
                  [class.cond-above]="alertCondition() === 'ABOVE'"
                  (click)="setCondition('ABOVE')">
                  <mat-icon>arrow_upward</mat-icon> ABOVE
                </button>
                <button class="cond-btn"
                  [class.cond-below]="alertCondition() === 'BELOW'"
                  (click)="setCondition('BELOW')">
                  <mat-icon>arrow_downward</mat-icon> BELOW
                </button>
              </div>
              <div class="alert-price-row">
                <span class="alert-price-label">
                  Target Price (₹)
                  <span class="alert-hint">
                    — must be {{ alertCondition() === 'ABOVE' ? 'above' : 'below' }}
                    ₹{{ detail()!.price | number:'1.2-2' }}
                  </span>
                </span>
                <input class="alert-price-input text-mono"
                  type="number" step="0.5" min="0.01"
                  [formControl]="alertPriceCtrl"
                  placeholder="{{ detail()!.price | number:'1.2-2' }}">
              </div>
              <div class="alert-current">
                Current: ₹{{ detail()!.price | number:'1.2-2' }}
              </div>
            </div>
            <div class="alert-form-footer">
              <button mat-stroked-button (click)="showAlertForm.set(false)">Cancel</button>
              <button mat-flat-button class="set-alert-btn"
                [disabled]="alertPriceCtrl.invalid || settingAlert()"
                (click)="setAlert()">
                @if (settingAlert()) { Setting… } @else { Set Alert }
              </button>
            </div>
          </div>
        }

        <!-- ── Custom Tab Bar ────────────────────────────────────────────── -->
        <div class="detail-tab-bar" [class.tabs-3]="!showTrade()">
          <button class="dtab" [class.dtab-active]="activeDetailTab() === 'overview'"
                  (click)="activeDetailTab.set('overview')">
            <mat-icon>show_chart</mat-icon> Overview
          </button>
          <button class="dtab" [class.dtab-active]="activeDetailTab() === 'fundamentals'"
                  (click)="activeDetailTab.set('fundamentals')">
            <mat-icon>analytics</mat-icon> Fundamentals
          </button>
          <button class="dtab" [class.dtab-active]="activeDetailTab() === 'corporate'"
                  (click)="activeDetailTab.set('corporate')">
            <mat-icon>event_note</mat-icon> Corp. Actions
          </button>
          @if (showTrade()) {
            <button class="dtab" [class.dtab-active]="activeDetailTab() === 'orderbook'"
                    (click)="activeDetailTab.set('orderbook')">
              <mat-icon>receipt_long</mat-icon> Order Book
            </button>
          }
          <div class="dtab-ink"
               [class.pos-0]="activeDetailTab() === 'overview'"
               [class.pos-1]="activeDetailTab() === 'fundamentals'"
               [class.pos-2]="activeDetailTab() === 'corporate'"
               [class.pos-3]="activeDetailTab() === 'orderbook'">
          </div>
        </div>

        <!-- Tab 1: Chart + Overview — @if destroys/recreates DOM so animation retriggers -->
        @if (activeDetailTab() === 'overview') {
            <div class="tab-content">

              <!-- Price Chart -->
              <app-price-chart
                [candles]="candles()"
                [chartType]="'candlestick'"
                [currentPeriod]="activePeriod()"
                (periodChange)="loadHistory($event)">
              </app-price-chart>

              <!-- Key Stats row -->
              <div class="key-stats-grid">
                <div class="kstat">
                  <span class="kstat-label">52W High</span>
                  <span class="kstat-value text-green">₹{{ detail()!.fiftyTwoWeekHigh | number:'1.2-2' }}</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">52W Low</span>
                  <span class="kstat-value text-red">₹{{ detail()!.fiftyTwoWeekLow | number:'1.2-2' }}</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">P/E Ratio</span>
                  <span class="kstat-value">{{ detail()!.peRatio | number:'1.1-1' }}</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">P/B Ratio</span>
                  <span class="kstat-value">{{ detail()!.pbRatio | number:'1.2-2' }}</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">ROE</span>
                  <span class="kstat-value">{{ detail()!.roe | number:'1.1-1' }}%</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">Div. Yield</span>
                  <span class="kstat-value">{{ detail()!.dividendYield | number:'1.2-2' }}%</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">EPS (TTM)</span>
                  <span class="kstat-value">₹{{ detail()!.eps | number:'1.2-2' }}</span>
                </div>
                <div class="kstat">
                  <span class="kstat-label">Avg Vol (20D)</span>
                  <span class="kstat-value">{{ detail()!.avgVolume20D | number }}</span>
                </div>
              </div>

              <!-- 52W range bar -->
              <div class="range-bar-wrap">
                <span class="range-label">52W Low ₹{{ detail()!.fiftyTwoWeekLow | number:'1.0-0' }}</span>
                <div class="range-bar">
                  <div class="range-fill" [style.width.%]="rangePercent()"></div>
                  <div class="range-thumb" [style.left.%]="rangePercent()"></div>
                </div>
                <span class="range-label">₹{{ detail()!.fiftyTwoWeekHigh | number:'1.0-0' }} High</span>
              </div>

            </div>
        }

        <!-- Tab 2: Fundamentals -->
        @if (activeDetailTab() === 'fundamentals') {
            <div class="tab-content fundamentals-grid">
              <div class="fund-section">
                <h4 class="fund-section-title">Valuation</h4>
                <div class="fund-rows">
                  <div class="fund-row"><span>P/E Ratio (TTM)</span><span>{{ detail()!.peRatio | number:'1.2-2' }}</span></div>
                  <div class="fund-row"><span>P/B Ratio</span><span>{{ detail()!.pbRatio | number:'1.2-2' }}</span></div>
                  <div class="fund-row"><span>EPS (TTM)</span><span>₹{{ detail()!.eps | number:'1.2-2' }}</span></div>
                  <div class="fund-row"><span>Market Cap</span><span>{{ detail()!.marketCap }}</span></div>
                  <div class="fund-row"><span>Face Value</span><span>₹{{ detail()!.faceValue }}</span></div>
                </div>
              </div>
              <div class="fund-section">
                <h4 class="fund-section-title">Profitability</h4>
                <div class="fund-rows">
                  <div class="fund-row"><span>ROE (%)</span><span>{{ detail()!.roe | number:'1.2-2' }}%</span></div>
                  <div class="fund-row"><span>ROCE (%)</span><span>{{ detail()!.roce | number:'1.2-2' }}%</span></div>
                  <div class="fund-row"><span>Debt / Equity</span><span>{{ detail()!.debtToEquity | number:'1.2-2' }}</span></div>
                </div>
              </div>
              <div class="fund-section">
                <h4 class="fund-section-title">Dividends</h4>
                <div class="fund-rows">
                  <div class="fund-row"><span>Dividend Yield</span><span class="text-green">{{ detail()!.dividendYield | number:'1.2-2' }}%</span></div>
                  <div class="fund-row"><span>Div/Share (Last)</span><span>₹{{ detail()!.dividendPerShare | number:'1.2-2' }}</span></div>
                </div>
              </div>
              <div class="fund-section full-width">
                <h4 class="fund-section-title">About the Company</h4>
                <p class="description-text">{{ detail()!.description }}</p>
              </div>
            </div>
        }

        <!-- Tab 3: Corporate Actions -->
        @if (activeDetailTab() === 'corporate') {
            <div class="tab-content">

              <!-- Upcoming Events -->
              @if (upcomingActions().length) {
                <div class="ca-section">
                  <h4 class="ca-section-title">
                    <mat-icon class="ca-icon upcoming">event</mat-icon>
                    Upcoming Events
                  </h4>
                  <div class="ca-list">
                    @for (action of upcomingActions(); track action.exDate) {
                      <div class="ca-card upcoming">
                        <div class="ca-type-badge" [class]="'ca-' + action.type.toLowerCase()">
                          {{ action.type }}
                        </div>
                        <div class="ca-info">
                          <span class="ca-desc">{{ action.description }}</span>
                          <span class="ca-dates text-muted">Ex-Date: {{ action.exDate }} · Record: {{ action.recordDate }}</span>
                        </div>
                        <div class="ca-value">
                          @if (action.type === 'DIVIDEND') {
                            <span class="text-green">₹{{ action.value | number:'1.2-2' }}/share</span>
                          } @else {
                            <span>{{ action.value }}x</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- History -->
              <div class="ca-section">
                <h4 class="ca-section-title">
                  <mat-icon class="ca-icon">history</mat-icon>
                  History
                </h4>
                <div class="ca-list">
                  @for (action of pastActions(); track action.exDate) {
                    <div class="ca-card">
                      <div class="ca-type-badge" [class]="'ca-' + action.type.toLowerCase()">
                        {{ action.type }}
                      </div>
                      <div class="ca-info">
                        <span class="ca-desc">{{ action.description }}</span>
                        <span class="ca-dates text-muted">Ex-Date: {{ action.exDate }}</span>
                      </div>
                      <div class="ca-value">
                        @if (action.type === 'DIVIDEND') {
                          <span>₹{{ action.value | number:'1.2-2' }}/share</span>
                        } @else {
                          <span>{{ action.value }}x</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
        }

        <!-- Tab 4: Order Book -->
        @if (activeDetailTab() === 'orderbook') {
            <div class="tab-content">
              @if (orderBook()) {
                <div class="ob-container">
                  <!-- Bid/Ask header -->
                  <div class="ob-stats-row">
                    <div class="ob-stat">
                      <span class="ob-label">Total Bid Qty</span>
                      <span class="ob-value text-green">{{ orderBook()!.totalBidQty | number }}</span>
                    </div>
                    <div class="ob-last-price">
                      ₹{{ orderBook()!.lastPrice | number:'1.2-2' }}
                      <span class="ob-spread text-muted">LTP</span>
                    </div>
                    <div class="ob-stat">
                      <span class="ob-label">Total Ask Qty</span>
                      <span class="ob-value text-red">{{ orderBook()!.totalAskQty | number }}</span>
                    </div>
                  </div>

                  <!-- Sentiment bar -->
                  <div class="sentiment-bar">
                    <div class="sent-bid" [style.width.%]="bidRatio()"></div>
                    <div class="sent-ask" [style.width.%]="100 - bidRatio()"></div>
                  </div>
                  <div class="sentiment-labels">
                    <span class="text-green">{{ bidRatio() | number:'1.0-0' }}% Buy</span>
                    <span class="text-red">{{ (100 - bidRatio()) | number:'1.0-0' }}% Sell</span>
                  </div>

                  <!-- Scroll hint: shown above table on mobile -->
                  <div class="scroll-hint-bar">
                    <mat-icon class="scroll-hint-icon">swipe</mat-icon>
                    <span>Swipe left to see all columns</span>
                  </div>

                  <!-- Order book table -->
                  <div class="ob-table-wrap">
                    <table class="ob-table">
                      <thead>
                        <tr>
                          <th class="text-green">Qty</th>
                          <th class="text-green">Orders</th>
                          <th class="text-green">Bid Price</th>
                          <th class="text-red">Ask Price</th>
                          <th class="text-red">Orders</th>
                          <th class="text-red">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (i of [0,1,2,3,4,5,6,7,8,9]; track i) {
                          <tr class="ob-row">
                            <td class="text-green qty-cell">
                              @if (orderBook()!.bids[i]) { {{ orderBook()!.bids[i].quantity | number }} }
                            </td>
                            <td class="text-green text-muted">
                              @if (orderBook()!.bids[i]) { {{ orderBook()!.bids[i].orders }} }
                            </td>
                            <td class="bid-price">
                              @if (orderBook()!.bids[i]) {
                                <div class="price-bar-cell">
                                  <div class="bid-bar" [style.width.%]="getBidBarWidth(i)"></div>
                                  <span>₹{{ orderBook()!.bids[i].price | number:'1.2-2' }}</span>
                                </div>
                              }
                            </td>
                            <td class="ask-price">
                              @if (orderBook()!.asks[i]) {
                                <div class="price-bar-cell">
                                  <div class="ask-bar" [style.width.%]="getAskBarWidth(i)"></div>
                                  <span>₹{{ orderBook()!.asks[i].price | number:'1.2-2' }}</span>
                                </div>
                              }
                            </td>
                            <td class="text-red text-muted">
                              @if (orderBook()!.asks[i]) { {{ orderBook()!.asks[i].orders }} }
                            </td>
                            <td class="text-red qty-cell">
                              @if (orderBook()!.asks[i]) { {{ orderBook()!.asks[i].quantity | number }} }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              } @else {
                <div class="ob-loading">Loading order book...</div>
              }
            </div>
        }
      }

      @if (!loading() && !detail()) {
        <div class="not-found">
          <mat-icon>search_off</mat-icon>
          <p>Stock not found. <a routerLink="/markets">Back to Markets</a></p>
        </div>
      }
    </div>
  `,
  styles: [`
    .stock-detail-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .top-progress { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; }

    /* ── Header ─────────────────────────────────────────────────────────────── */
    .breadcrumb {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px; font-size: 13px; color: var(--tf-text-secondary);
    }
    .back-btn { margin-right: 4px; }
    .sector-badge, .industry-badge {
      padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;
      background: var(--tf-bg-elevated); color: var(--tf-text-secondary);
    }
    .sep { color: var(--tf-border-muted); }
    .stock-header {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-lg); padding: 20px; margin-bottom: 16px;
    }
    .header-main { display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
    /* On desktop header-top is transparent — children participate in parent flex as if wrapper doesn't exist */
    .header-top { display: contents; }
    .stock-identity { flex: 1; min-width: 200px; }
    .symbol-block { display: flex; align-items: center; gap: 8px; }
    .symbol { font-size: 28px; font-weight: 700; color: var(--tf-text-primary); margin: 0; }
    .exchange-tag {
      font-size: 11px; font-weight: 700; background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); border-radius: 4px; padding: 2px 6px;
    }
    .stock-name { color: var(--tf-text-secondary); margin: 4px 0; font-size: 14px; }
    .isin { font-size: 11px; margin: 2px 0; }
    .price-block { text-align: center; }
    .current-price {
      font-size: 32px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
      color: var(--tf-text-primary);
    }
    .price-change {
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 600; font-family: 'JetBrains Mono', monospace;
    }
    .change-pct { font-size: 13px; opacity: 0.9; }
    .market-cap-pill {
      margin-top: 8px; font-size: 12px; color: var(--tf-text-secondary);
      background: var(--tf-bg-elevated); border-radius: 12px; padding: 2px 10px; display: inline-block;
    }
    .header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .buy-btn {
      background: rgba(63,185,80,0.15) !important; color: var(--tf-green) !important;
      border: 1px solid var(--tf-green) !important; font-weight: 700 !important; min-width: 80px !important;
    }
    .sell-btn {
      background: rgba(248,81,73,0.15) !important; color: var(--tf-red) !important;
      border: 1px solid var(--tf-red) !important; font-weight: 700 !important; min-width: 80px !important;
    }
    .text-cyan { color: var(--tf-cyan) !important; }
    .order-panel-wrap { max-width: 400px; margin-bottom: 16px; }

    /* ── Trade Options Panel ─────────────────────────────────────────────────── */
    .trade-options-panel, .sip-panel {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); margin-bottom: 16px; overflow: hidden;
      animation: fadeSlideUp 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    .to-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--tf-border);
    }
    .to-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 600; color: var(--tf-text-primary);
    }
    .to-title mat-icon { font-size: 18px; }
    .close-trade-btn { color: var(--tf-text-muted) !important; width: 28px !important; height: 28px !important; }
    .to-chips {
      display: flex; gap: 12px; padding: 16px; flex-wrap: wrap;
    }
    .to-chip {
      flex: 1; min-width: 140px; display: flex; flex-direction: column; align-items: flex-start;
      gap: 4px; padding: 14px 16px; border-radius: var(--tf-radius-md);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      cursor: pointer; text-align: left; transition: border-color 0.18s, background 0.18s, transform 0.18s;
    }
    .to-chip:hover { border-color: var(--tf-cyan); background: rgba(79,172,254,0.06); transform: translateY(-2px); }
    .to-chip mat-icon { font-size: 22px; color: var(--tf-cyan); }
    .to-chip-label { font-size: 14px; font-weight: 700; color: var(--tf-text-primary); }
    .to-chip-desc { font-size: 11px; color: var(--tf-text-muted); margin: 0; line-height: 1.4; }

    /* ── SIP Panel ───────────────────────────────────────────────────────────── */
    .sip-form { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .sip-field { display: flex; flex-direction: column; gap: 6px; }
    .sip-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sip-input {
      padding: 8px 12px; border-radius: var(--tf-radius-sm);
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); font-size: 15px; font-weight: 600; width: 200px;
    }
    .sip-input:focus { outline: none; border-color: var(--tf-cyan); }
    .sip-error { font-size: 11px; color: var(--tf-red); }
    .sip-freq-btns { display: flex; gap: 8px; }
    .freq-btn {
      padding: 6px 16px; border-radius: var(--tf-radius-sm); font-size: 13px; font-weight: 600;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .freq-active {
      background: rgba(79,172,254,0.12) !important; color: var(--tf-cyan) !important;
      border-color: var(--tf-cyan) !important;
    }
    .sip-day-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .day-chip {
      width: 36px; height: 36px; border-radius: 50%; font-size: 12px; font-weight: 700;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .day-active {
      background: rgba(79,172,254,0.15) !important; color: var(--tf-cyan) !important;
      border-color: var(--tf-cyan) !important;
    }
    .sip-summary {
      font-size: 12px; color: var(--tf-text-secondary); line-height: 1.6;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 10px 12px;
    }
    .sip-footer { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }
    .sip-confirm-btn { background: var(--tf-cyan) !important; color: #000 !important; font-weight: 700 !important; }

    /* ── Custom Tab Bar ──────────────────────────────────────────────────────── */
    .detail-tab-bar {
      position: relative; display: flex;
      border-bottom: 1px solid var(--tf-border); margin-bottom: 4px;
    }
    .dtab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 12px 8px; border: none; background: transparent;
      color: var(--tf-text-secondary); font-size: 13px; font-weight: 500;
      cursor: pointer; transition: color 0.2s ease-out, background 0.15s;
    }
    .dtab mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .dtab:hover { color: var(--tf-text-primary); background: rgba(255,255,255,0.03); }
    .dtab-active { color: var(--tf-cyan) !important; font-weight: 700; }
    /* Animated ink bar — slides left-right behind active tab */
    .dtab-ink {
      position: absolute; bottom: 0; left: 0;
      width: 25%; height: 2px;
      background: linear-gradient(90deg, var(--tf-cyan), rgba(79,172,254,0.5));
      border-radius: 2px 2px 0 0;
      transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dtab-ink.pos-0 { transform: translateX(0%); }
    .dtab-ink.pos-1 { transform: translateX(100%); }
    .dtab-ink.pos-2 { transform: translateX(200%); }
    .dtab-ink.pos-3 { transform: translateX(300%); }
    /* 3-tab mode (screener source — Order Book hidden) */
    .detail-tab-bar.tabs-3 .dtab-ink { width: 33.333%; }
    .detail-tab-bar.tabs-3 .dtab-ink.pos-0 { transform: translateX(0%); }
    .detail-tab-bar.tabs-3 .dtab-ink.pos-1 { transform: translateX(100%); }
    .detail-tab-bar.tabs-3 .dtab-ink.pos-2 { transform: translateX(200%); }

    .tab-content {
      padding: 20px 0; display: flex; flex-direction: column; gap: 20px;
      animation: fadeSlideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Key Stats ───────────────────────────────────────────────────────────── */
    .key-stats-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
    }
    .kstat {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 12px; text-align: center;
    }
    .kstat-label { display: block; font-size: 11px; color: var(--tf-text-secondary); margin-bottom: 4px; }
    .kstat-value { display: block; font-size: 15px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    /* ── 52W Range Bar ───────────────────────────────────────────────────────── */
    .range-bar-wrap {
      display: flex; align-items: center; gap: 12px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px;
    }
    .range-label { font-size: 12px; color: var(--tf-text-secondary); white-space: nowrap; }
    .range-bar {
      flex: 1; height: 6px; background: var(--tf-bg-elevated); border-radius: 3px; position: relative;
    }
    .range-fill { height: 100%; background: linear-gradient(90deg, var(--tf-red), var(--tf-green)); border-radius: 3px; }
    .range-thumb {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 12px; height: 12px; border-radius: 50%;
      background: var(--tf-cyan); border: 2px solid var(--tf-bg-surface);
    }

    /* ── Fundamentals ────────────────────────────────────────────────────────── */
    .fundamentals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .fund-section {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px;
    }
    .fund-section.full-width { grid-column: 1 / -1; }
    .fund-section-title { color: var(--tf-text-secondary); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 12px; }
    .fund-rows { display: flex; flex-direction: column; gap: 8px; }
    .fund-row {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px; padding-bottom: 8px; border-bottom: 1px solid var(--tf-border-subtle);
    }
    .fund-row:last-child { border-bottom: none; padding-bottom: 0; }
    .fund-row span:first-child { color: var(--tf-text-secondary); }
    .fund-row span:last-child { font-weight: 600; font-family: 'JetBrains Mono', monospace; }
    .description-text { font-size: 13px; color: var(--tf-text-secondary); line-height: 1.7; margin: 0; }

    /* ── Corporate Actions ───────────────────────────────────────────────────── */
    .ca-section { margin-bottom: 24px; }
    .ca-section-title {
      display: flex; align-items: center; gap: 8px;
      color: var(--tf-text-primary); font-size: 14px; font-weight: 600; margin-bottom: 12px;
    }
    .ca-icon { font-size: 18px !important; color: var(--tf-text-secondary); }
    .ca-icon.upcoming { color: var(--tf-yellow); }
    .ca-list { display: flex; flex-direction: column; gap: 8px; }
    .ca-card {
      display: flex; align-items: center; gap: 12px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 12px 16px;
    }
    .ca-card.upcoming { border-color: var(--tf-yellow); background: rgba(210, 153, 34, 0.05); }
    .ca-type-badge {
      padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
      white-space: nowrap; text-transform: uppercase;
    }
    .ca-dividend { background: rgba(63,185,80,0.15); color: var(--tf-green); }
    .ca-split    { background: rgba(88,166,255,0.15); color: var(--tf-blue); }
    .ca-bonus    { background: rgba(57,208,216,0.15); color: var(--tf-cyan); }
    .ca-buyback  { background: rgba(210,153,34,0.15); color: var(--tf-yellow); }
    .ca-rights   { background: rgba(248,81,73,0.15); color: var(--tf-red); }
    .ca-info { flex: 1; }
    .ca-desc { display: block; font-size: 13px; color: var(--tf-text-primary); }
    .ca-dates { display: block; font-size: 11px; margin-top: 2px; }
    .ca-value { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; }

    /* ── Order Book ──────────────────────────────────────────────────────────── */
    .ob-container { display: flex; flex-direction: column; gap: 12px; }
    .ob-stats-row {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 12px 20px;
    }
    .ob-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .ob-label { font-size: 11px; color: var(--tf-text-secondary); }
    .ob-value { font-size: 16px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .ob-last-price { font-size: 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace; text-align: center; }
    .ob-spread { font-size: 11px; display: block; }
    .sentiment-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; }
    .sent-bid { background: var(--tf-green); transition: width 0.5s; }
    .sent-ask { background: var(--tf-red); transition: width 0.5s; }
    .sentiment-labels { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; }
    .ob-table-wrap {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); overflow: hidden;
    }
    .ob-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ob-table th {
      padding: 8px 12px; font-weight: 700; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.5px; background: var(--tf-bg-elevated); border-bottom: 1px solid var(--tf-border);
    }
    .ob-row td { padding: 6px 12px; border-bottom: 1px solid var(--tf-border-subtle); }
    .ob-row:last-child td { border-bottom: none; }
    .qty-cell { font-family: 'JetBrains Mono', monospace; text-align: right; }
    .price-bar-cell { position: relative; display: flex; align-items: center; justify-content: flex-end; }
    .bid-bar {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: rgba(63,185,80,0.12); border-radius: 2px; pointer-events: none;
    }
    .ask-bar {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: rgba(248,81,73,0.12); border-radius: 2px; pointer-events: none;
    }
    .bid-price, .ask-price { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
    .bid-price { color: var(--tf-green); }
    .ask-price { color: var(--tf-red); }
    .ob-loading { padding: 40px; text-align: center; color: var(--tf-text-secondary); }

    /* Scroll hint bar: hidden on desktop, shown on mobile via media query */
    .scroll-hint-bar { display: none; }

    /* ── Alert button active state ───────────────────────────────────────────── */
    .alert-btn-active { color: var(--tf-cyan) !important; }

    /* ── Alert Form ──────────────────────────────────────────────────────────── */
    .alert-form-card {
      max-width: 380px; margin-bottom: 16px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-cyan);
      border-radius: var(--tf-radius-md); overflow: hidden;
    }
    .alert-form-header {
      display: flex; align-items: center; gap: 8px;
      background: rgba(79,172,254,0.08); padding: 12px 16px;
      font-size: 14px; font-weight: 600; color: var(--tf-text-primary);
    }
    .alert-form-icon { color: var(--tf-cyan); font-size: 18px; }
    .close-alert-btn { margin-left: auto; color: var(--tf-text-muted) !important; width: 28px !important; height: 28px !important; }
    .alert-form-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .alert-condition-toggle { display: flex; gap: 8px; }
    .cond-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 8px; border-radius: var(--tf-radius-sm); font-size: 12px; font-weight: 700;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .cond-btn mat-icon { font-size: 16px; }
    .cond-above { background: rgba(63,185,80,0.15) !important; color: var(--tf-green) !important; border-color: var(--tf-green) !important; }
    .cond-below { background: rgba(248,81,73,0.15) !important; color: var(--tf-red) !important; border-color: var(--tf-red) !important; }
    .alert-price-row { display: flex; flex-direction: column; gap: 4px; }
    .alert-price-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .alert-hint { font-size: 10px; color: var(--tf-text-muted); text-transform: none; letter-spacing: 0; font-weight: 400; }
    .alert-price-input {
      padding: 8px 12px; border-radius: var(--tf-radius-sm);
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); font-size: 16px; font-weight: 600; width: 100%;
    }
    .alert-price-input:focus { outline: none; border-color: var(--tf-cyan); }
    .alert-current { font-size: 12px; color: var(--tf-text-muted); }
    .alert-form-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 12px 16px; border-top: 1px solid var(--tf-border);
    }
    .set-alert-btn { background: var(--tf-cyan) !important; color: #000 !important; font-weight: 600 !important; }

    /* ── Responsive ─────────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      /* Page — overflow-x hidden prevents any child from causing horizontal scroll */
      .stock-detail-page { padding: 12px; overflow-x: hidden; }

      /* ── Header mobile redesign ─────────────────────────────────────────── */
      .stock-header { padding: 14px; max-width: 100%; }

      /* header-main: stack header-top row + price-block row */
      .header-main { flex-direction: column; gap: 12px; }

      /* header-top: identity LEFT, actions RIGHT on same row */
      .header-top {
        display: flex; align-items: flex-start; gap: 8px; width: 100%;
      }
      .stock-identity { flex: 1; min-width: 0; }
      .symbol-block { flex-wrap: wrap; gap: 6px; }
      .symbol { font-size: 20px; }
      .stock-name { font-size: 13px; white-space: normal; word-break: break-word; margin: 3px 0; }
      .isin { font-size: 10px; word-break: break-all; }

      /* Actions: stacked in right column — icon buttons on row 1, BUY/SELL on row 2 */
      .header-actions {
        flex-direction: row; flex-wrap: wrap;
        justify-content: flex-end; align-items: center;
        gap: 2px; margin: 0; width: 92px; flex-shrink: 0;
      }
      .buy-btn, .sell-btn {
        flex: 1 1 40px !important; min-width: 40px !important;
        font-size: 11px !important; padding: 0 4px !important;
      }

      /* Price block: full width below header-top, left-aligned */
      .price-block { width: 100%; text-align: left; }
      .current-price { font-size: 26px; }
      .price-change { justify-content: flex-start; font-size: 13px; gap: 2px; }
      .price-change mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .market-cap-pill { margin-top: 6px; }

      /* Breadcrumb: wrap if sector/industry names are long */
      .breadcrumb { flex-wrap: wrap; gap: 6px 8px; }

      /* Trade / order panels: full width on mobile */
      .order-panel-wrap { max-width: 100%; }
      .trade-options-panel, .sip-panel { margin-bottom: 12px; }
      .to-chips { flex-direction: column; }
      .to-chip { flex-direction: row; text-align: left; gap: 12px; padding: 14px 16px; }
      .to-chip-desc { margin: 0; }

      /* Alert form: full width */
      .alert-form-card { max-width: 100%; }

      /* Tabs: icons hidden to save space, just show text */
      .detail-tab-bar { gap: 0; overflow-x: auto; }
      .dtab { font-size: 11px; padding: 10px 6px; flex-shrink: 0; min-width: 70px; }
      .dtab mat-icon { display: none; }

      /* Stats & fundamentals */
      .key-stats-grid { grid-template-columns: repeat(2, 1fr); }
      .fundamentals-grid { grid-template-columns: 1fr; }

      /* Order book table */
      .ob-table-wrap { overflow-x: auto; position: relative; }
      .ob-table { min-width: 420px; }
      .ob-stats-row { flex-wrap: wrap; gap: 10px; padding: 10px 14px; }

      /* Scroll hint bar — animated banner style (same as screener/orders) */
      .scroll-hint-bar {
        display: flex;
        align-items: center; gap: 8px; justify-content: center;
        padding: 8px 14px; margin-bottom: 4px;
        background: rgba(79,172,254,0.08);
        border: 1px solid rgba(79,172,254,0.2);
        border-radius: var(--tf-radius-sm);
        font-size: 12px; font-weight: 600; color: var(--tf-cyan);
      }
      .scroll-hint-bar .scroll-hint-icon {
        font-size: 18px; width: 18px; height: 18px;
        animation: swipeHint 1.6s ease-in-out infinite;
      }
      @keyframes swipeHint {
        0%, 100% { transform: translateX(0); }
        40%       { transform: translateX(-6px); }
        60%       { transform: translateX(4px); }
      }

      /* Range bar */
      .range-bar-wrap { flex-wrap: wrap; gap: 8px; }

      /* SIP form */
      .sip-form { padding: 14px; }
      .sip-freq-btns { flex-wrap: wrap; }
      .sip-input { width: 100%; }
    }

    @media (max-width: 480px) {
      .stock-detail-page { padding: 8px; }
      .stock-header { padding: 10px; }
      .symbol { font-size: 20px; }
      .current-price { font-size: 22px; }
      .key-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .dtab { font-size: 10px; padding: 8px 2px; min-width: 58px; }
      .breadcrumb .industry-badge { display: none; } /* save space on tiny screens */
    }

    /* ── Not found ───────────────────────────────────────────────────────────── */
    .not-found {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 80px; color: var(--tf-text-secondary);
    }
    .not-found mat-icon { font-size: 48px !important; width: 48px; height: 48px; }
  `]
})
export class StockDetailComponent implements OnInit, OnDestroy {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  // WHY Location? Enables browser history navigation — goBack() returns to wherever
  // the user came from (Screener, Markets, Dashboard) rather than hardcoding /markets.
  private readonly location = inject(Location);
  private readonly marketSvc = inject(MarketService);
  private readonly store = inject(Store);
  private readonly notificationSvc = inject(NotificationService);
  // WHY inject AlertService here? Stock detail is where users create price alerts.
  // The alert bell in the header opens a mini form that POSTs to /api/alerts.
  private readonly alertSvc = inject(AlertService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();

  readonly loading = signal(false);
  readonly detail = signal<StockDetail | null>(null);

  // WHY showTrade? Source-aware routing: Screener → no Buy/Sell/Order-Book.
  // Dashboard & Markets → full trading access. Driven by ?source= query param.
  readonly showTrade = signal(true);

  // WHY tradePanel? Separates "which action (BUY/SELL)" from "which mode (one-time/SIP)".
  // Opens the mode-selection panel before showing the actual order form.
  readonly tradePanel = signal<TransactionType | null>(null);
  readonly tradeMode  = signal<'onetime' | 'sip' | null>(null);

  // SIP form fields (for the SIP investment mode)
  readonly sipFreq   = signal<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  readonly sipDay    = signal(1);
  readonly sipAmt    = new FormControl<number | null>(null, [Validators.required, Validators.min(100)]);

  // WHY signal for tab? Ensures @if panels are destroyed/recreated on switch,
  // triggering the fadeSlideUp CSS animation properly every time.
  readonly activeDetailTab = signal<DetailTab>('overview');
  readonly corporateActions = signal<CorporateAction[]>([]);
  readonly candles = signal<CandleBar[]>([]);
  readonly orderBook = signal<OrderBook | null>(null);
  // WHY 1Y default? Shows a full market cycle — earnings, dividends, seasonal trends.
  // Traders typically want a year of context before deciding on a position.
  readonly activePeriod = signal<ChartPeriod>('1Y');
  readonly orderType = signal<TransactionType | null>(null);
  readonly inWatchlist = signal(false);

  // Alert form state
  // WHY signals for alert form? Local UI state — no need for NgRx.
  // showAlertForm toggles the card; alertCondition and settingAlert drive the UI.
  readonly showAlertForm = signal(false);
  readonly alertCondition = signal<'ABOVE' | 'BELOW'>('ABOVE');
  readonly settingAlert = signal(false);
  // WHY FormControl here? The price input needs built-in validation (required, min).
  // A signal alone can't run Angular validators — FormControl handles that cleanly.
  readonly alertPriceCtrl = new FormControl<number | null>(null, [
    Validators.required, Validators.min(0.01)
  ]);

  // Derived state
  readonly upcomingActions = computed(() =>
    this.corporateActions().filter(a => a.status === 'UPCOMING')
  );
  readonly pastActions = computed(() =>
    this.corporateActions().filter(a => a.status === 'PAST')
  );
  readonly rangePercent = computed(() => {
    const d = this.detail();
    if (!d) return 50;
    const range = d.fiftyTwoWeekHigh - d.fiftyTwoWeekLow;
    if (range === 0) return 50;
    return ((d.price - d.fiftyTwoWeekLow) / range) * 100;
  });
  readonly bidRatio = computed(() => {
    const ob = this.orderBook();
    if (!ob) return 50;
    const total = ob.totalBidQty + ob.totalAskQty;
    return total === 0 ? 50 : (ob.totalBidQty / total) * 100;
  });

  ngOnInit(): void {
    // WHY queryParams? Source-aware routing — screener hides trading UI.
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.showTrade.set(params['source'] !== 'screener');
    });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const symbol = params['symbol']?.toUpperCase();
      if (symbol) this.loadStock(symbol);
    });

    // Refresh order book every 5 seconds
    interval(5000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const d = this.detail();
      if (d) {
        this.marketSvc.getOrderBook(d.symbol).subscribe(ob => this.orderBook.set(ob));
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // WHY location.back()? User may arrive from Screener, Dashboard, Portfolio, or Markets.
  // Hardcoding /markets breaks the nav when coming from elsewhere.
  goBack(): void {
    this.location.back();
  }

  openOrder(type: TransactionType): void {
    // WHY open a panel first? Let user choose One-time vs SIP before showing the order form.
    this.tradePanel.set(type);
    this.tradeMode.set(null);
    this.orderType.set(null);
  }

  selectTradeMode(mode: 'onetime' | 'sip'): void {
    this.tradeMode.set(mode);
    if (mode === 'onetime') {
      this.orderType.set(this.tradePanel());
    }
  }

  closeTrade(): void {
    this.tradePanel.set(null);
    this.tradeMode.set(null);
    this.orderType.set(null);
  }

  toggleWatchlist(): void {
    const d = this.detail();
    if (!d) return;
    if (this.inWatchlist()) {
      this.store.dispatch(MarketActions.removeFromWatchlist({ symbol: d.symbol }));
      this.inWatchlist.set(false);
      this.snackBar.open(
        `${d.symbol} removed from Watchlist`,
        '✕',
        { duration: 3000, panelClass: ['tf-snack', 'tf-snack-remove'] }
      );
    } else {
      this.store.dispatch(MarketActions.addToWatchlist({ symbol: d.symbol }));
      this.inWatchlist.set(true);
      const ref = this.snackBar.open(
        `⭐ ${d.symbol} added to Watchlist`,
        'View',
        { duration: 4000, panelClass: ['tf-snack', 'tf-snack-add'] }
      );
      ref.onAction().subscribe(() => this.router.navigate(['/markets']));
    }
  }

  loadHistory(period: ChartPeriod): void {
    const d = this.detail();
    if (!d) return;
    this.activePeriod.set(period);
    this.marketSvc.getStockHistory(d.symbol, period)
      .pipe(takeUntil(this.destroy$))
      .subscribe(bars => this.candles.set(bars));
  }

  getBidBarWidth(i: number): number {
    const ob = this.orderBook();
    if (!ob || !ob.bids[i]) return 0;
    const maxQty = Math.max(...ob.bids.map(b => b.quantity));
    return (ob.bids[i].quantity / maxQty) * 80;
  }

  getAskBarWidth(i: number): number {
    const ob = this.orderBook();
    if (!ob || !ob.asks[i]) return 0;
    const maxQty = Math.max(...ob.asks.map(a => a.quantity));
    return (ob.asks[i].quantity / maxQty) * 80;
  }

  // WHY toggleAlertForm? Opens/closes the alert panel.
  // Pre-fills the price input slightly above/below current price so the direction
  // guard doesn't immediately reject it (target must cross current price, not equal it).
  toggleAlertForm(): void {
    this.showAlertForm.update(v => !v);
    if (this.showAlertForm()) {
      const d = this.detail();
      if (d) this.prefillAlertPrice(d.price, this.alertCondition());
    }
  }

  // WHY setCondition? When user switches ABOVE/BELOW, we also update the pre-filled
  // price so it's always valid for the new direction without requiring manual entry.
  setCondition(cond: 'ABOVE' | 'BELOW'): void {
    this.alertCondition.set(cond);
    const d = this.detail();
    if (d) this.prefillAlertPrice(d.price, cond);
  }

  private prefillAlertPrice(currentPrice: number, condition: 'ABOVE' | 'BELOW'): void {
    const buffer = condition === 'ABOVE' ? 1.02 : 0.98;
    this.alertPriceCtrl.setValue(Math.round(currentPrice * buffer * 100) / 100);
  }

  // WHY setAlert? POSTs the alert to the backend, then shows a notification and closes the form.
  // settingAlert guards the button from double-clicks during the in-flight request.
  setAlert(): void {
    const d = this.detail();
    const price = this.alertPriceCtrl.value;
    if (!d || !price || this.alertPriceCtrl.invalid) return;

    // WHY direction guard? The backend fires alerts when price CROSSES the target.
    // If the user sets ABOVE ≤ current price (or BELOW ≥ current price), the alert
    // would fire on the very next price tick — or never at all — giving wrong UX.
    const currentPrice = d.price;
    const condition = this.alertCondition();
    if (condition === 'ABOVE' && price <= currentPrice) {
      this.snackBar.open(
        `For ABOVE alert, target must be higher than current price (₹${currentPrice.toFixed(2)})`,
        '✕', { duration: 4000, panelClass: ['tf-snack', 'tf-snack-remove'] }
      );
      return;
    }
    if (condition === 'BELOW' && price >= currentPrice) {
      this.snackBar.open(
        `For BELOW alert, target must be lower than current price (₹${currentPrice.toFixed(2)})`,
        '✕', { duration: 4000, panelClass: ['tf-snack', 'tf-snack-remove'] }
      );
      return;
    }

    this.settingAlert.set(true);
    this.alertSvc.createAlert(d.symbol, price, condition).subscribe({
      next: () => {
        this.settingAlert.set(false);
        this.showAlertForm.set(false);
        this.alertPriceCtrl.reset();
        this.notificationSvc.add(
          'PRICE_ALERT',
          `Alert Set — ${d.symbol}`,
          `You will be notified when ${d.symbol} goes ${condition} ₹${price.toFixed(2)}`,
          d.symbol
        );
        const alertRef = this.snackBar.open(
          `Alert set — ${d.symbol} ${condition === 'ABOVE' ? 'above' : 'below'} ₹${price.toFixed(2)}`,
          'View Alerts',
          { duration: 5000, panelClass: ['tf-snack', 'tf-snack-add'] }
        );
        alertRef.onAction().subscribe(() => this.router.navigate(['/alerts']));
      },
      error: () => {
        this.settingAlert.set(false);
        this.snackBar.open('Failed to set alert. Please try again.', '✕', {
          duration: 3000, panelClass: ['tf-snack', 'tf-snack-remove']
        });
      },
    });
  }

  private loadStock(symbol: string): void {
    this.loading.set(true);
    this.marketSvc.getStockDetail(symbol)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: resp => {
          this.detail.set(resp.detail);
          this.corporateActions.set(resp.corporateActions);
          this.loading.set(false);
          this.loadHistory('1Y');
          this.marketSvc.getOrderBook(symbol).subscribe(ob => this.orderBook.set(ob));
        },
        error: () => { this.loading.set(false); }
      });
  }
}
