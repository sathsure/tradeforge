// Orders page — Sprint 2: Full order management
// Shows pending orders, order history, and new order form.
// All state via NgRx — no local component state for data.

import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AsyncPipe, DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { ToastService } from '../../core/services/toast.service';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { OrderActions } from './state/order.actions';
import { selectOrders, selectLoading, selectPendingOrders, selectCompletedOrders } from './state/order.selectors';
import { OrderResponse } from '../../core/models/order.models';
import { OrderService } from '../../core/services/order.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    AsyncPipe, DatePipe, DecimalPipe, NgClass, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
    MatSnackBarModule, MatInputModule, MatFormFieldModule,
  ],
  template: `
    <div class="page-container">

      <!-- Page header -->
      <div class="page-header">
        <div class="page-title-wrap">
          <h1 class="page-title">
            <mat-icon class="title-icon">receipt_long</mat-icon>
            Order Book
          </h1>
          <span class="page-subtitle">Pending &amp; executed orders</span>
        </div>
        <button mat-flat-button class="new-order-btn" (click)="goToPlaceOrder()">
          <mat-icon>add_shopping_cart</mat-icon>
          New Order
        </button>
      </div>

      <!-- Loading state -->
      @if (loading$ | async) {
        <div class="loading-state">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {

        <!-- Inline edit panel — shows when user clicks edit on a pending order -->
        @if (editingOrder()) {
          <div class="edit-panel">
            <div class="edit-panel-header">
              <div class="edit-title">
                <mat-icon>edit</mat-icon>
                Modify Order — <strong>{{ editingOrder()!.symbol }}</strong>
                <span class="txn-badge" [class.buy]="editingOrder()!.transactionType === 'BUY'"
                      [class.sell]="editingOrder()!.transactionType === 'SELL'">
                  {{ editingOrder()!.transactionType }}
                </span>
                <span class="edit-type-badge">{{ editingOrder()!.orderType }}</span>
              </div>
              <button mat-icon-button (click)="cancelEdit()" matTooltip="Cancel" class="edit-close-btn">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="edit-fields">
              <div class="edit-field">
                <label class="edit-label">Quantity</label>
                <input class="edit-input" type="number" [formControl]="editQtyCtrl"
                       min="1" inputmode="numeric" placeholder="Qty">
                @if (editQtyCtrl.touched && editQtyCtrl.invalid) {
                  <span class="edit-err">Min 1 share</span>
                }
              </div>
              <div class="edit-field">
                <label class="edit-label">Price (₹)</label>
                <input class="edit-input" type="number" [formControl]="editPriceCtrl"
                       min="0.01" step="0.05" inputmode="decimal" placeholder="Limit price">
                @if (editPriceCtrl.touched && editPriceCtrl.invalid) {
                  <span class="edit-err">Enter valid price</span>
                }
              </div>
              <div class="edit-actions">
                <button mat-flat-button class="save-edit-btn" (click)="saveEdit()"
                        [disabled]="editQtyCtrl.invalid || editPriceCtrl.invalid || saving()">
                  @if (saving()) { <mat-spinner diameter="16"></mat-spinner> }
                  @else { <mat-icon>save</mat-icon> }
                  Update Order
                </button>
                <button mat-stroked-button (click)="cancelEdit()" class="cancel-edit-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Pending orders -->
        @if ((pendingOrders$ | async)?.length) {
          <section class="orders-section">
            <h2 class="section-title">
              <mat-icon class="section-icon pending-icon">pending</mat-icon>
              Pending Orders
              <span class="badge">{{ (pendingOrders$ | async)?.length }}</span>
            </h2>
            <div class="scroll-hint-bar mobile-only">
              <mat-icon class="scroll-hint-icon">swipe</mat-icon>
              <span>Swipe left to see all columns</span>
            </div>
            <div class="table-wrap">
              <table mat-table [dataSource]="(pendingOrders$ | async) || []" class="orders-table">
                <ng-container matColumnDef="txn">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let o">
                    <span class="txn-badge" [class.buy]="o.transactionType==='BUY'" [class.sell]="o.transactionType==='SELL'">{{ o.transactionType }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="symbol">
                  <th mat-header-cell *matHeaderCellDef>Symbol</th>
                  <td mat-cell *matCellDef="let o" class="symbol-cell">{{ o.symbol }}</td>
                </ng-container>
                <ng-container matColumnDef="orderType">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let o">{{ o.orderType }}</td>
                </ng-container>
                <ng-container matColumnDef="qty">
                  <th mat-header-cell *matHeaderCellDef>Qty</th>
                  <td mat-cell *matCellDef="let o">{{ o.quantity }}</td>
                </ng-container>
                <ng-container matColumnDef="price">
                  <th mat-header-cell *matHeaderCellDef>Price</th>
                  <td mat-cell *matCellDef="let o">{{ o.price ? '₹'+(o.price | number:'1.2-2') : 'MARKET' }}</td>
                </ng-container>
                <ng-container matColumnDef="time">
                  <th mat-header-cell *matHeaderCellDef>Time</th>
                  <td mat-cell *matCellDef="let o">{{ o.placedAt | date:'HH:mm:ss' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let o" class="action-cell">
                    @if (o.orderType !== 'MARKET') {
                      <button mat-icon-button (click)="startEdit(o)" matTooltip="Modify order"
                              class="edit-btn" [class.active]="editingOrder()?.id === o.id">
                        <mat-icon>edit</mat-icon>
                      </button>
                    }
                    <button mat-icon-button color="warn" (click)="cancelOrder(o)" matTooltip="Cancel order">
                      <mat-icon>cancel</mat-icon>
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="pendingCols"></tr>
                <tr mat-row *matRowDef="let row; columns: pendingCols;"></tr>
              </table>
            </div>
          </section>
        }

        <!-- Order history -->
        <section class="orders-section">
          <h2 class="section-title">
            <mat-icon class="section-icon">history</mat-icon>
            Order History
          </h2>
          @if ((orders$ | async)?.length === 0) {
            <div class="empty-state">
              <mat-icon>receipt_long</mat-icon>
              <p>No orders yet. Place your first order!</p>
            </div>
          } @else {
            <div class="scroll-hint-bar mobile-only">
              <mat-icon class="scroll-hint-icon">swipe</mat-icon>
              <span>Swipe left to see all columns</span>
            </div>
            <div class="table-wrap">
              <table mat-table [dataSource]="(completedOrders$ | async) || []" class="orders-table">
                <ng-container matColumnDef="txn">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let o">
                    <span class="txn-badge" [class.buy]="o.transactionType==='BUY'" [class.sell]="o.transactionType==='SELL'">{{ o.transactionType }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="symbol">
                  <th mat-header-cell *matHeaderCellDef>Symbol</th>
                  <td mat-cell *matCellDef="let o" class="symbol-cell">{{ o.symbol }}</td>
                </ng-container>
                <ng-container matColumnDef="orderType">
                  <th mat-header-cell *matHeaderCellDef>Order Type</th>
                  <td mat-cell *matCellDef="let o">{{ o.orderType }}</td>
                </ng-container>
                <ng-container matColumnDef="qty">
                  <th mat-header-cell *matHeaderCellDef>Qty / Filled</th>
                  <td mat-cell *matCellDef="let o">{{ o.filledQty }}/{{ o.quantity }}</td>
                </ng-container>
                <ng-container matColumnDef="price">
                  <th mat-header-cell *matHeaderCellDef>Avg Price</th>
                  <td mat-cell *matCellDef="let o">{{ o.avgPrice ? '₹'+(o.avgPrice | number:'1.2-2') : '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let o">
                    <span class="status-badge" [ngClass]="'status-'+o.status.toLowerCase()">{{ o.status }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="time">
                  <th mat-header-cell *matHeaderCellDef>Time</th>
                  <td mat-cell *matCellDef="let o">{{ o.placedAt | date:'dd MMM, HH:mm' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="historyCols"></tr>
                <tr mat-row *matRowDef="let row; columns: historyCols;" class="history-row"></tr>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1200px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-title-wrap { display: flex; flex-direction: column; gap: 2px; }
    .page-title { display: flex; align-items: center; gap: 8px; color: var(--tf-text-primary); margin: 0; font-size: 22px; font-weight: 800; }
    .title-icon { color: var(--tf-cyan); }
    .page-subtitle { font-size: 12px; color: var(--tf-text-muted); padding-left: 30px; }
    .new-order-btn { background: var(--tf-cyan) !important; color: #000 !important; font-weight: 700 !important; }
    .loading-state { display: flex; justify-content: center; padding: 80px; }
    .orders-section { margin-bottom: 32px; }
    .section-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: var(--tf-text-primary); margin-bottom: 12px; }
    .badge { background: var(--tf-cyan); color: #000; border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: 700; }
    .pending-icon { color: var(--tf-cyan); }
    .table-wrap { overflow-x: auto; }
    .orders-table { width: 100%; background: var(--tf-bg-surface); }
    .symbol-cell { font-weight: 600; color: var(--tf-cyan); }
    .txn-badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; }
    .txn-badge.buy { background: rgba(63,185,80,0.2); color: var(--tf-green); }
    .txn-badge.sell { background: rgba(248,81,73,0.2); color: var(--tf-red); }
    .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .status-complete { background: rgba(63,185,80,0.2); color: var(--tf-green); }
    .status-pending { background: rgba(57,208,216,0.2); color: var(--tf-cyan); }
    .status-cancelled { background: rgba(139,148,158,0.2); color: var(--tf-text-secondary); }
    .history-row:hover { background: var(--tf-bg-app); }
    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px; color: var(--tf-text-secondary); gap: 12px; }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; }

    /* Edit panel */
    .edit-panel {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-cyan);
      border-radius: var(--tf-radius-md); padding: 16px 20px; margin-bottom: 16px;
      animation: fadeSlideDown 0.2s ease-out;
    }
    @keyframes fadeSlideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .edit-panel-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
    }
    .edit-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 600; color: var(--tf-text-primary);
    }
    .edit-title mat-icon { font-size: 18px; color: var(--tf-cyan); }
    .edit-type-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 4px;
      background: rgba(79,172,254,0.1); color: var(--tf-cyan);
    }
    .edit-close-btn { color: var(--tf-text-muted) !important; }
    .edit-fields { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .edit-field { display: flex; flex-direction: column; gap: 4px; }
    .edit-label { font-size: 11px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .edit-input {
      padding: 8px 10px; border-radius: var(--tf-radius-sm);
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-primary); font-size: 14px; font-weight: 600;
      width: 120px; outline: none; transition: border-color 0.15s;
    }
    .edit-input:focus { border-color: var(--tf-cyan); }
    .edit-err { font-size: 11px; color: var(--tf-red); }
    .edit-actions { display: flex; gap: 8px; padding-bottom: 2px; }
    .save-edit-btn {
      background: var(--tf-cyan) !important; color: #000 !important;
      font-weight: 700 !important; display: flex !important; align-items: center; gap: 4px;
    }
    .save-edit-btn mat-icon { font-size: 16px; }
    .cancel-edit-btn { color: var(--tf-text-muted) !important; }
    .action-cell { white-space: nowrap; }
    .edit-btn { color: var(--tf-text-muted) !important; }
    .edit-btn.active { color: var(--tf-cyan) !important; }

    /* Scroll hint bar: hidden on desktop */
    .scroll-hint-bar { display: none; }

    @media (max-width: 768px) {
      .page-container { padding: 14px; }
      .page-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .table-wrap { min-width: 0; }
      .orders-table { min-width: 560px; }

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
    }
  `]
})
export class OrdersComponent implements OnInit {

