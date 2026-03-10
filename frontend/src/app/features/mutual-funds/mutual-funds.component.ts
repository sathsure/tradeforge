// WHY MutualFundsComponent?
// Separate screener for mutual funds — distinct asset class from equities.
// Shows fund cards grouped by category (EQUITY/DEBT/HYBRID/INDEX/ELSS).
// Detail view: NAV history chart + SIP allocation calculator.
// SIP calculator answers: "If I invest ₹1000, how much goes to each stock?"

import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MarketService } from '../../core/services/market.service';
import { MutualFund, MFCategory, CandleBar } from '../../core/models/market.models';
import { PriceChartComponent, ChartPeriod } from '../../shared/components/price-chart/price-chart.component';

// Ordered list of categories — controls display order in the page
const CATEGORY_ORDER: MFCategory[] = ['EQUITY', 'INDEX', 'HYBRID', 'DEBT', 'ELSS'];

type RiskFilter    = '' | 'LOW' | 'MODERATE' | 'MODERATELY_HIGH' | 'HIGH' | 'VERY_HIGH';
type ExpenseFilter = '' | 'lt0_5' | 'lt1' | 'lt1_5';
type AumFilter     = '' | 'gt50k' | 'gt10k' | 'lt10k';
type ReturnFilter  = '' | 'gt15' | 'gt20' | 'gt25';

const RISK_COLORS: Record<string, string> = {
  LOW: '#3fb950',
  MODERATE: '#e3b341',
  MODERATELY_HIGH: '#f0883e',
  HIGH: '#f85149',
  VERY_HIGH: '#8b949e',
};

