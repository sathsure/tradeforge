// WHY a dedicated OrderFormComponent?
// The buy/sell form is complex enough to be its own component.
// Used from: Stock Detail, Markets quick-order panel, Place Order page.
// Enhanced in Sprint 3: symbol autocomplete, stop-loss, target, validity, exchange.

import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges,
  inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';

import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Store } from '@ngrx/store';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

import { OrderActions } from '../state/order.actions';
import { OrderRequest, TransactionType } from '../../../core/models/order.models';
import { selectPlacing, selectError } from '../state/order.selectors';
import { selectAllQuotes } from '../../markets/state/market.selectors';
import { StockQuote } from '../../markets/state/market.actions';
import { selectAvailableBalance } from '../../portfolio/state/portfolio.selectors';
import { RouterLink } from '@angular/router';

type OrderTypeVal = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
type ValidityVal  = 'DAY' | 'IOC';
type ExchangeVal  = 'NSE' | 'BSE';

@Component({
  selector: 'app-order-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, DecimalPipe, RouterLink,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatButtonToggleModule, MatTooltipModule, MatDividerModule,
  ],
  template: `
    <div class="ofc" [class.ofc-buy]="txnType() === 'BUY'" [class.ofc-sell]="txnType() === 'SELL'">

      <!-- ── Header ────────────────────────────────────────────────────────── -->
      <div class="ofc-header">
        <div class="ofc-symbol-row">
          @if (resolvedQuote()) {
            <div class="ofc-sym-info">
              <span class="ofc-sym">{{ resolvedQuote()!.symbol }}</span>
              <span class="ofc-name">{{ resolvedQuote()!.name }}</span>
            </div>
            <div class="ofc-live-price">
              <span class="ofc-price text-mono">₹{{ resolvedQuote()!.price | number:'1.2-2' }}</span>
              <span class="ofc-chg text-mono"
                    [class.text-green]="resolvedQuote()!.changePercent >= 0"
                    [class.text-red]="resolvedQuote()!.changePercent < 0">
                {{ resolvedQuote()!.changePercent >= 0 ? '+' : '' }}{{ resolvedQuote()!.changePercent | number:'1.2-2' }}%
              </span>
            </div>
          } @else {
            <span class="ofc-sym-placeholder">
              <mat-icon>search</mat-icon> Search a stock to begin
            </span>
          }
        </div>
        @if (showClose) {
          <button class="ofc-close-btn" (click)="onClose.emit()">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      <!-- ── BUY / SELL + Exchange row ─────────────────────────────────────── -->
      <div class="ofc-action-row">
        <div class="ofc-txn-toggle">
          <button class="txn-btn buy-btn" [class.active]="txnType() === 'BUY'"
                  (click)="txnType.set('BUY')">BUY</button>
          <button class="txn-btn sell-btn" [class.active]="txnType() === 'SELL'"
                  (click)="txnType.set('SELL')">SELL</button>
        </div>
        <div class="ofc-exchange">
          <button class="exch-btn" [class.active]="exchange() === 'NSE'"
                  (click)="exchange.set('NSE')">NSE</button>
          <button class="exch-btn" [class.active]="exchange() === 'BSE'"
                  (click)="exchange.set('BSE')">BSE</button>
        </div>
      </div>

      <form [formGroup]="orderForm" (ngSubmit)="onSubmit()" class="ofc-form" autocomplete="off">

        <!-- ── Symbol search with autocomplete ──────────────────────────── -->
        <div class="ofc-field-wrap">
          <label class="ofc-label">Stock Symbol</label>
          <div class="ofc-search-wrap">
            <mat-icon class="ofc-search-icon">search</mat-icon>
            <input class="ofc-search-input"
                   formControlName="symbol"
                   placeholder="Type 3+ letters — e.g. REL, TCS…"
                   autocomplete="off"
                   (input)="onSymbolType()"
                   (blur)="hideDropdown()">
            @if (orderForm.get('symbol')?.value) {
              <button type="button" class="ofc-clear-btn" (click)="clearSymbol()">
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>

          <!-- Suggestions dropdown -->
          @if (showDropdown() && suggestions().length > 0) {
            <div class="ofc-dropdown">
              @for (q of suggestions(); track q.symbol) {
                <button type="button" class="ofc-suggestion"
                        (mousedown)="selectSymbol(q)">
                  <div class="sug-left">
                    <span class="sug-sym">{{ q.symbol }}</span>
                    <span class="sug-name">{{ q.name }}</span>
                  </div>
                  <div class="sug-right">
                    <span class="sug-price text-mono">₹{{ q.price | number:'1.2-2' }}</span>
                    <span class="sug-chg text-mono"
                          [class.text-green]="q.changePercent >= 0"
                          [class.text-red]="q.changePercent < 0">
                      {{ q.changePercent >= 0 ? '+' : '' }}{{ q.changePercent | number:'1.2-2' }}%
                    </span>
                  </div>
                </button>
              }
            </div>
          }
          @if (orderForm.get('symbol')?.touched && orderForm.get('symbol')?.hasError('required')) {
            <span class="ofc-err">Symbol is required</span>
          }
        </div>

        <!-- ── Order Type chips ───────────────────────────────────────────── -->
        <div class="ofc-field-wrap">
          <label class="ofc-label">
            Order Type
            <mat-icon class="ofc-info-icon"
              matTooltip="MARKET: fills instantly at best price. LIMIT: fills at your price or better. SL: triggers at stop price then places limit. SL-M: triggers then fills at market.">
              info_outline
            </mat-icon>
          </label>
          <div class="ofc-type-chips">
            @for (t of orderTypes; track t.value) {
              <button type="button" class="ofc-type-chip"
                      [class.active]="orderType() === t.value"
                      [matTooltip]="t.desc"
                      (click)="setOrderType(t.value)">
                {{ t.label }}
              </button>
            }
          </div>
        </div>

        <!-- ── Quantity + Price row ───────────────────────────────────────── -->
        <div class="ofc-row-2">
          <div class="ofc-field-wrap">
            <label class="ofc-label">Quantity</label>
            <input class="ofc-num-input" type="number" formControlName="quantity"
                   min="1" placeholder="Shares" inputmode="numeric">
            @if (orderForm.get('quantity')?.touched && orderForm.get('quantity')?.invalid) {
              <span class="ofc-err">Min 1 share</span>
            }
          </div>

          @if (needsPrice()) {
            <div class="ofc-field-wrap">
              <label class="ofc-label">Price (₹)</label>
              <input class="ofc-num-input" type="number" formControlName="price"
                     min="0.01" step="0.05" placeholder="Limit price" inputmode="decimal">
            </div>
          }

          @if (needsTrigger()) {
            <div class="ofc-field-wrap">
              <label class="ofc-label">Trigger (₹)
                <mat-icon class="ofc-info-icon"
                  matTooltip="Stop-loss triggers the order when price hits this level.">info_outline</mat-icon>
              </label>
              <input class="ofc-num-input" type="number" formControlName="triggerPrice"
                     min="0.01" step="0.05" placeholder="Trigger price" inputmode="decimal">
            </div>
          }
        </div>

        <!-- ── Risk Management ────────────────────────────────────────────── -->
        <div class="ofc-section">
          <div class="ofc-section-header">
            <mat-icon>shield</mat-icon>
            <span>Risk Management</span>
            <span class="ofc-section-sub">Optional — set stop-loss & target</span>
          </div>
          <div class="ofc-row-2">
            <div class="ofc-field-wrap">
              <label class="ofc-label">Stop Loss (₹)
                <mat-icon class="ofc-info-icon"
                  matTooltip="Auto-exit to limit your loss if price falls to this level.">info_outline</mat-icon>
              </label>
              <input class="ofc-num-input ofc-sl" type="number" formControlName="stopLoss"
                     min="0.01" step="0.05" placeholder="e.g. {{ slPlaceholder() }}" inputmode="decimal">
            </div>
            <div class="ofc-field-wrap">
              <label class="ofc-label">Target (₹)
                <mat-icon class="ofc-info-icon"
                  matTooltip="Auto-exit to book profit when price reaches this level.">info_outline</mat-icon>
              </label>
              <input class="ofc-num-input ofc-tgt" type="number" formControlName="target"
                     min="0.01" step="0.05" placeholder="e.g. {{ tgtPlaceholder() }}" inputmode="decimal">
            </div>
          </div>
          <!-- Risk/reward preview -->
          @if (riskRewardLabel()) {
            <div class="ofc-rr">
              <span class="ofc-rr-label">Risk : Reward</span>
              <span class="ofc-rr-val" [class.text-green]="riskRewardRatio() >= 2">
                1 : {{ riskRewardRatio() | number:'1.1-1' }}
              </span>
              @if (riskRewardRatio() >= 2) {
                <span class="ofc-rr-good">Good setup</span>
              }
            </div>
          }
        </div>

        <!-- ── Validity ───────────────────────────────────────────────────── -->
        <div class="ofc-field-wrap">
          <label class="ofc-label">Validity
            <mat-icon class="ofc-info-icon"
              matTooltip="DAY: order expires at market close. IOC: fill immediately or cancel.">info_outline</mat-icon>
          </label>
          <div class="ofc-validity-chips">
            <button type="button" class="ofc-val-chip" [class.active]="validity() === 'DAY'"
                    (click)="validity.set('DAY')">DAY</button>
            <button type="button" class="ofc-val-chip" [class.active]="validity() === 'IOC'"
                    (click)="validity.set('IOC')">IOC</button>
          </div>
        </div>

        <!-- ── Order Summary card ─────────────────────────────────────────── -->
        <div class="ofc-summary">
          <div class="ofc-sum-row">
            <span class="ofc-sum-label">Est. Value</span>
            <span class="ofc-sum-val text-mono">
              {{ estimatedValue() > 0 ? '₹' + (estimatedValue() | number:'1.2-2') : '—' }}
            </span>
          </div>
          <div class="ofc-sum-row">
            <span class="ofc-sum-label">Margin Required</span>
            <span class="ofc-sum-val text-mono">
              {{ estimatedValue() > 0 ? '₹' + (estimatedValue() * 0.2 | number:'1.2-2') : '—' }}
            </span>
          </div>
          <div class="ofc-sum-row">
            <span class="ofc-sum-label">Exchange</span>
            <span class="ofc-sum-val">{{ exchange() }} · EQ</span>
          </div>
          <div class="ofc-sum-row">
            <span class="ofc-sum-label">Validity</span>
            <span class="ofc-sum-val">{{ validity() }}</span>
          </div>
          @if (orderType() !== 'MARKET' && resolvedQuote()) {
            <div class="ofc-sum-row">
              <span class="ofc-sum-label">LTP</span>
              <span class="ofc-sum-val text-mono text-cyan">
                ₹{{ resolvedQuote()!.price | number:'1.2-2' }}
              </span>
            </div>
          }
          @if (txnType() === 'BUY') {
            <div class="ofc-sum-row">
              <span class="ofc-sum-label">GST (0.18%)</span>
              <span class="ofc-sum-val text-mono">₹{{ gstAmount() | number:'1.2-2' }}</span>
            </div>
            <div class="ofc-sum-row" [class.ofc-sum-row--danger]="insufficientFunds()">
              <span class="ofc-sum-label" style="font-weight:600">Total Cost</span>
              <span class="ofc-sum-val text-mono" [class.text-red]="insufficientFunds()">
                ₹{{ totalCost() | number:'1.2-2' }}
              </span>
            </div>
            <mat-divider style="margin: 8px 0"></mat-divider>
            <div class="ofc-sum-row">
              <span class="ofc-sum-label">Available Cash</span>
              <span class="ofc-sum-val text-mono" [class.text-red]="insufficientFunds()">
                ₹{{ availableBalance() | number:'1.2-2' }}
              </span>
            </div>
            @if (insufficientFunds()) {
              <div class="ofc-insufficient-msg">
                <mat-icon style="font-size:16px;width:16px;height:16px;color:var(--tf-red)">warning</mat-icon>
                <span>Insufficient funds —</span>
                <a routerLink="/add-funds" style="color:var(--tf-cyan)">Add funds</a>
              </div>
            }
          }
        </div>

        <!-- ── Error ──────────────────────────────────────────────────────── -->
        @if (error$ | async; as err) {
          <div class="ofc-error-banner">
            <mat-icon>error_outline</mat-icon> {{ err }}
          </div>
        }

        <!-- ── Submit ─────────────────────────────────────────────────────── -->
        <button type="submit" class="ofc-submit"
                [class.ofc-submit-buy]="txnType() === 'BUY'"
                [class.ofc-submit-sell]="txnType() === 'SELL'"
                [disabled]="orderForm.invalid || (placing$ | async) || insufficientFunds()">
          @if (placing$ | async) {
            <mat-spinner diameter="18"></mat-spinner>
          } @else {
            <mat-icon>{{ txnType() === 'BUY' ? 'add_shopping_cart' : 'remove_shopping_cart' }}</mat-icon>
            {{ txnType() }} {{ orderForm.get('symbol')?.value || 'Order' }}
            @if (orderType() !== 'MARKET') { · {{ orderType() }} }
          }
        </button>
      </form>
    </div>
  `,
  styles: [`
    /* ── Container ───────────────────────────────────────────────────────────── */
    .ofc {
      background: var(--tf-bg-surface);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-lg);
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .ofc-buy  { border-top: 3px solid var(--tf-green); }
    .ofc-sell { border-top: 3px solid var(--tf-red); }

    /* ── Header ──────────────────────────────────────────────────────────────── */
    .ofc-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 10px; border-bottom: 1px solid var(--tf-border);
      background: rgba(255,255,255,0.015);
    }
    .ofc-symbol-row { display: flex; align-items: center; justify-content: space-between; flex: 1; }
    .ofc-sym-info { display: flex; flex-direction: column; gap: 1px; }
    .ofc-sym { font-size: 20px; font-weight: 800; color: var(--tf-text-primary); letter-spacing: 0.02em; }
    .ofc-name { font-size: 11px; color: var(--tf-text-muted); }
    .ofc-live-price { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .ofc-price { font-size: 18px; font-weight: 700; color: var(--tf-text-primary); }
    .ofc-chg { font-size: 11px; font-weight: 600; }
    .ofc-sym-placeholder {
      display: flex; align-items: center; gap: 6px;
      color: var(--tf-text-muted); font-size: 13px;
    }
    .ofc-sym-placeholder mat-icon { font-size: 18px; }
    .ofc-close-btn {
      background: none; border: none; cursor: pointer;
      color: var(--tf-text-muted); padding: 4px; border-radius: 4px;
      display: flex; align-items: center; transition: color 0.15s;
      margin-left: 8px;
    }
    .ofc-close-btn:hover { color: var(--tf-text-primary); }

    /* ── BUY/SELL + Exchange row ──────────────────────────────────────────────── */
    .ofc-action-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px; border-bottom: 1px solid var(--tf-border);
    }
    .ofc-txn-toggle { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid var(--tf-border); }
    .txn-btn {
      padding: 7px 28px; font-size: 13px; font-weight: 800; border: none;
      background: var(--tf-bg-elevated); color: var(--tf-text-muted);
      cursor: pointer; transition: all 0.15s; letter-spacing: 0.06em;
    }
    .txn-btn:first-child { border-right: 1px solid var(--tf-border); }
    .buy-btn.active  { background: var(--tf-green); color: #000; }
    .sell-btn.active { background: var(--tf-red);   color: #fff; }
    .ofc-exchange { display: flex; gap: 4px; }
    .exch-btn {
      padding: 5px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
      border: 1px solid var(--tf-border); border-radius: 6px;
      background: var(--tf-bg-elevated); color: var(--tf-text-muted); cursor: pointer; transition: all 0.15s;
    }
    .exch-btn.active { background: rgba(79,172,254,0.15); color: var(--tf-cyan); border-color: var(--tf-cyan); }

    /* ── Form ────────────────────────────────────────────────────────────────── */
    .ofc-form { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .ofc-field-wrap { display: flex; flex-direction: column; gap: 5px; position: relative; }
    .ofc-label {
      font-size: 10px; font-weight: 700; color: var(--tf-text-muted);
      text-transform: uppercase; letter-spacing: 0.07em;
      display: flex; align-items: center; gap: 4px;
    }
    .ofc-info-icon { font-size: 13px !important; width: 13px; height: 13px; cursor: help; }
    .ofc-err { font-size: 10px; color: var(--tf-red); }

    /* Symbol search */
    .ofc-search-wrap {
      display: flex; align-items: center;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 0 10px; gap: 8px;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .ofc-search-wrap:focus-within {
      border-color: var(--tf-cyan); box-shadow: 0 0 0 2px rgba(57,208,216,0.15);
    }
    .ofc-search-icon { font-size: 16px; color: var(--tf-text-muted); flex-shrink: 0; }
    .ofc-search-input {
      flex: 1; background: none; border: none; outline: none;
      color: var(--tf-text-primary); font-size: 14px; font-weight: 600;
      padding: 10px 0; font-family: inherit;
    }
    .ofc-search-input::placeholder { color: var(--tf-text-muted); font-weight: 400; font-size: 13px; }
    .ofc-clear-btn {
      background: none; border: none; cursor: pointer; color: var(--tf-text-muted);
      display: flex; align-items: center; padding: 2px; border-radius: 50%; transition: color 0.15s;
    }
    .ofc-clear-btn:hover { color: var(--tf-text-primary); }
    .ofc-clear-btn mat-icon { font-size: 16px; }

    /* Suggestions dropdown */
    .ofc-dropdown {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); box-shadow: var(--tf-shadow-md);
      max-height: 260px; overflow-y: auto; margin-top: 3px;
    }
    .ofc-suggestion {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border: none; background: none; cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.04); text-align: left;
      transition: background 0.12s;
    }
    .ofc-suggestion:last-child { border-bottom: none; }
    .ofc-suggestion:hover { background: rgba(57,208,216,0.07); }
    .sug-left { display: flex; flex-direction: column; gap: 2px; }
    .sug-sym { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); }
    .sug-name { font-size: 11px; color: var(--tf-text-muted); }
    .sug-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .sug-price { font-size: 13px; font-weight: 600; color: var(--tf-text-primary); }
    .sug-chg { font-size: 10px; font-weight: 600; }

    /* Order type chips */
    .ofc-type-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .ofc-type-chip {
      padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .ofc-type-chip.active {
      background: rgba(57,208,216,0.14); color: var(--tf-cyan); border-color: var(--tf-cyan);
    }

    /* Numeric inputs */
    .ofc-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ofc-num-input {
      padding: 9px 12px; border-radius: var(--tf-radius-sm); font-size: 14px; font-weight: 600;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); width: 100%; font-family: 'JetBrains Mono', monospace;
      transition: border-color 0.18s;
    }
    .ofc-num-input:focus { outline: none; border-color: var(--tf-cyan); }
    .ofc-num-input::placeholder { font-family: 'Inter', sans-serif; font-weight: 400; color: var(--tf-text-muted); font-size: 12px; }
    .ofc-sl:focus { border-color: var(--tf-red) !important; }
    .ofc-tgt:focus { border-color: var(--tf-green) !important; }

    /* Risk Management section */
    .ofc-section {
      background: rgba(255,255,255,0.012); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
    }
    .ofc-section-header {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: var(--tf-text-secondary);
    }
    .ofc-section-header mat-icon { font-size: 15px; color: var(--tf-yellow); }
    .ofc-section-sub { font-size: 10px; color: var(--tf-text-muted); font-weight: 400; margin-left: 4px; }

    /* Risk/reward */
    .ofc-rr {
      display: flex; align-items: center; gap: 8px; padding: 6px 0;
      font-size: 12px; border-top: 1px solid var(--tf-border); margin-top: 2px;
    }
    .ofc-rr-label { color: var(--tf-text-muted); }
    .ofc-rr-val { font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .ofc-rr-good {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
      background: rgba(63,185,80,0.15); color: var(--tf-green);
    }

    /* Validity chips */
    .ofc-validity-chips { display: flex; gap: 6px; }
    .ofc-val-chip {
      padding: 5px 16px; border-radius: 6px; font-size: 12px; font-weight: 700;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .ofc-val-chip.active { background: rgba(57,208,216,0.12); color: var(--tf-cyan); border-color: var(--tf-cyan); }

    /* Order summary */
    .ofc-summary {
      background: var(--tf-bg-elevated); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm); padding: 10px 14px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .ofc-sum-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
    .ofc-sum-label { color: var(--tf-text-muted); }
    .ofc-sum-val { font-weight: 600; color: var(--tf-text-primary); }
    .text-cyan { color: var(--tf-cyan); }

    /* Insufficient funds */
    .ofc-sum-row--danger { background: rgba(248, 81, 73, 0.05); border-radius: 4px; }
    .ofc-insufficient-msg {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--tf-text-secondary);
      margin-top: 8px; padding: 6px 8px;
      background: rgba(248, 81, 73, 0.08);
      border-radius: 6px; border-left: 3px solid var(--tf-red);
    }

    /* Error */
    .ofc-error-banner {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      background: rgba(248,81,73,0.12); border: 1px solid var(--tf-red);
      border-radius: var(--tf-radius-sm); color: var(--tf-red); font-size: 13px;
    }

    /* Submit */
    .ofc-submit {
      width: 100%; height: 48px; border: none; border-radius: var(--tf-radius-md);
      font-size: 15px; font-weight: 800; letter-spacing: 0.04em; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: opacity 0.2s, transform 0.15s;
    }
    .ofc-submit:hover:not([disabled]) { opacity: 0.9; transform: translateY(-1px); }
    .ofc-submit:active:not([disabled]) { transform: translateY(0); }
    .ofc-submit[disabled] { opacity: 0.45; cursor: not-allowed; }
    .ofc-submit-buy  { background: var(--tf-green); color: #000; }
    .ofc-submit-sell { background: var(--tf-red);   color: #fff; }
    mat-spinner { margin: auto; }
  `]
})
export class OrderFormComponent implements OnInit, OnChanges {