  private readonly store      = inject(Store);
  private readonly router     = inject(Router);
  private readonly orderSvc   = inject(OrderService);
  private readonly toast      = inject(ToastService);

  readonly orders$          = this.store.select(selectOrders);
  readonly loading$         = this.store.select(selectLoading);
  readonly pendingOrders$   = this.store.select(selectPendingOrders);
  readonly completedOrders$ = this.store.select(selectCompletedOrders);

  readonly pendingCols = ['txn', 'symbol', 'orderType', 'qty', 'price', 'time', 'actions'];
  readonly historyCols = ['txn', 'symbol', 'orderType', 'qty', 'price', 'status', 'time'];

  // WHY signals for edit state? Local UI state — no need for NgRx.
  // editingOrder tracks which order is open in the edit panel.
  readonly editingOrder = signal<OrderResponse | null>(null);
  readonly saving       = signal(false);
  readonly editQtyCtrl   = new FormControl<number | null>(null, [Validators.required, Validators.min(1)]);
  readonly editPriceCtrl = new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]);

  ngOnInit(): void {
    this.store.dispatch(OrderActions.loadOrders());
  }

  goToPlaceOrder(): void {
    this.router.navigate(['/place-order']);
  }

  cancelOrder(order: OrderResponse): void {
    if (confirm(`Cancel ${order.transactionType} ${order.quantity} ${order.symbol}?`)) {
      this.store.dispatch(OrderActions.cancelOrder({ id: order.id }));
    }
  }

  // WHY only LIMIT/SL orders get an edit button?
  // MARKET orders fill instantly and are never PENDING — nothing to modify.
  startEdit(order: OrderResponse): void {
    this.editingOrder.set(order);
    this.editQtyCtrl.setValue(order.quantity);
    this.editPriceCtrl.setValue(order.price ?? null);
    this.editQtyCtrl.markAsUntouched();
    this.editPriceCtrl.markAsUntouched();
  }

  cancelEdit(): void {
    this.editingOrder.set(null);
  }

  saveEdit(): void {
    const order = this.editingOrder();
    if (!order) return;
    this.editQtyCtrl.markAsTouched();
    this.editPriceCtrl.markAsTouched();
    if (this.editQtyCtrl.invalid || this.editPriceCtrl.invalid) return;

    const qty   = this.editQtyCtrl.value!;
    const price = this.editPriceCtrl.value!;
    this.saving.set(true);

    this.orderSvc.modifyOrder(order.id, qty, price).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingOrder.set(null);
        this.store.dispatch(OrderActions.loadOrders());
        this.toast.success('Order Updated', `${order.symbol} ${qty} shares @ ₹${price.toFixed(2)} — changes saved!`);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Update Failed', 'Couldn\'t modify the order — it may have already been processed.');
      },
    });
  }
}