@Component({
  selector: 'app-mutual-funds',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatIconModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatButtonModule, MatTooltipModule,
    MatSelectModule,
    PriceChartComponent,
  ],
  template: `
    <div class="mf-page">

      <!-- ── Header (always visible) ─────────────────────────────────────── -->
      <div class="page-header">
        <div class="header-left">
          @if (selectedFund()) {
            <button class="back-btn" (click)="clearSelection()">
              <mat-icon>arrow_back</mat-icon>
              <span>All Funds</span>
            </button>
          } @else {
            <h2 class="page-title">
              <mat-icon class="title-icon">account_balance</mat-icon>
              Mutual Funds
            </h2>
            @if (!loading()) {
              <span class="result-count">{{ filtered().length }} funds</span>
            }
          }
        </div>

        @if (!selectedFund()) {
          <div class="header-controls">
            <mat-form-field class="search-field" appearance="outline">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [formControl]="searchCtrl" placeholder="SIP your way to wealth…">
            </mat-form-field>
            <mat-form-field class="sort-field" appearance="outline">
              <mat-label>Sort by</mat-label>
              <mat-select [formControl]="sortCtrl">
                <mat-option value="returns1Y">1Y Returns ↓</mat-option>
                <mat-option value="returns3Y">3Y Returns ↓</mat-option>
                <mat-option value="returns5Y">5Y Returns ↓</mat-option>
                <mat-option value="aum">AUM ↓</mat-option>
                <mat-option value="nav">NAV ↓</mat-option>
                <mat-option value="expense">Expense Ratio ↑</mat-option>
              </mat-select>
            </mat-form-field>
            <button class="filter-toggle-btn"
                    [class.filter-toggle-btn--on]="showFilters()"
                    (click)="showFilters.set(!showFilters())">
              <mat-icon>tune</mat-icon>
              Filters
              @if (activeFilterCount() > 0) {
                <span class="ftb-badge">{{ activeFilterCount() }}</span>
              }
            </button>
          </div>
        }
      </div>

      <!-- ── Category chips (list view only) ───────────────────────────── -->
      @if (!selectedFund()) {
        <div class="category-chips">
          @for (c of categoryOptions; track c.value) {
            <button class="cat-chip"
              [class.active]="activeCategory() === c.value"
              (click)="setCategory(c.value)">
              {{ c.label }}
            </button>
          }
        </div>

        <!-- Advanced filter panel -->
        @if (showFilters()) {
          <div class="filter-panel">
            <div class="fp-grid">

              <div class="fp-group">
                <span class="fp-label"><mat-icon>warning_amber</mat-icon> Risk Level</span>
                <div class="fp-chips">
                  @for (o of riskOptions; track o.value) {
                    <button class="fp-chip" [class.fp-chip--on]="activeRisk() === o.value"
                            (click)="activeRisk.set(o.value)">{{ o.label }}</button>
                  }
                </div>
              </div>

              <div class="fp-group">
                <span class="fp-label"><mat-icon>receipt</mat-icon> Expense Ratio</span>
                <div class="fp-chips">
                  @for (o of expenseOptions; track o.value) {
                    <button class="fp-chip" [class.fp-chip--on]="activeExpense() === o.value"
                            (click)="activeExpense.set(o.value)">{{ o.label }}</button>
                  }
                </div>
              </div>

              <div class="fp-group">
                <span class="fp-label"><mat-icon>account_balance_wallet</mat-icon> AUM Size</span>
                <div class="fp-chips">
                  @for (o of aumOptions; track o.value) {
                    <button class="fp-chip" [class.fp-chip--on]="activeAum() === o.value"
                            (click)="activeAum.set(o.value)">{{ o.label }}</button>
                  }
                </div>
              </div>

              <div class="fp-group">
                <span class="fp-label"><mat-icon>trending_up</mat-icon> 1Y Returns</span>
                <div class="fp-chips">
                  @for (o of returnOptions; track o.value) {
                    <button class="fp-chip" [class.fp-chip--on]="activeReturn() === o.value"
                            (click)="activeReturn.set(o.value)">{{ o.label }}</button>
                  }
                </div>
              </div>

            </div>
            @if (activeFilterCount() > 0) {
              <button class="fp-clear-btn" (click)="clearFilters()">
                <mat-icon>clear_all</mat-icon> Clear filters
              </button>
            }
          </div>
        }

        <!-- Active filter chips bar -->
        @if (activeFilterCount() > 0 && !showFilters()) {
          <div class="active-filters-bar">
            <span class="afb-label">Filters:</span>
            @for (f of activeFilterLabels(); track f.key) {
              <span class="afb-chip">
                {{ f.label }}
                <button class="afb-remove" (click)="removeMFFilter(f.key)">
                  <mat-icon>close</mat-icon>
                </button>
              </span>
            }
            <button class="afb-clear" (click)="clearFilters()">Clear all</button>
          </div>
        }
      }

      <!-- ── Loading ────────────────────────────────────────────────────── -->
      @if (loading()) {
        <div class="loading-wrap">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading funds…</span>
        </div>
      }

      <!-- ════════════════════════════════════════════════════════════════
           LIST VIEW
      ═══════════════════════════════════════════════════════════════════ -->
      @if (!loading() && !selectedFund()) {
        <div class="list-view">
          @for (cat of visibleCategories(); track cat) {
            <section class="category-section">
              <div class="cat-header">
                <span class="cat-title">{{ cat }}</span>
                <span class="cat-badge">{{ (fundsByCategory()[cat] ?? []).length }} funds</span>
              </div>
              <div class="fund-grid">
                @for (fund of fundsByCategory()[cat]; track fund.id) {
                  <div class="fund-card" (click)="selectFund(fund)" [class.fund-card--clicked]="clickedFund === fund.id">
                    <div class="fund-card-top">
                      <div class="fund-name-wrap">
                        <span class="fund-name">{{ fund.name }}</span>
                        <span class="fund-amc">{{ fund.amcName }}</span>
                      </div>
                      <div class="fund-risk" [style.color]="getRiskColor(fund.riskLevel)">
                        <span class="risk-dot" [style.background]="getRiskColor(fund.riskLevel)"></span>
                        {{ fund.riskLevel | titlecase }}
                      </div>
                    </div>

                    <div class="fund-nav-row">
                      <div class="nav-block">
                        <span class="nav-label">NAV</span>
                        <span class="nav-value text-mono">₹{{ fund.nav | number:'1.2-2' }}</span>
                      </div>
                      <div class="nav-block">
                        <span class="nav-label">AUM</span>
                        <span class="nav-value text-mono">{{ fund.aumFmt }}</span>
                      </div>
                      <div class="nav-block">
                        <span class="nav-label">Exp. Ratio</span>
                        <span class="nav-value text-mono">{{ fund.expenseRatio }}%</span>
                      </div>
                    </div>

                    <div class="returns-row">
                      <div class="return-block" [class.positive]="fund.returns1Y > 0" [class.negative]="fund.returns1Y < 0">
                        <span class="ret-label">1Y</span>
                        <span class="ret-val">{{ fund.returns1Y > 0 ? '+' : '' }}{{ fund.returns1Y | number:'1.1-1' }}%</span>
                      </div>
                      <div class="return-block" [class.positive]="fund.returns3Y > 0" [class.negative]="fund.returns3Y < 0">
                        <span class="ret-label">3Y</span>
                        <span class="ret-val">{{ fund.returns3Y > 0 ? '+' : '' }}{{ fund.returns3Y | number:'1.1-1' }}%</span>
                      </div>
                      <div class="return-block" [class.positive]="fund.returns5Y > 0" [class.negative]="fund.returns5Y < 0">
                        <span class="ret-label">5Y</span>
                        <span class="ret-val">{{ fund.returns5Y > 0 ? '+' : '' }}{{ fund.returns5Y | number:'1.1-1' }}%</span>
                      </div>
                      <div class="return-block benchmark">
                        <span class="ret-label">Benchmark</span>
                        <span class="ret-val text-muted">{{ fund.benchmarkReturn | number:'1.1-1' }}%</span>
                      </div>
                    </div>

                    <div class="fund-footer">
                      <span class="min-sip">Min SIP ₹{{ fund.minSip | number }}</span>
                      <span class="sub-cat">{{ fund.subCategory }}</span>
                    </div>
                  </div>
                }
              </div>
            </section>
          }

          @if (filtered().length === 0) {
            <div class="empty-state">
              <mat-icon>find_in_page</mat-icon>
              <p>No funds match your search.</p>
              <button mat-stroked-button (click)="resetFilters()">Reset</button>
            </div>
          }
        </div>
      }

      <!-- ════════════════════════════════════════════════════════════════
           DETAIL VIEW
      ═══════════════════════════════════════════════════════════════════ -->
      @if (!loading() && selectedFund(); as fund) {
        <div class="detail-view">

          <!-- Fund identity -->
          <div class="detail-header">
            <div class="detail-title-row">
              <h2 class="detail-name">{{ fund.name }}</h2>
              <div class="detail-badges">
                <span class="badge-cat">{{ fund.category }}</span>
                <span class="badge-risk" [style.background]="getRiskColor(fund.riskLevel) + '22'"
                  [style.color]="getRiskColor(fund.riskLevel)">
                  {{ fund.riskLevel | titlecase }}
                </span>
                @if (showTrade()) {
                  <button class="mf-invest-btn" (click)="tradeMF.set('invest'); tradeMFMode.set(null)">
                    <mat-icon>add_circle</mat-icon> Invest
                  </button>
                  <button class="mf-redeem-btn" (click)="tradeMF.set('redeem'); tradeMFMode.set(null)">
                    <mat-icon>remove_circle_outline</mat-icon> Redeem
                  </button>
                }
              </div>
            </div>
            <div class="detail-sub">
              <span class="text-muted">{{ fund.amcName }}</span>
              <span class="separator">•</span>
              <button class="manager-link"
                      (click)="showManagerInfo.set(!showManagerInfo())"
                      [class.manager-link--active]="showManagerInfo()">
                <mat-icon class="mgr-icon">person</mat-icon>
                {{ fund.fundManager }}
                <mat-icon class="mgr-chevron">{{ showManagerInfo() ? 'expand_less' : 'expand_more' }}</mat-icon>
              </button>
              <span class="separator">•</span>
              <span class="text-muted">{{ fund.subCategory }}</span>
            </div>

            <!-- Manager info card (toggled on click) -->
            @if (showManagerInfo()) {
              @let mgr = getManagerInfo(fund.fundManager);
              <div class="mgr-card">
                <button class="mgr-close" (click)="showManagerInfo.set(false)">
                  <mat-icon>close</mat-icon>
                </button>
                <div class="mgr-top">
                  <div class="mgr-avatar">{{ fund.fundManager | slice:0:1 }}</div>
                  <div class="mgr-identity">
                    <span class="mgr-name">{{ fund.fundManager }}</span>
                    <span class="mgr-title text-muted">Fund Manager &nbsp;·&nbsp; {{ fund.amcName }}</span>
                  </div>
                </div>
                <div class="mgr-stats">
                  <div class="mgr-stat">
                    <span class="mgr-stat-val text-mono">{{ mgr.experience }} yrs</span>
                    <span class="mgr-stat-lbl">Experience</span>
                  </div>
                  <div class="mgr-stat">
                    <span class="mgr-stat-val text-mono">{{ mgr.aum }}</span>
                    <span class="mgr-stat-lbl">AUM Managed</span>
                  </div>
                  <div class="mgr-stat">
                    <span class="mgr-stat-val text-mono">{{ mgr.funds }}</span>
                    <span class="mgr-stat-lbl">Funds</span>
                  </div>
                  <div class="mgr-stat">
                    <span class="mgr-stat-val text-mono">{{ mgr.since }}</span>
                    <span class="mgr-stat-lbl">With {{ fund.amcName | slice:0:8 }}…</span>
                  </div>
                </div>
                <div class="mgr-details">
                  <div class="mgr-detail-row">
                    <mat-icon class="mgr-detail-icon">school</mat-icon>
                    <span>{{ mgr.education }}</span>
                  </div>
                  <div class="mgr-detail-row">
                    <mat-icon class="mgr-detail-icon">business</mat-icon>
                    <span>Previously at <strong>{{ mgr.prevFirm }}</strong></span>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- ── MF Trade Options Panel ──────────────────────────────────── -->
          @if (tradeMF() && !tradeMFMode()) {
            <div class="mf-trade-panel">
              <div class="mf-tp-header">
                <span class="mf-tp-title">
                  <mat-icon [class.text-green]="tradeMF() === 'invest'" [class.text-red]="tradeMF() === 'redeem'">
                    {{ tradeMF() === 'invest' ? 'add_circle' : 'remove_circle_outline' }}
                  </mat-icon>
                  {{ tradeMF() === 'invest' ? 'Invest in' : 'Redeem from' }} {{ fund.name }}
                </span>
                <button class="mf-tp-close" (click)="tradeMF.set(null)"><mat-icon>close</mat-icon></button>
              </div>
              <div class="mf-tp-chips">
                @if (tradeMF() === 'invest') {
                  <button class="mf-tp-chip" (click)="tradeMFMode.set('onetime')">
                    <mat-icon>shopping_cart</mat-icon>
                    <span class="mf-tpc-label">Lump Sum</span>
                    <p class="mf-tpc-desc">One-time investment at current NAV</p>
                  </button>
                  <button class="mf-tp-chip" (click)="tradeMFMode.set('sip')">
                    <mat-icon>autorenew</mat-icon>
                    <span class="mf-tpc-label">SIP</span>
                    <p class="mf-tpc-desc">Systematic Investment Plan — monthly recurring</p>
                  </button>
                  <button class="mf-tp-chip" (click)="tradeMFMode.set('stp')">
                    <mat-icon>swap_horiz</mat-icon>
                    <span class="mf-tpc-label">STP</span>
                    <p class="mf-tpc-desc">Systematic Transfer Plan — move from another fund</p>
                  </button>
                } @else {
                  <button class="mf-tp-chip" (click)="tradeMFMode.set('onetime')">
                    <mat-icon>money_off</mat-icon>
                    <span class="mf-tpc-label">Full Redeem</span>
                    <p class="mf-tpc-desc">One-time redemption at current NAV</p>
                  </button>
                  <button class="mf-tp-chip" (click)="tradeMFMode.set('swp')">
                    <mat-icon>account_balance_wallet</mat-icon>
                    <span class="mf-tpc-label">SWP</span>
                    <p class="mf-tpc-desc">Systematic Withdrawal Plan — regular income</p>
                  </button>
                }
              </div>
            </div>
          }

          @if (tradeMF() && tradeMFMode()) {
            <div class="mf-trade-panel">
              <div class="mf-tp-header">
                <span class="mf-tp-title">
                  <mat-icon class="text-cyan">{{ tradeMFMode() === 'sip' ? 'autorenew' : tradeMFMode() === 'swp' ? 'account_balance_wallet' : tradeMFMode() === 'stp' ? 'swap_horiz' : 'shopping_cart' }}</mat-icon>
                  {{ tradeMFMode() | titlecase }} — {{ fund.name }}
                </span>
                <button class="mf-tp-close" (click)="tradeMF.set(null); tradeMFMode.set(null)"><mat-icon>close</mat-icon></button>
              </div>
              <div class="mf-tp-form">
                <div class="mf-tp-field">
                  <label class="mf-tp-label">
                    {{ tradeMFMode() === 'swp' ? 'Withdrawal Amount (₹/period)' : 'Investment Amount (₹)' }}
                  </label>
                  <input class="mf-tp-input text-mono" type="number" min="100" step="100"
                         [formControl]="mfSipAmt"
                         placeholder="Min ₹{{ fund.minSip | number }}">
                </div>
                @if (tradeMFMode() === 'sip' || tradeMFMode() === 'swp') {
                  <div class="mf-tp-field">
                    <label class="mf-tp-label">Frequency</label>
                    <div class="mf-tp-freq">
                      <span class="mf-tp-freq-val">Monthly on the 1st</span>
                    </div>
                  </div>
                }
                <div class="mf-tp-summary">
                  NAV: <strong class="text-mono">₹{{ fund.nav | number:'1.2-2' }}</strong>
                  &nbsp;·&nbsp; Min Lumpsum: <strong class="text-mono">₹{{ fund.minLumpsum | number }}</strong>
                  &nbsp;·&nbsp; Min SIP: <strong class="text-mono">₹{{ fund.minSip | number }}</strong>
                </div>
                <div class="mf-tp-footer">
                  <button class="mf-tp-back-btn" (click)="tradeMFMode.set(null)">← Back</button>
                  <button class="mf-tp-confirm-btn" (click)="tradeMF.set(null); tradeMFMode.set(null)">
                    Confirm {{ tradeMFMode() | titlecase }}
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Key metrics row -->
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="m-label">NAV</span>
              <span class="m-value text-mono">₹{{ fund.nav | number:'1.2-2' }}</span>
              <span class="m-sub">as of {{ fund.lastNavDate }}</span>
            </div>
            <div class="metric-card">
              <span class="m-label">AUM</span>
              <span class="m-value text-mono">{{ fund.aumFmt }}</span>
              <span class="m-sub">Assets under management</span>
            </div>
            <div class="metric-card">
              <span class="m-label">Expense Ratio</span>
              <span class="m-value text-mono">{{ fund.expenseRatio }}%</span>
              <span class="m-sub">Annual fund cost</span>
            </div>
            <div class="metric-card">
              <span class="m-label">Min SIP</span>
              <span class="m-value text-mono">₹{{ fund.minSip | number }}</span>
              <span class="m-sub">Min Lumpsum ₹{{ fund.minLumpsum | number }}</span>
            </div>
          </div>

          <!-- Returns vs Benchmark -->
          <div class="returns-card">
            <h3 class="card-title">Returns vs Benchmark ({{ fund.benchmark }})</h3>
            <div class="returns-compare">
              @for (r of getReturnRows(fund); track r.label) {
                <div class="return-compare-item">
                  <span class="rc-label">{{ r.label }}</span>
                  <div class="rc-bar-wrap">
                    <div class="rc-bar fund-bar"
                      [style.width.%]="getBarWidth(r.fund, r.bench)"
                      [class.positive]="r.fund > 0" [class.negative]="r.fund < 0">
                      <span class="rc-val">{{ r.fund > 0 ? '+' : '' }}{{ r.fund | number:'1.1-1' }}%</span>
                    </div>
                    <div class="rc-bar bench-bar"
                      [style.width.%]="getBarWidth(r.bench, r.fund)">
                      <span class="rc-val text-muted">{{ r.bench | number:'1.1-1' }}%</span>
                    </div>
                  </div>
                </div>
              }
              <div class="rc-legend">
                <span class="legend-fund">Fund</span>
                <span class="legend-bench">Benchmark</span>
              </div>
            </div>
          </div>

          <!-- NAV History Chart -->
          <div class="chart-card">
            <h3 class="card-title">NAV History</h3>
            @if (navLoading()) {
              <div class="loading-wrap"><mat-spinner diameter="32"></mat-spinner></div>
            } @else if (navCandles().length > 0) {
              <app-price-chart
                [candles]="navCandles()"
                [chartType]="'area'"
                [currentPeriod]="navPeriod()"
                (periodChange)="onNavPeriodChange($event)">
              </app-price-chart>
            }
          </div>

          <!-- SIP Calculator -->
          <div class="sip-card">
            <h3 class="card-title">
              <mat-icon class="card-icon">calculate</mat-icon>
              SIP Allocation Calculator
            </h3>
            <p class="sip-desc">
              See how your monthly SIP is allocated across holdings of this fund.
            </p>
            <div class="sip-input-row">
              <label class="sip-label">Monthly SIP Amount (₹)</label>
              <input class="sip-input text-mono"
                type="number" min="500" step="500"
                [value]="sipAmount()"
                (input)="onSipInput($event)">
            </div>
            <div class="sip-table">
              @for (h of sipBreakdown(); track h.symbol) {
                <div class="sip-row">
                  <div class="sip-holding">
                    <span class="sip-sym">{{ h.symbol }}</span>
                    <span class="sip-hname">{{ h.name }}</span>
                  </div>
                  <div class="sip-bar-wrap">
                    <div class="sip-bar" [style.width.%]="h.percentage"></div>
                  </div>
                  <div class="sip-pct text-mono">{{ h.percentage | number:'1.1-1' }}%</div>
                  <div class="sip-amount text-mono text-green">₹{{ h.amount | number:'1.2-2' }}</div>
                </div>
              }
              @if (othersPercent() > 0) {
                <div class="sip-row others">
                  <div class="sip-holding">
                    <span class="sip-sym">Others</span>
                    <span class="sip-hname">Remaining holdings in fund</span>
                  </div>
                  <div class="sip-bar-wrap">
                    <div class="sip-bar others-bar" [style.width.%]="othersPercent()"></div>
                  </div>
                  <div class="sip-pct text-mono text-muted">{{ othersPercent() | number:'1.1-1' }}%</div>
                  <div class="sip-amount text-mono text-muted">₹{{ othersAmount() | number:'1.2-2' }}</div>
                </div>
              }
            </div>
            <div class="sip-total">
              Total SIP: <span class="text-mono text-primary">₹{{ sipAmount() | number }}</span>
            </div>
          </div>

          <!-- Top Holdings Table -->
          <div class="holdings-card">
            <h3 class="card-title">Top Holdings</h3>
            <div class="holdings-table">
              <div class="htable-header">
                <span>Symbol</span>
                <span>Name</span>
                <span class="text-right">Weight</span>
              </div>
              @for (h of fund.topHoldings; track h.symbol; let i = $index) {
                <div class="htable-row">
                  <span class="h-sym">{{ h.symbol }}</span>
                  <span class="h-name text-muted">{{ h.name }}</span>
                  <div class="h-weight">
                    <div class="weight-bar-wrap">
                      <div class="weight-bar" [style.width.%]="h.percentage * 4"></div>
                    </div>
                    <span class="text-mono">{{ h.percentage | number:'1.1-1' }}%</span>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Shareholding Pattern -->
          <div class="sh-card">
            <h3 class="card-title">
              <mat-icon class="card-icon">donut_large</mat-icon>
              Shareholding Pattern
            </h3>
            <p class="sh-subtitle">
              Weighted avg. ownership profile of top holdings &nbsp;·&nbsp; Q-end filings &nbsp;·&nbsp; BSE/NSE
            </p>

            <!-- Year selector tabs -->
            <div class="sh-year-tabs">
              @for (y of shYears; track y.label) {
                <button class="sh-year-tab"
                        [class.sh-year-tab--active]="shActiveYear() === y.offset"
                        (click)="shActiveYear.set(y.offset)">
                  {{ y.label }}
                </button>
              }
            </div>

            <!-- Stacked pill bar — animates in from left; transitions between years -->
            <div class="sh-bar-wrap">
              <div class="sh-bar">
                @for (s of getShareholderData(fund, shActiveYear()); track s.label) {
                  <div class="sh-seg"
                       [style.flex-basis.%]="s.pct"
                       [style.background]="s.color"
                       [matTooltip]="s.label + ': ' + (s.pct | number:'1.1-1') + '%'">
                  </div>
                }
              </div>
            </div>

            <!-- 2 × 2 legend grid (selected year) -->
            <div class="sh-legend">
              @for (s of getShareholderData(fund, shActiveYear()); track s.label) {
                <div class="sh-item" [style.border-left-color]="s.color">
                  <div class="sh-item-top">
                    <div class="sh-dot-label">
                      <span class="sh-dot" [style.background]="s.color"></span>
                      <span class="sh-label">{{ s.label }}</span>
                    </div>
                    <span class="sh-chg text-mono"
                          [class.sh-chg--up]="s.chg > 0"
                          [class.sh-chg--dn]="s.chg < 0">
                      {{ s.chg > 0 ? '▲' : '▼' }}&nbsp;{{ (s.chg > 0 ? s.chg : -s.chg) | number:'1.1-1' }}%
                    </span>
                  </div>
                  <div class="sh-pct text-mono">{{ s.pct | number:'1.1-1' }}%</div>
                  <div class="sh-mini-bar-wrap">
                    <div class="sh-mini-bar" [style.width.%]="s.pct" [style.background]="s.color"></div>
                  </div>
                </div>
              }
            </div>

            <div class="sh-footer">
              {{ shYears[shActiveYear()].label }} &nbsp;|&nbsp; Q3 filing &nbsp;|&nbsp; BSE/NSE disclosure
            </div>
          </div>

        </div>
      }

    </div>
  `,
  styles: [`
    .mf-page {
      padding: 24px;
      animation: mfPageIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    @keyframes mfPageIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px; gap: 12px; flex-wrap: wrap;
    }
    .header-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .page-title {
      display: flex; align-items: center; gap: 8px;
      color: var(--tf-text-primary); font-size: 20px; font-weight: 600; margin: 0;
    }
    .title-icon { color: var(--tf-cyan); }
    .result-count {
      color: var(--tf-text-muted); font-size: 12px;
      background: var(--tf-bg-elevated); padding: 2px 10px; border-radius: 12px;
    }
    .back-btn {
      display: flex; align-items: center; gap: 6px; padding: 6px 14px;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); color: var(--tf-text-primary);
      cursor: pointer; font-size: 14px; transition: all 0.15s;
    }
    .back-btn:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .search-field {
      width: 260px;
      transition: width 0.35s cubic-bezier(0.4,0,0.2,1), filter 0.35s cubic-bezier(0.4,0,0.2,1);
      --mdc-outlined-text-field-focus-outline-color: var(--tf-cyan);
      --mdc-outlined-text-field-hover-outline-color: rgba(79,172,254,0.5);
      --mdc-outlined-text-field-focus-outline-width: 2px;
    }
    .search-field:focus-within {
      width: 340px;
      filter: drop-shadow(0 0 8px rgba(79,172,254,0.28));
    }
    .sort-field { width: 180px; }

    /* Filter toggle button */
    .filter-toggle-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 0 16px; height: 56px;
      border: 1px solid var(--tf-border); border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-surface); color: var(--tf-text-secondary);
      font-size: 13px; font-weight: 500; cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    .filter-toggle-btn mat-icon { font-size: 18px; }
    .filter-toggle-btn:hover {
      border-color: var(--tf-cyan); color: var(--tf-cyan);
      background: rgba(79,172,254,0.06);
    }
    .filter-toggle-btn--on {
      border-color: var(--tf-cyan); color: var(--tf-cyan);
      background: rgba(79,172,254,0.10);
      box-shadow: 0 0 0 1px rgba(79,172,254,0.3);
    }
    .ftb-badge {
      background: var(--tf-cyan); color: #000;
      font-size: 10px; font-weight: 700;
      width: 18px; height: 18px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
    }

    /* Advanced filter panel */
    .filter-panel {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px 20px 14px;
      margin-bottom: 16px;
      animation: fpSlideIn 0.22s cubic-bezier(0.4,0,0.2,1) both;
    }
    @keyframes fpSlideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .fp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .fp-group { display: flex; flex-direction: column; gap: 8px; }
    .fp-label {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; color: var(--tf-text-muted);
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .fp-label mat-icon { font-size: 14px; }
    .fp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .fp-chip {
      padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer;
      transition: all 0.15s cubic-bezier(0.4,0,0.2,1);
    }
    .fp-chip:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .fp-chip--on {
      background: rgba(79,172,254,0.15); border-color: var(--tf-cyan);
      color: var(--tf-cyan); font-weight: 600;
    }
    .fp-clear-btn {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 14px; padding: 4px 12px; border-radius: 14px;
      border: 1px solid rgba(248,81,73,0.3); background: rgba(248,81,73,0.06);
      color: var(--tf-red); font-size: 12px; cursor: pointer;
      transition: all 0.15s;
    }
    .fp-clear-btn mat-icon { font-size: 15px; }
    .fp-clear-btn:hover { background: rgba(248,81,73,0.14); }

    /* Active filter chips bar */
    .active-filters-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      margin-bottom: 14px;
      animation: fpSlideIn 0.18s ease both;
    }
    .afb-label { font-size: 11px; color: var(--tf-text-muted); font-weight: 600; }
    .afb-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px 3px 12px; border-radius: 14px;
      background: rgba(79,172,254,0.12); border: 1px solid rgba(79,172,254,0.35);
      color: var(--tf-cyan); font-size: 12px; font-weight: 500;
    }
    .afb-remove {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; padding: 0;
      border: none; background: transparent; color: var(--tf-cyan);
      cursor: pointer; border-radius: 50%; transition: background 0.12s;
    }
    .afb-remove mat-icon { font-size: 12px; }
    .afb-remove:hover { background: rgba(79,172,254,0.25); }
    .afb-clear {
      padding: 3px 10px; border-radius: 14px; font-size: 11px;
      border: 1px solid var(--tf-border); background: transparent;
      color: var(--tf-text-muted); cursor: pointer; transition: all 0.12s;
    }
    .afb-clear:hover { border-color: var(--tf-red); color: var(--tf-red); }

    /* Category chips */
    .category-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
    .cat-chip {
      padding: 5px 16px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--tf-border); background: var(--tf-bg-surface);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .cat-chip:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .cat-chip.active {
      background: var(--tf-cyan); color: #000; border-color: var(--tf-cyan); font-weight: 600;
    }

    /* Loading */
    .loading-wrap {
      display: flex; flex-direction: column; align-items: center;
      gap: 16px; padding: 60px; color: var(--tf-text-muted);
    }

    /* ── LIST VIEW ─────────────────────────────────────────────────── */
    .category-section { margin-bottom: 32px; }
    .cat-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .cat-title {
      font-size: 16px; font-weight: 700; color: var(--tf-text-primary);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .cat-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 10px;
      background: var(--tf-bg-elevated); color: var(--tf-text-muted);
    }

    .fund-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 14px;
    }
    .fund-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px;
      cursor: pointer; transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
      animation: cardIn 0.3s ease-out both;
    }
    .fund-card:nth-child(1) { animation-delay: 0.04s; }
    .fund-card:nth-child(2) { animation-delay: 0.08s; }
    .fund-card:nth-child(3) { animation-delay: 0.12s; }
    .fund-card:nth-child(4) { animation-delay: 0.16s; }
    .fund-card:nth-child(5) { animation-delay: 0.20s; }
    .fund-card:nth-child(6) { animation-delay: 0.24s; }
    .fund-card:nth-child(n+7) { animation-delay: 0.28s; }
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .fund-card--clicked { transform: scale(0.97) !important; opacity: 0.8; }
    .fund-card:hover {
      border-color: var(--tf-cyan); transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(79,172,254,0.12);
    }

    .fund-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px; }
    .fund-name-wrap { flex: 1; }
    .fund-name { display: block; font-weight: 600; font-size: 13px; color: var(--tf-text-primary); line-height: 1.3; }
    .fund-amc { display: block; font-size: 11px; color: var(--tf-text-muted); margin-top: 2px; }
    .fund-risk { display: flex; align-items: center; gap: 4px; font-size: 11px; white-space: nowrap; }
    .risk-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    .fund-nav-row { display: flex; gap: 16px; margin-bottom: 12px; }
    .nav-block { display: flex; flex-direction: column; gap: 2px; }
    .nav-label { font-size: 10px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .nav-value { font-size: 13px; font-weight: 600; color: var(--tf-text-primary); }

    .returns-row { display: flex; gap: 8px; margin-bottom: 10px; }
    .return-block {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      flex: 1; padding: 6px 4px; border-radius: 6px;
      background: var(--tf-bg-elevated);
    }
    .return-block.benchmark { background: transparent; }
    .ret-label { font-size: 10px; color: var(--tf-text-muted); }
    .ret-val { font-size: 12px; font-weight: 600; }
    .return-block.positive .ret-val { color: var(--tf-green); }
    .return-block.negative .ret-val { color: var(--tf-red); }

    .fund-footer { display: flex; justify-content: space-between; align-items: center; }
    .min-sip { font-size: 11px; color: var(--tf-text-muted); }
    .sub-cat {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      background: rgba(79,172,254,0.08); color: var(--tf-cyan);
    }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 60px; color: var(--tf-text-muted); text-align: center;
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--tf-border); }

    /* ── DETAIL VIEW ──────────────────────────────────────────────── */
    .detail-view { display: flex; flex-direction: column; gap: 20px; max-width: 1100px; }

    .detail-header { }
    .detail-title-row { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .detail-name { font-size: 22px; font-weight: 700; color: var(--tf-text-primary); margin: 0; flex: 1; }
    .detail-badges { display: flex; gap: 8px; align-items: center; }
    .badge-cat {
      font-size: 12px; padding: 3px 10px; border-radius: 4px;
      background: rgba(79,172,254,0.12); color: var(--tf-cyan); font-weight: 600;
    }
    .badge-risk { font-size: 12px; padding: 3px 10px; border-radius: 4px; font-weight: 600; }
    .detail-sub { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .separator { color: var(--tf-border); }

    /* Metrics grid */
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .metric-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 14px 16px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .m-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .m-value { font-size: 18px; font-weight: 700; color: var(--tf-text-primary); }
    .m-sub { font-size: 11px; color: var(--tf-text-muted); }

    /* Returns card */
    .returns-card, .chart-card, .sip-card, .holdings-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 20px;
    }
    .card-title {
      font-size: 15px; font-weight: 600; color: var(--tf-text-primary);
      margin: 0 0 16px; display: flex; align-items: center; gap: 6px;
    }
    .card-icon { font-size: 18px; color: var(--tf-cyan); }

    .returns-compare { display: flex; flex-direction: column; gap: 10px; }
    .return-compare-item { display: flex; align-items: center; gap: 12px; }
    .rc-label { width: 28px; font-size: 12px; font-weight: 600; color: var(--tf-text-secondary); }
    .rc-bar-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .rc-bar {
      height: 20px; border-radius: 3px; display: flex; align-items: center;
      padding: 0 8px; min-width: 40px; transition: width 0.4s; position: relative;
    }
    .fund-bar { background: rgba(79,172,254,0.25); }
    .fund-bar.positive { background: rgba(63,185,80,0.25); }
    .fund-bar.negative { background: rgba(248,81,73,0.2); }
    .bench-bar { background: var(--tf-bg-elevated); }
    .rc-val { font-size: 11px; font-weight: 600; white-space: nowrap; }
    .rc-legend { display: flex; gap: 16px; margin-top: 4px; }
    .legend-fund { font-size: 11px; color: var(--tf-cyan); }
    .legend-bench { font-size: 11px; color: var(--tf-text-muted); }

    /* SIP Calculator */
    .sip-desc { font-size: 13px; color: var(--tf-text-muted); margin: 0 0 16px; }
    .sip-input-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .sip-label { font-size: 13px; color: var(--tf-text-secondary); }
    .sip-input {
      width: 140px; padding: 8px 12px; border-radius: var(--tf-radius-sm);
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); font-size: 16px; font-weight: 600;
    }
    .sip-input:focus { outline: none; border-color: var(--tf-cyan); }
    .sip-table { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .sip-row { display: flex; align-items: center; gap: 12px; }
    .sip-holding { width: 180px; flex-shrink: 0; }
    .sip-sym { display: block; font-weight: 600; font-size: 13px; color: var(--tf-text-primary); }
    .sip-hname { display: block; font-size: 10px; color: var(--tf-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
    .sip-bar-wrap { flex: 1; height: 6px; background: var(--tf-border); border-radius: 3px; }
    .sip-bar { height: 100%; background: var(--tf-cyan); border-radius: 3px; max-width: 100%; transition: width 0.3s; }
    .others-bar { background: var(--tf-text-muted); }
    .sip-pct { width: 52px; text-align: right; font-size: 12px; }
    .sip-amount { width: 80px; text-align: right; font-size: 13px; font-weight: 600; }
    .sip-total {
      padding-top: 12px; border-top: 1px solid var(--tf-border);
      text-align: right; font-size: 13px; color: var(--tf-text-secondary);
    }
    .text-primary { color: var(--tf-text-primary); }

    /* Holdings table */
    .holdings-table { display: flex; flex-direction: column; }
    .htable-header {
      display: grid; grid-template-columns: 90px 1fr 120px;
      gap: 12px; padding: 8px 12px;
      font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase;
      border-bottom: 1px solid var(--tf-border);
    }
    .htable-row {
      display: grid; grid-template-columns: 90px 1fr 120px;
      gap: 12px; padding: 10px 12px; align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.12s;
    }
    .htable-row:hover { background: var(--tf-bg-elevated); }
    .h-sym { font-weight: 600; font-size: 13px; color: var(--tf-cyan); }
    .h-name { font-size: 12px; }
    .h-weight { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
    .text-right { text-align: right; }
    .weight-bar-wrap { width: 60px; height: 4px; background: var(--tf-border); border-radius: 2px; }
    .weight-bar { height: 100%; background: var(--tf-cyan); border-radius: 2px; max-width: 100%; }

    /* ── Manager link button ─────────────────────────────────────────────── */
    .manager-link {
      display: inline-flex; align-items: center; gap: 3px;
      background: none; border: none; cursor: pointer;
      color: var(--tf-text-secondary); font-size: 13px; padding: 2px 6px;
      border-radius: var(--tf-radius-sm); transition: all 0.15s;
    }
    .manager-link:hover, .manager-link--active {
      color: var(--tf-cyan); background: rgba(57,208,216,0.08);
    }
    .mgr-icon { font-size: 14px; width: 14px; height: 14px; }
    .mgr-chevron { font-size: 16px; width: 16px; height: 16px; }

    /* ── Manager info card ───────────────────────────────────────────────── */
    .mgr-card {
      position: relative;
      background: var(--tf-bg-elevated);
      border: 1px solid var(--tf-cyan);
      border-radius: var(--tf-radius-md); padding: 16px;
      margin-top: 10px;
      animation: mfFadeUp 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    .mgr-close {
      position: absolute; top: 10px; right: 10px;
      background: none; border: none; cursor: pointer;
      color: var(--tf-text-muted); display: flex; align-items: center;
      padding: 2px;
    }
    .mgr-close mat-icon { font-size: 18px; }
    .mgr-close:hover { color: var(--tf-text-primary); }
    .mgr-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .mgr-avatar {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, var(--tf-cyan), #58a6ff);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700; color: #000;
    }
    .mgr-identity { display: flex; flex-direction: column; gap: 2px; }
    .mgr-name { font-size: 15px; font-weight: 700; color: var(--tf-text-primary); }
    .mgr-title { font-size: 12px; }
    .mgr-stats {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; margin-bottom: 14px;
    }
    .mgr-stat {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 10px 8px;
      display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
    }
    .mgr-stat-val { font-size: 15px; font-weight: 700; color: var(--tf-text-primary); }
    .mgr-stat-lbl { font-size: 10px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
    .mgr-details { display: flex; flex-direction: column; gap: 8px; }
    .mgr-detail-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: var(--tf-text-secondary);
    }
    .mgr-detail-icon { font-size: 15px; width: 15px; height: 15px; color: var(--tf-text-muted); }
    .mgr-detail-row strong { color: var(--tf-text-primary); }

    @media (max-width: 600px) {
      .mgr-stats { grid-template-columns: repeat(2, 1fr); }
    }

    /* ── Invest / Redeem buttons ─────────────────────────────────────────── */
    .mf-invest-btn, .mf-redeem-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 12px; border-radius: var(--tf-radius-sm);
      font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid;
      transition: all 0.15s;
    }
    .mf-invest-btn { background: rgba(63,185,80,0.12); color: var(--tf-green); border-color: var(--tf-green); }
    .mf-invest-btn:hover { background: rgba(63,185,80,0.22); }
    .mf-redeem-btn { background: rgba(248,81,73,0.12); color: var(--tf-red); border-color: var(--tf-red); }
    .mf-redeem-btn:hover { background: rgba(248,81,73,0.22); }
    .mf-invest-btn mat-icon, .mf-redeem-btn mat-icon { font-size: 16px; }

    /* ── MF Trade Panel ──────────────────────────────────────────────────── */
    .mf-trade-panel {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); margin-bottom: 16px; overflow: hidden;
      animation: mfFadeUp 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes mfFadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .mf-tp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--tf-border);
    }
    .mf-tp-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 600; color: var(--tf-text-primary);
    }
    .mf-tp-title mat-icon { font-size: 18px; }
    .mf-tp-close {
      background: none; border: none; cursor: pointer; color: var(--tf-text-muted);
      display: flex; align-items: center; padding: 4px;
    }
    .mf-tp-close mat-icon { font-size: 18px; }
    .mf-tp-chips { display: flex; gap: 12px; padding: 16px; flex-wrap: wrap; }
    .mf-tp-chip {
      flex: 1; min-width: 140px; display: flex; flex-direction: column; align-items: flex-start;
      gap: 4px; padding: 14px 16px; border-radius: var(--tf-radius-md);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      cursor: pointer; text-align: left; transition: border-color 0.18s, background 0.18s, transform 0.18s;
    }
    .mf-tp-chip:hover { border-color: var(--tf-cyan); background: rgba(79,172,254,0.06); transform: translateY(-2px); }
    .mf-tp-chip mat-icon { font-size: 22px; color: var(--tf-cyan); }
    .mf-tpc-label { font-size: 14px; font-weight: 700; color: var(--tf-text-primary); }
    .mf-tpc-desc { font-size: 11px; color: var(--tf-text-muted); margin: 0; line-height: 1.4; }
    .mf-tp-form { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .mf-tp-field { display: flex; flex-direction: column; gap: 6px; }
    .mf-tp-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .mf-tp-input {
      padding: 8px 12px; border-radius: var(--tf-radius-sm);
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); font-size: 15px; font-weight: 600; width: 220px;
    }
    .mf-tp-input:focus { outline: none; border-color: var(--tf-cyan); }
    .mf-tp-freq-val { font-size: 13px; color: var(--tf-text-secondary); }
    .mf-tp-summary {
      font-size: 12px; color: var(--tf-text-secondary);
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 10px 12px;
    }
    .mf-tp-footer { display: flex; gap: 8px; align-items: center; }
    .mf-tp-back-btn {
      background: none; border: 1px solid var(--tf-border); border-radius: var(--tf-radius-sm);
      padding: 8px 16px; font-size: 13px; color: var(--tf-text-secondary);
      cursor: pointer; transition: all 0.15s;
    }
    .mf-tp-back-btn:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .mf-tp-confirm-btn {
      background: var(--tf-cyan); color: #000; border: none;
      border-radius: var(--tf-radius-sm); padding: 8px 20px;
      font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s;
    }
    .mf-tp-confirm-btn:hover { opacity: 0.88; }
    .text-green { color: var(--tf-green); }
    .text-red   { color: var(--tf-red); }
    .text-cyan  { color: var(--tf-cyan); }

    /* ── Shareholding Pattern ────────────────────────────────────────── */
    .sh-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 20px;
    }
    .sh-subtitle {
      font-size: 11px; color: var(--tf-text-muted);
      margin: -10px 0 16px; letter-spacing: 0.02em;
    }

    /* Year selector pill tabs */
    .sh-year-tabs {
      display: flex; gap: 3px; margin-bottom: 16px;
      background: var(--tf-bg-elevated);
      border-radius: var(--tf-radius-sm); padding: 3px;
    }
    .sh-year-tab {
      flex: 1; padding: 5px 4px; border: none; background: transparent;
      color: var(--tf-text-secondary); font-size: 12px; font-weight: 500;
      border-radius: 4px; cursor: pointer; transition: all 0.15s;
    }
    .sh-year-tab:hover:not(.sh-year-tab--active) { color: var(--tf-text-primary); }
    .sh-year-tab--active {
      background: var(--tf-bg-surface); color: var(--tf-cyan); font-weight: 700;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }

    /* Stacked bar: clip-path animates left-to-right on first load; segments transition on year change */
    .sh-bar-wrap { border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .sh-bar {
      display: flex; height: 14px; gap: 3px;
      animation: shReveal 0.7s cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    @keyframes shReveal {
      from { clip-path: inset(0 100% 0 0 round 8px); }
      to   { clip-path: inset(0 0%   0 0 round 8px); }
    }
    .sh-seg {
      flex-shrink: 0; border-radius: 3px; min-width: 4px;
      transition: flex-basis 0.4s ease, opacity 0.15s, transform 0.15s;
    }
    .sh-seg:hover { opacity: 0.75; transform: scaleY(1.3); }

    /* 2×2 card grid */
    .sh-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .sh-item {
      background: var(--tf-bg-elevated);
      border: 1px solid var(--tf-border);
      border-left: 3px solid;          /* color injected via [style.border-left-color] */
      border-radius: var(--tf-radius-sm);
      padding: 12px 14px;
      display: flex; flex-direction: column; gap: 7px;
      transition: background 0.15s;
    }
    .sh-item:hover { background: var(--tf-bg-surface); }
    .sh-item-top { display: flex; justify-content: space-between; align-items: center; }
    .sh-dot-label { display: flex; align-items: center; gap: 6px; }
    .sh-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .sh-label { font-size: 12px; color: var(--tf-text-secondary); font-weight: 500; }
    .sh-chg { font-size: 11px; font-weight: 700; }
    .sh-chg--up { color: var(--tf-green); }
    .sh-chg--dn { color: var(--tf-red); }
    .sh-pct { font-size: 24px; font-weight: 700; color: var(--tf-text-primary); line-height: 1; }
    .sh-mini-bar-wrap { height: 3px; background: var(--tf-border); border-radius: 2px; }
    .sh-mini-bar { height: 100%; border-radius: 2px; max-width: 100%; transition: width 0.5s ease; }

    .sh-footer {
      margin-top: 14px; padding-top: 12px;
      border-top: 1px solid var(--tf-border);
      font-size: 11px; color: var(--tf-text-muted); text-align: right;
    }

    /* ── Mobile responsive ───────────────────────────────────────────── */
    @media (max-width: 768px) {
      /* Stack title above controls */
      .page-header { flex-direction: column; align-items: stretch; gap: 10px; }
      .header-left { width: 100%; }

      /* 2-row grid: search full-width on top, sort + filter aligned below */
      .header-controls {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto;
        gap: 8px;
        width: 100%;
        flex-wrap: unset;
      }
      .search-field {
        grid-column: 1 / -1;
        width: 100% !important;
        transition: none;
      }
      .search-field:focus-within { width: 100% !important; filter: none; }
      .sort-field {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
      }
      /* Hide subscript wrapper so sort-field height matches the button */
      .sort-field ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
      .filter-toggle-btn {
        grid-column: 2;
        grid-row: 2;
        align-self: stretch;
        white-space: nowrap;
      }

      /* Filter panel: single column */
      .filter-panel { padding: 12px 14px; }

      /* Shareholding: full-width single column on narrow screens */
      .sh-legend { grid-template-columns: 1fr 1fr; }
      .sh-pct { font-size: 20px; }
    }

    @media (max-width: 480px) {
      .sh-legend { grid-template-columns: 1fr; }
    }
  `]
})
export class MutualFundsComponent implements OnInit {