  private readonly fb    = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly cdr   = inject(ChangeDetectorRef);

  @Input() symbol       = '';
  @Input() currentPrice: number | null = null;
  @Input() defaultType: TransactionType = 'BUY';
  @Input() showClose    = true;
  @Output() onClose       = new EventEmitter<void>();
  @Output() onOrderPlaced = new EventEmitter<void>();

  readonly placing$ = this.store.select(selectPlacing);
  readonly error$   = this.store.select(selectError);

  // WHY toSignal not used here? We need raw quotes Record for lookup — a signal of the full map is fine.
  private allQuotesMap: Record<string, StockQuote> = {};

  readonly txnType    = signal<TransactionType>('BUY');
  readonly exchange   = signal<ExchangeVal>('NSE');
  readonly orderType  = signal<OrderTypeVal>('MARKET');
  readonly validity   = signal<ValidityVal>('DAY');
  readonly showDropdown = signal(false);
  readonly suggestions  = signal<StockQuote[]>([]);
  readonly resolvedQuote = signal<StockQuote | null>(null);

  readonly orderTypes: { value: OrderTypeVal; label: string; desc: string }[] = [
    { value: 'MARKET', label: 'MARKET', desc: 'Fill instantly at the best available price' },
    { value: 'LIMIT',  label: 'LIMIT',  desc: 'Fill only at your specified price or better' },
    { value: 'SL',     label: 'SL',     desc: 'Stop-loss with a limit price after trigger' },
    { value: 'SL-M',   label: 'SL-M',   desc: 'Stop-loss that fills at market after trigger' },
  ];

