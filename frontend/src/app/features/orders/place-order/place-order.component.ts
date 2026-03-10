// WHY PlaceOrderComponent?
// Dedicated full-page order entry — reachable from Dashboard "New Order" button.
// Keeps the Orders page (/orders) clean: shows only history + pending, no form.
// This page is purely for placing new orders — distraction-free trading UI.

import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Store } from '@ngrx/store';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { OrderFormComponent } from '../order-form/order-form.component';
import { TransactionType } from '../../../core/models/order.models';
import { OrderActions } from '../state/order.actions';
import { selectRecentOrders } from '../state/order.selectors';

@Component({
  selector: 'app-place-order',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, OrderFormComponent, AsyncPipe, DatePipe, NgClass],
  template: `
    <div class="po-page">

      <!-- Page header -->
      <div class="po-header">
        <div class="po-title-wrap">
          <h1 class="po-title">
            <mat-icon class="po-title-icon">add_shopping_cart</mat-icon>
            Place Order
          </h1>
          <span class="po-subtitle">Fast · Secure · Real-time execution</span>
        </div>
        <button class="po-book-btn" (click)="router.navigate(['/orders'])">
          <mat-icon class="po-book-icon">receipt_long</mat-icon>
          <span>Order Book</span>
          <mat-icon class="po-book-arrow">arrow_forward</mat-icon>
        </button>
      </div>

      <!-- Centred form card -->
      <div class="po-body">
        <app-order-form
          [symbol]="prefillSymbol()"
          [defaultType]="prefillType()"
          [showClose]="false"
          (onOrderPlaced)="onOrderPlaced()">
        </app-order-form>

        <div class="po-sidebar">
          <div class="po-tip-card">
            <mat-icon>lightbulb_outline</mat-icon>
            <div>
              <p class="po-tip-title">Quick Tips</p>
              <ul class="po-tip-list">
                <li>Use <strong>MARKET</strong> for instant fills during trading hours</li>
                <li>Use <strong>LIMIT</strong> to control your entry price</li>
                <li>Set a <strong>Stop Loss</strong> to cap downside automatically</li>
                <li>Set a <strong>Target</strong> to book profit without watching screens</li>
                <li><strong>IOC</strong> cancels any unfilled portion immediately</li>
              </ul>
            </div>
          </div>

          <!-- ── Recent Orders Accordion ──────────────────────────────── -->
          <div class="po-accordion">
            <button class="po-acc-header" (click)="historyOpen.set(!historyOpen())">
              <span class="po-acc-left">
                <mat-icon class="po-acc-icon">history</mat-icon>
                <span class="po-acc-title">Recent Orders</span>
                @if ((recentOrders$ | async)?.length; as count) {
                  <span class="po-acc-badge">{{ count }}</span>
                }
              </span>
              <mat-icon class="po-acc-chevron" [class.open]="historyOpen()">expand_more</mat-icon>
            </button>

            @if (historyOpen()) {
              <div class="po-acc-body">
                @if ((recentOrders$ | async); as orders) {
                  @if (orders.length === 0) {
                    <div class="po-acc-empty">
                      <mat-icon>receipt_long</mat-icon>
                      <span>No orders yet</span>
                    </div>
                  } @else {
                    @for (o of orders; track o.id) {
                      <div class="po-order-row">
                        <span class="po-or-badge" [class.buy]="o.transactionType==='BUY'" [class.sell]="o.transactionType==='SELL'">
                          {{ o.transactionType }}
                        </span>
                        <div class="po-or-mid">
                          <span class="po-or-symbol">{{ o.symbol }}</span>
                          <span class="po-or-meta">{{ o.quantity }} · {{ o.orderType }}</span>
                        </div>
                        <div class="po-or-right">
                          <span class="po-or-status" [ngClass]="'s-'+o.status.toLowerCase()">{{ o.status }}</span>
                          <span class="po-or-time">{{ o.placedAt | date:'HH:mm' }}</span>
                        </div>
                      </div>
                    }
                    <button class="po-view-all-btn" (click)="router.navigate(['/orders'])">
                      View full Order Book
                      <mat-icon>arrow_forward</mat-icon>
                    </button>
                  }
                }
              </div>
            }
          </div>

        </div>
      </div>

    </div>
  `,
  styles: [`
    /* ── Global mat-icon fix ──────────────────────────────────────────────
       mat-icon renders as display:inline by default. Inside flex rows this
       causes the icon to not vertically centre with sibling text.
       Setting inline-flex + align/justify center + line-height:1 fixes it
       everywhere in this component without touching global styles.          */
    mat-icon {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      flex-shrink: 0;
    }

    .po-page {
      padding: 28px 32px; min-height: 100%;
      animation: poIn 0.3s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes poIn {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .po-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px;
    }
    .po-title-wrap { display: flex; flex-direction: column; gap: 3px; }
    .po-title {
      display: flex; align-items: center; gap: 10px;
      font-size: 22px; font-weight: 800; color: var(--tf-text-primary); margin: 0;
    }
    .po-title-icon { font-size: 22px; width: 22px; height: 22px; color: var(--tf-cyan); }
    .po-subtitle { font-size: 12px; color: var(--tf-text-muted); padding-left: 32px; display: block; }

    /* Right-aligned Order Book pill button */
    .po-book-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 16px 9px 14px;
      background: linear-gradient(135deg, rgba(57,208,216,0.08) 0%, rgba(14,165,233,0.05) 100%);
      border: 1px solid rgba(57,208,216,0.3);
      border-radius: 22px;
      color: var(--tf-cyan); font-size: 13px; font-weight: 700;
      cursor: pointer; letter-spacing: 0.01em;
      transition: background 0.22s ease, border-color 0.22s ease,
                  box-shadow 0.22s ease, transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
      flex-shrink: 0;
    }
    .po-book-btn:hover {
      background: linear-gradient(135deg, rgba(57,208,216,0.18) 0%, rgba(14,165,233,0.12) 100%);
      border-color: rgba(57,208,216,0.65);
      box-shadow: 0 0 16px rgba(57,208,216,0.2);
      transform: translateY(-1px);
    }
    .po-book-icon  { font-size: 17px; width: 17px; height: 17px; }
    .po-book-arrow {
      font-size: 16px; width: 16px; height: 16px;
      transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }
    .po-book-btn:hover .po-book-arrow { transform: translateX(4px); }

    /* Body layout */
    .po-body {
      display: grid;
      grid-template-columns: 480px 1fr;
      gap: 28px;
      align-items: start;
      max-width: 960px;
    }
    @media (max-width: 860px) { .po-body { grid-template-columns: 1fr; } }

    /* Sidebar */
    .po-sidebar { display: flex; flex-direction: column; gap: 16px; }
    .po-tip-card {
      display: flex; align-items: flex-start; gap: 12px;
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px;
    }
    .po-tip-card > mat-icon { font-size: 20px; width: 20px; height: 20px; color: var(--tf-yellow); margin-top: 1px; }
    .po-tip-title { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); margin: 0 0 8px; }
    .po-tip-list { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 5px; }
    .po-tip-list li { font-size: 12px; color: var(--tf-text-secondary); line-height: 1.5; }
    .po-tip-list strong { color: var(--tf-cyan); }

    /* ── Recent Orders Accordion ───────────────────────────────────────── */
    .po-accordion {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); overflow: hidden;
    }
    .po-acc-header {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; background: transparent; border: none;
      cursor: pointer; transition: background 0.15s;
    }
    .po-acc-header:hover { background: rgba(255,255,255,0.03); }
    .po-acc-left { display: flex; align-items: center; gap: 8px; }
    .po-acc-icon    { font-size: 18px; width: 18px; height: 18px; color: var(--tf-cyan); }
    .po-acc-title   { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); line-height: 1; }
    .po-acc-badge {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
      background: rgba(57,208,216,0.15); color: var(--tf-cyan); line-height: 1.4;
    }
    .po-acc-chevron {
      font-size: 20px; width: 20px; height: 20px; color: var(--tf-text-muted);
      transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    .po-acc-chevron.open { transform: rotate(180deg); }

    .po-acc-body {
      border-top: 1px solid var(--tf-border);
      animation: accOpen 0.22s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes accOpen {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .po-acc-empty {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 24px; color: var(--tf-text-muted); font-size: 12px;
    }
    .po-acc-empty mat-icon { font-size: 28px; width: 28px; height: 28px; color: var(--tf-border); }

    .po-order-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03);
      transition: background 0.12s;
    }
    .po-order-row:last-of-type { border-bottom: none; }
    .po-order-row:hover { background: rgba(255,255,255,0.03); }

    .po-or-badge {
      font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px;
      flex-shrink: 0; letter-spacing: 0.02em; line-height: 1.4;
    }
    .po-or-badge.buy  { background: rgba(63,185,80,0.15);  color: var(--tf-green); }
    .po-or-badge.sell { background: rgba(248,81,73,0.15);  color: var(--tf-red); }

    .po-or-mid { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
    .po-or-symbol { font-size: 13px; font-weight: 700; color: var(--tf-text-primary); line-height: 1.3; }
    .po-or-meta   { font-size: 10px; color: var(--tf-text-muted); line-height: 1.3; }

    .po-or-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
    .po-or-status { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; line-height: 1.4; }
    .s-pending   { background: rgba(57,208,216,0.12);  color: var(--tf-cyan); }
    .s-complete  { background: rgba(63,185,80,0.12);   color: var(--tf-green); }
    .s-cancelled { background: rgba(139,148,158,0.12); color: var(--tf-text-muted); }
    .s-rejected  { background: rgba(248,81,73,0.12);   color: var(--tf-red); }
    .po-or-time  { font-size: 10px; color: var(--tf-text-muted); font-family: 'JetBrains Mono', monospace; line-height: 1.3; }

    .po-view-all-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 14px; background: transparent;
      border: none; border-top: 1px solid var(--tf-border);
      color: var(--tf-cyan); font-size: 12px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; letter-spacing: 0.01em;
    }
    .po-view-all-btn mat-icon {
      font-size: 15px; width: 15px; height: 15px;
      transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    .po-view-all-btn:hover { background: rgba(57,208,216,0.06); }
    .po-view-all-btn:hover mat-icon { transform: translateX(4px); }
  `]
})
export class PlaceOrderComponent implements OnInit {

  readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly store  = inject(Store);

  // WHY signals for prefill? Query params may set symbol/type from Dashboard or Markets.
  readonly prefillSymbol = signal('');
  readonly prefillType   = signal<TransactionType>('BUY');
  // WHY signal for historyOpen? Local accordion toggle — no NgRx needed.
  readonly historyOpen   = signal(false);

  readonly recentOrders$ = this.store.select(selectRecentOrders);

  constructor() {
    this.route.queryParams.subscribe(p => {
      if (p['symbol']) this.prefillSymbol.set(p['symbol'].toUpperCase());
      if (p['type'] === 'SELL') this.prefillType.set('SELL');
    });
  }

  ngOnInit(): void {
    // WHY load orders here? The sidebar accordion needs recent order data.
    this.store.dispatch(OrderActions.loadOrders());
  }

  onOrderPlaced(): void {
    // Stay on the page so the user can place another order — don't auto-navigate away.
    // The form will reset itself via NgRx state.
  }
}