  private readonly svc   = inject(MarketService);
  private readonly route = inject(ActivatedRoute);

  // WHY showTrade? Dashboard source → show Invest/Redeem; Screener source → read-only.
  readonly showTrade = signal(false);
  readonly showManagerInfo = signal(false);
  // Trade action + mode for MF
  readonly tradeMF     = signal<'invest' | 'redeem' | null>(null);
  readonly tradeMFMode = signal<'onetime' | 'sip' | 'swp' | 'stp' | null>(null);
  readonly mfSipAmt    = new FormControl<number | null>(null);

  readonly loading = signal(true);
  readonly navLoading = signal(false);

  private readonly allFunds = signal<MutualFund[]>([]);
  readonly selectedFund = signal<MutualFund | null>(null);
  readonly activeCategory = signal('');
  readonly searchQuery = signal('');
  readonly navCandles = signal<CandleBar[]>([]);
  readonly navPeriod = signal<ChartPeriod>('1Y');
  readonly sipAmount = signal(1000);

  readonly searchCtrl = new FormControl('', { nonNullable: true });
  readonly sortCtrl   = new FormControl<string>('returns1Y', { nonNullable: true });
  readonly activeSort = signal<string>('returns1Y');

  readonly activeRisk    = signal<RiskFilter>('');
  readonly activeExpense = signal<ExpenseFilter>('');
  readonly activeAum     = signal<AumFilter>('');
  readonly activeReturn  = signal<ReturnFilter>('');
  readonly showFilters   = signal(false);