  readonly needsPrice   = computed(() => this.orderType() === 'LIMIT' || this.orderType() === 'SL');
  readonly needsTrigger = computed(() => this.orderType() === 'SL' || this.orderType() === 'SL-M');

  readonly estimatedValue = computed(() => {
    const qty   = this.orderForm?.get('quantity')?.value || 0;
    const price = this.needsPrice()
      ? (this.orderForm?.get('price')?.value || 0)
      : (this.resolvedQuote()?.price || this.currentPrice || 0);
    return qty * price;
  });

  // WHY toSignal for availableBalance? Avoids async pipe in template; works cleanly
  // with computed() signals for gstAmount, totalCost, and insufficientFunds.
  readonly availableBalance = toSignal(this.store.select(selectAvailableBalance), { initialValue: 0 });
  // WHY 0.18%? NSE charges 0.18% GST on brokerage. This is a simplified flat display.
  readonly gstAmount = computed(() => this.estimatedValue() * 0.0018);
  readonly totalCost = computed(() => this.estimatedValue() + this.gstAmount());
  // WHY only BUY? Selling doesn't require cash — you receive cash.
  // WHY availableBalance > 0 check? Don't show error for new users with no balance yet
  // (zero balance before first deposit should not block them with a red error).
  readonly insufficientFunds = computed(() =>
    this.txnType() === 'BUY' &&
    this.totalCost() > 0 &&
    this.availableBalance() > 0 &&
    this.totalCost() > this.availableBalance()
  );

  readonly slPlaceholder = computed(() => {
    const p = this.resolvedQuote()?.price || this.currentPrice || 0;
    return p > 0 ? (p * 0.97).toFixed(2) : '—';
  });
  readonly tgtPlaceholder = computed(() => {
    const p = this.resolvedQuote()?.price || this.currentPrice || 0;
    return p > 0 ? (p * 1.05).toFixed(2) : '—';
  });

  readonly riskRewardRatio = computed(() => {
    const price = this.resolvedQuote()?.price || this.currentPrice || 0;
    const sl  = this.orderForm?.get('stopLoss')?.value || 0;
    const tgt = this.orderForm?.get('target')?.value   || 0;
    if (!sl || !tgt || !price) return 0;
    const risk   = Math.abs(price - sl);
    const reward = Math.abs(tgt - price);
    return risk > 0 ? reward / risk : 0;
  });
  readonly riskRewardLabel = computed(() => this.riskRewardRatio() > 0);

  orderForm!: FormGroup;

  constructor() {
    // Subscribe to all market quotes for autocomplete
    this.store.select(selectAllQuotes)
      .pipe(takeUntilDestroyed())
      .subscribe(q => { this.allQuotesMap = q; });
  }

  ngOnInit(): void {
    this.txnType.set(this.defaultType);
    this.orderForm = this.fb.group({
      symbol:       [this.symbol.toUpperCase(), [Validators.required]],
      quantity:     [null, [Validators.required, Validators.min(1)]],
      price:        [this.currentPrice],
      triggerPrice: [null],
      stopLoss:     [null],
      target:       [null],
    });

    // Pre-resolve quote if symbol is pre-filled
    if (this.symbol) this.tryResolveQuote(this.symbol.toUpperCase());
  }