  readonly activeFilterCount = computed(() =>
    ([this.activeRisk(), this.activeExpense(), this.activeAum(), this.activeReturn()] as string[])
      .filter(v => v !== '').length
  );

  readonly riskOptions: { value: RiskFilter; label: string }[] = [
    { value: '',               label: 'Any'         },
    { value: 'LOW',            label: 'Low'         },
    { value: 'MODERATE',       label: 'Moderate'    },
    { value: 'MODERATELY_HIGH',label: 'Mod-High'    },
    { value: 'HIGH',           label: 'High'        },
    { value: 'VERY_HIGH',      label: 'Very High'   },
  ];
  readonly expenseOptions: { value: ExpenseFilter; label: string }[] = [
    { value: '',      label: 'Any'    },
    { value: 'lt0_5', label: '< 0.5%' },
    { value: 'lt1',   label: '< 1%'   },
    { value: 'lt1_5', label: '< 1.5%' },
  ];
  readonly aumOptions: { value: AumFilter; label: string }[] = [
    { value: '',       label: 'Any'       },
    { value: 'gt50k',  label: '> ₹50K Cr' },
    { value: 'gt10k',  label: '> ₹10K Cr' },
    { value: 'lt10k',  label: '< ₹10K Cr' },
  ];
  readonly returnOptions: { value: ReturnFilter; label: string }[] = [
    { value: '',      label: 'Any'   },
    { value: 'gt15',  label: '> 15%' },
    { value: 'gt20',  label: '> 20%' },
    { value: 'gt25',  label: '> 25%' },
  ];