  ngOnChanges(): void {
    if (this.orderForm) {
      this.orderForm.patchValue({
        symbol: this.symbol.toUpperCase(),
        price:  this.currentPrice,
      });
      if (this.symbol) this.tryResolveQuote(this.symbol.toUpperCase());
    }
    this.txnType.set(this.defaultType);
  }

  setOrderType(t: OrderTypeVal): void {
    this.orderType.set(t);
    // Clear price/trigger when switching to MARKET
    if (t === 'MARKET') {
      this.orderForm.patchValue({ price: null, triggerPrice: null });
    }
  }

  onSymbolType(): void {
    const raw = (this.orderForm.get('symbol')?.value ?? '') as string;
    const q   = raw.toUpperCase();
    this.orderForm.get('symbol')?.setValue(q, { emitEvent: false });
    this.resolvedQuote.set(null);

    if (q.length >= 3) {
      const matches = Object.values(this.allQuotesMap)
        .filter(s =>
          s.symbol.startsWith(q) ||
          s.name.toUpperCase().includes(q)
        )
        .slice(0, 8);
      this.suggestions.set(matches);
      this.showDropdown.set(matches.length > 0);
    } else {
      this.suggestions.set([]);
      this.showDropdown.set(false);
    }
    this.cdr.markForCheck();
  }

  selectSymbol(q: StockQuote): void {
    this.orderForm.get('symbol')?.setValue(q.symbol, { emitEvent: false });
    this.resolvedQuote.set(q);
    this.showDropdown.set(false);
    this.orderForm.patchValue({ price: q.price });
    this.cdr.markForCheck();
  }

  clearSymbol(): void {
    this.orderForm.get('symbol')?.setValue('');
    this.resolvedQuote.set(null);
    this.suggestions.set([]);
    this.showDropdown.set(false);
  }

  hideDropdown(): void {
    // Small delay so mousedown on suggestion fires before blur hides it
    setTimeout(() => { this.showDropdown.set(false); this.cdr.markForCheck(); }, 180);
  }

  private tryResolveQuote(symbol: string): void {
    const q = this.allQuotesMap[symbol];
    if (q) this.resolvedQuote.set(q);
  }

  onSubmit(): void {
    if (this.orderForm.invalid) return;
    const v = this.orderForm.value;
    const request: OrderRequest = {
      symbol:          v.symbol,
      orderType:       this.orderType(),
      transactionType: this.txnType(),
      quantity:        v.quantity,
      ...(this.needsPrice() && v.price         ? { price: v.price }               : {}),
      ...(this.needsTrigger() && v.triggerPrice ? { triggerPrice: v.triggerPrice } : {}),
    };
    this.store.dispatch(OrderActions.placeOrder({ request }));
    this.onOrderPlaced.emit();
  }
}