  readonly activeFilterLabels = computed(() => {
    const result: { key: string; label: string }[] = [];
    const ri = this.activeRisk();
    if (ri) result.push({ key: 'risk',    label: this.riskOptions.find(o => o.value === ri)?.label    ?? ri });
    const ex = this.activeExpense();
    if (ex) result.push({ key: 'expense', label: this.expenseOptions.find(o => o.value === ex)?.label ?? ex });
    const au = this.activeAum();
    if (au) result.push({ key: 'aum',     label: this.aumOptions.find(o => o.value === au)?.label     ?? au });
    const re = this.activeReturn();
    if (re) result.push({ key: 'return',  label: this.returnOptions.find(o => o.value === re)?.label  ?? re });
    return result;
  });

  // Track which card was clicked for animation
  clickedFund: string | null = null;

  readonly categoryOptions = [
    { label: 'All', value: '' },
    { label: 'Equity', value: 'EQUITY' },
    { label: 'Index', value: 'INDEX' },
    { label: 'Hybrid', value: 'HYBRID' },
    { label: 'Debt', value: 'DEBT' },
    { label: 'ELSS (Tax Saving)', value: 'ELSS' },
  ];

  // WHY computed for filtered? Client-side filtering avoids API calls on every keystroke.
  readonly filtered = computed(() => {
    const q       = this.searchQuery().toLowerCase();
    const cat     = this.activeCategory();
    const sort    = this.activeSort();
    const risk    = this.activeRisk();
    const expense = this.activeExpense();
    const aum     = this.activeAum();
    const ret     = this.activeReturn();
    let list = this.allFunds();

    if (q)   list = list.filter(f =>
      f.name.toLowerCase().includes(q) || f.amcName.toLowerCase().includes(q));
    if (cat) list = list.filter(f => f.category === cat);

    // Risk level
    if (risk) list = list.filter(f => f.riskLevel === risk);

    // Expense ratio presets
    if (expense === 'lt0_5') list = list.filter(f => f.expenseRatio < 0.5);
    if (expense === 'lt1')   list = list.filter(f => f.expenseRatio < 1);
    if (expense === 'lt1_5') list = list.filter(f => f.expenseRatio < 1.5);

    // AUM presets (aumCrore in crores)
    if (aum === 'gt50k') list = list.filter(f => f.aumCrore >= 50000);
    if (aum === 'gt10k') list = list.filter(f => f.aumCrore >= 10000);
    if (aum === 'lt10k') list = list.filter(f => f.aumCrore < 10000);

    // 1Y returns presets
    if (ret === 'gt15') list = list.filter(f => f.returns1Y > 15);
    if (ret === 'gt20') list = list.filter(f => f.returns1Y > 20);
    if (ret === 'gt25') list = list.filter(f => f.returns1Y > 25);

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'returns1Y':  return b.returns1Y - a.returns1Y;
        case 'returns3Y':  return b.returns3Y - a.returns3Y;
        case 'returns5Y':  return b.returns5Y - a.returns5Y;
        case 'aum':        return b.aumCrore - a.aumCrore;
        case 'nav':        return b.nav - a.nav;
        case 'expense':    return a.expenseRatio - b.expenseRatio;
        default:           return b.returns1Y - a.returns1Y;
      }
    });
  });

  // WHY grouped by category? UI organizes funds into sections so users can
  // quickly jump to the fund type they want without scrolling through a flat list.
  readonly fundsByCategory = computed(() => {
    const grouped: Record<string, MutualFund[]> = {};
    for (const fund of this.filtered()) {
      if (!grouped[fund.category]) grouped[fund.category] = [];
      grouped[fund.category].push(fund);
    }
    return grouped;
  });

  // Preserve display order of categories
  readonly visibleCategories = computed(() =>
    CATEGORY_ORDER.filter(cat => this.fundsByCategory()[cat]?.length > 0));

  // SIP breakdown: each holding gets sipAmount * (percentage / 100) rupees
  readonly sipBreakdown = computed(() => {
    const fund = this.selectedFund();
    if (!fund) return [];
    return fund.topHoldings.map(h => ({
      ...h,
      amount: this.sipAmount() * (h.percentage / 100)
    }));
  });

  readonly othersPercent = computed(() => {
    const totalTopPct = this.sipBreakdown().reduce((sum, h) => sum + h.percentage, 0);
    return Math.max(0, 100 - totalTopPct);
  });

  readonly othersAmount = computed(() =>
    this.sipAmount() * (this.othersPercent() / 100));

  constructor() {
    this.searchCtrl.valueChanges.pipe(
      debounceTime(200), distinctUntilChanged(), takeUntilDestroyed()
    ).subscribe(v => this.searchQuery.set(v));

    this.sortCtrl.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(v => this.activeSort.set(v));
  }

  ngOnInit(): void {
    // WHY queryParams? Source-aware routing — dashboard navigation shows trade buttons.
    // WHY fundId param? Dashboard MF holding cards pass fundId so we auto-open that fund's detail.
    this.route.queryParams.subscribe(params => {
      this.showTrade.set(params['source'] === 'dashboard');
      const fundId = params['fundId'];
      if (fundId) {
        // Wait for funds to load then auto-select the matching fund
        this.svc.getMutualFunds().subscribe({
          next: funds => {
            this.allFunds.set(funds);
            this.loading.set(false);
            const match = funds.find(f => f.id === fundId);
            if (match) this.selectFund(match);
          },
          error: () => this.loading.set(false),
        });
      } else {
        this.svc.getMutualFunds().subscribe({
          next: funds => { this.allFunds.set(funds); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      }
    });
  }

  setCategory(v: string): void { this.activeCategory.set(v); }

  resetFilters(): void {
    this.searchCtrl.setValue('');
    this.activeCategory.set('');
    this.clearFilters();
  }

  clearFilters(): void {
    this.activeRisk.set('');
    this.activeExpense.set('');
    this.activeAum.set('');
    this.activeReturn.set('');
  }

  removeMFFilter(key: string): void {
    if (key === 'risk')    this.activeRisk.set('');
    if (key === 'expense') this.activeExpense.set('');
    if (key === 'aum')     this.activeAum.set('');
    if (key === 'return')  this.activeReturn.set('');
  }

  selectFund(fund: MutualFund): void {
    // WHY brief timeout for animation? Lets the CSS scale-down finish before navigating away.
    this.clickedFund = fund.id;
    setTimeout(() => {
      this.clickedFund = null;
      this.selectedFund.set(fund);
      this.navCandles.set([]);
      this.shActiveYear.set(0);      // reset to latest year on each fund open
      this.showManagerInfo.set(false); // collapse manager card on fund switch
      this.loadNavHistory(fund.id, this.navPeriod());
    }, 150);
  }

  clearSelection(): void {
    this.selectedFund.set(null);
    this.navCandles.set([]);
    this.showManagerInfo.set(false);
  }

  onNavPeriodChange(period: ChartPeriod): void {
    this.navPeriod.set(period);
    const fund = this.selectedFund();
    if (fund) this.loadNavHistory(fund.id, period);
  }

  onSipInput(event: Event): void {
    const v = +(event.target as HTMLInputElement).value;
    if (v >= 100) this.sipAmount.set(v);
  }

  getRiskColor(risk: string): string {
    return RISK_COLORS[risk] ?? '#8b949e';
  }

  getReturnRows(fund: MutualFund): { label: string; fund: number; bench: number }[] {
    return [
      { label: '1Y', fund: fund.returns1Y, bench: fund.benchmarkReturn },
      { label: '3Y', fund: fund.returns3Y, bench: fund.benchmarkReturn * 0.92 },
      { label: '5Y', fund: fund.returns5Y, bench: fund.benchmarkReturn * 0.88 },
    ];
  }

  // WHY max-of-two for bar width? We want bars proportional to each other.
  // The larger value fills 100%, the smaller is scaled proportionally.
  getBarWidth(val: number, other: number): number {
    const max = Math.max(Math.abs(val), Math.abs(other), 1);
    return Math.min(100, (Math.abs(val) / max) * 100);
  }

  /**
   * WHY getManagerInfo?
   * Generates deterministic mock biography for a fund manager seeded from their name.
   * Covers experience, AUM under management, funds managed, education, and prior firm —
   * the key data points investors check before choosing a fund.
   */
  getManagerInfo(name: string): {
    experience: number; aum: string; funds: number; since: number;
    education: string; prevFirm: string;
  } {
    const seed = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rnd = (offset: number, range: number) => {
      const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
      return Math.floor((x - Math.floor(x)) * range);
    };
    const experience = 8 + rnd(1, 16);
    const aumCr      = 20000 + rnd(2, 80000);
    const educations = [
      'MBA (IIM-A) + CFA', 'MBA (IIM-C) + CFA', 'MBA (XLRI) + CFA',
      'CA + CFA + FRM', 'B.Tech + MBA (IIM-B)', 'MBA (ISB) + CFA',
    ];
    const prevFirms = [
      'HDFC AMC', 'Franklin Templeton', 'Mirae Asset',
      'Axis AMC', 'SBI Mutual Fund', 'Nippon India MF', 'DSP Investment Managers',
    ];
    return {
      experience,
      aum: aumCr >= 100000
        ? `₹${(aumCr / 100000).toFixed(1)}L Cr`
        : `₹${Math.round(aumCr / 1000)}K Cr`,
      funds:    2 + rnd(3, 6),
      since:    2025 - experience,
      education: educations[rnd(4, educations.length)],
      prevFirm:  prevFirms[rnd(5, prevFirms.length)],
    };
  }

  // WHY shActiveYear? Tracks the selected year offset in the 5-year trend view.
  // 0 = most recent (FY2025), 4 = oldest (FY2021).
  readonly shActiveYear = signal(0);
  readonly shYears = [
    { label: 'FY25', offset: 0 },
    { label: 'FY24', offset: 1 },
    { label: 'FY23', offset: 2 },
    { label: 'FY22', offset: 3 },
    { label: 'FY21', offset: 4 },
  ] as const;

  /**
   * WHY getShareholderData?
   * Returns deterministic mock shareholding for a fund at a given year offset.
   * yearOffset 0 = FY2025, 1 = FY2024, … 4 = FY2021.
   * `chg` = change vs the previous year (yearOffset + 1).
   * Seeds from fund.id + yearOffset so each year has stable unique values
   * that don't flicker on re-render.
   */
  getShareholderData(
    fund: MutualFund,
    yearOffset: number
  ): { label: string; pct: number; chg: number; color: string }[] {
    const current = this.computeShBase(fund, yearOffset);
    const prev    = this.computeShBase(fund, yearOffset + 1);
    return current.map((s, i) => ({ ...s, chg: +(s.pct - prev[i].pct).toFixed(2) }));
  }

  /**
   * WHY computeShBase (private)?
   * Pure deterministic computation — returns raw percentages for a given year offset.
   * Separated from getShareholderData so chg can be derived by comparing two years
   * without recursive calls or caching complexity.
   */
  private computeShBase(fund: MutualFund, yearOffset: number): { label: string; pct: number; color: string }[] {
    const seed = fund.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    // WHY Math.sin seeded hash? Gives deterministic floats in [0,1) from integer inputs.
    const rnd = (offset: number, range: number): number => {
      const x = Math.sin((seed + yearOffset * 1000) * 9301 + offset * 49297 + 233) * 10000;
      return (x - Math.floor(x)) * range;
    };

    // Base distributions tuned per fund category — year drift applied via seed
    let pBase: number, fBase: number, dBase: number;
    switch (fund.category) {
      case 'DEBT':   pBase = 42; fBase = 18; dBase = 22; break;
      case 'INDEX':  pBase = 58; fBase = 19; dBase = 14; break;
      case 'HYBRID': pBase = 50; fBase = 21; dBase = 16; break;
      case 'ELSS':   pBase = 54; fBase = 20; dBase = 15; break;
      default:       pBase = 56; fBase = 22; dBase = 13; break; // EQUITY
    }

    const promoter = Math.max(30, Math.min(72, pBase + rnd(1, 14) - 7));
    const fii      = Math.max(8,  Math.min(32, fBase + rnd(2, 12) - 6));
    const dii      = Math.max(5,  Math.min(25, dBase + rnd(3,  9) - 4.5));
    const pub      = Math.max(3,  100 - promoter - fii - dii);

    return [
      { label: 'Promoter', pct: +promoter.toFixed(2), color: '#3fb950' },
      { label: 'FII',      pct: +fii.toFixed(2),      color: '#58a6ff' },
      { label: 'DII',      pct: +dii.toFixed(2),      color: '#39d0d8' },
      { label: 'Public',   pct: +pub.toFixed(2),       color: '#f0b429' },
    ];
  }

  private loadNavHistory(code: string, period: ChartPeriod): void {
    this.navLoading.set(true);
    this.svc.getMutualFundNav(code, period).subscribe({
      next: candles => { this.navCandles.set(candles); this.navLoading.set(false); },
      error: () => this.navLoading.set(false),
    });
  }
}
