// WHY AlertsComponent?
// Central management page for all active price alerts.
// Traders set alerts in stock-detail, then monitor/delete them here.
// Alerts are one-shot: they disappear automatically once the target price is crossed.

import {
  Component, OnInit, inject, signal, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatIconModule }            from '@angular/material/icon';
import { MatButtonModule }          from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule }         from '@angular/material/tooltip';

import { AlertService }         from '../../core/services/alert.service';
import { NotificationService }  from '../../core/services/notification.service';
import { PriceAlert }           from '../../core/models/market.models';

@Component({
  selector: 'app-alerts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="alerts-page">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">
            <mat-icon class="title-icon">notifications_active</mat-icon>
            Price Alerts
          </h2>
          @if (!loading()) {
            <span class="alert-count">{{ alerts().length }} active</span>
          }
        </div>
        <button mat-icon-button (click)="loadAlerts()" matTooltip="Refresh" class="refresh-btn">
          <mat-icon>refresh</mat-icon>
        </button>
      </div>

      <!-- Info banner -->
      <div class="info-banner">
        <mat-icon class="info-icon">info</mat-icon>
        <span>
          Alerts are <strong>one-shot</strong> — they fire once when the price crosses your target,
          then are automatically removed. Set new alerts from any stock detail page.
        </span>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-wrap">
          <mat-spinner diameter="36"></mat-spinner>
          <span>Loading alerts…</span>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && alerts().length === 0) {
        <div class="empty-state">
          <mat-icon>notifications_none</mat-icon>
          <h3>No active alerts</h3>
          <p class="text-muted">
            Go to any stock detail page and click the bell icon to set a price alert.
          </p>
        </div>
      }

      <!-- Alert cards -->
      @if (!loading() && alerts().length > 0) {
        <div class="alert-grid">
          @for (alert of alerts(); track alert.id) {
            <div class="alert-card" [class.above]="alert.condition === 'ABOVE'" [class.below]="alert.condition === 'BELOW'">

              <!-- Top accent stripe -->
              <div class="ac-stripe"></div>

              <div class="ac-body">
                <!-- Card header: symbol | badge | delete -->
                <div class="ac-header">
                  <div class="ac-symbol-wrap" (click)="goToStock(alert.symbol)" matTooltip="View stock detail">
                    <span class="ac-symbol">{{ alert.symbol }}</span>
                    <mat-icon class="ac-link-icon">open_in_new</mat-icon>
                  </div>
                  <div class="ac-header-right">
                    <div class="ac-condition-badge" [class.above-badge]="alert.condition === 'ABOVE'" [class.below-badge]="alert.condition === 'BELOW'">
                      <mat-icon class="cond-icon">{{ alert.condition === 'ABOVE' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
                      {{ alert.condition === 'ABOVE' ? 'Rises to' : 'Falls to' }}
                    </div>
                    <button mat-icon-button class="ac-delete"
                      (click)="deleteAlert(alert)"
                      matTooltip="Remove alert"
                      [disabled]="deleting() === alert.id">
                      @if (deleting() === alert.id) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <mat-icon>delete_outline</mat-icon>
                      }
                    </button>
                  </div>
                </div>

                <!-- Target price -->
                <div class="ac-target">
                  <span class="ac-label">Target Price</span>
                  <span class="ac-price text-mono">₹{{ alert.targetPrice | number:'1.2-2' }}</span>
                </div>

                <!-- Set at price -->
                <div class="ac-meta">
                  <div class="ac-meta-item">
                    <span class="ac-label">Price when set</span>
                    <span class="ac-meta-val text-mono">₹{{ alert.priceAtCreation | number:'1.2-2' }}</span>
                  </div>
                  <div class="ac-meta-item">
                    <span class="ac-label">Created</span>
                    <span class="ac-meta-val">{{ formatDate(alert.createdAt) }}</span>
                  </div>
                </div>

                <!-- Gap indicator: how far price needs to move -->
                <div class="ac-gap">
                  <span class="ac-label">Gap to target</span>
                  <span class="ac-gap-val text-mono"
                    [class.text-green]="alert.condition === 'ABOVE'"
                    [class.text-red]="alert.condition === 'BELOW'">
                    {{ getGapPercent(alert) }}%
                  </span>
                </div>
              </div>

            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .alerts-page { padding: 24px; }

    /* Header */
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .page-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 20px; font-weight: 600; color: var(--tf-text-primary); margin: 0;
    }
    .title-icon { color: var(--tf-cyan); }
    .alert-count {
      font-size: 12px; background: var(--tf-bg-elevated);
      color: var(--tf-text-muted); padding: 2px 10px; border-radius: 12px;
    }
    .refresh-btn { color: var(--tf-text-muted) !important; }

    /* Info banner */
    .info-banner {
      display: flex; align-items: center; gap: 10px;
      background: rgba(79,172,254,0.06); border: 1px solid rgba(79,172,254,0.2);
      border-radius: var(--tf-radius-sm); padding: 10px 14px;
      font-size: 13px; color: var(--tf-text-secondary); margin-bottom: 20px;
    }
    .info-icon { font-size: 18px; color: var(--tf-cyan); flex-shrink: 0; }

    /* Loading */
    .loading-wrap {
      display: flex; flex-direction: column; align-items: center;
      gap: 16px; padding: 60px; color: var(--tf-text-muted);
    }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 60px; text-align: center; color: var(--tf-text-muted);
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--tf-border); }
    .empty-state h3 { color: var(--tf-text-primary); margin: 0; font-size: 18px; }

    /* Alert grid */
    .alert-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    }

    /* Alert card */
    .alert-card {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); overflow: hidden;
      display: flex; flex-direction: column;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .alert-card:hover { border-color: rgba(79,172,254,0.35); box-shadow: 0 2px 12px rgba(0,0,0,0.18); }

    /* Coloured top stripe — subtle accent, no left border clash */
    .ac-stripe {
      height: 3px; width: 100%;
    }
    .alert-card.above .ac-stripe { background: linear-gradient(90deg, var(--tf-green), rgba(63,185,80,0.2)); }
    .alert-card.below .ac-stripe { background: linear-gradient(90deg, var(--tf-red), rgba(248,81,73,0.2)); }

    /* Card body */
    .ac-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }

    /* Card header: symbol on left, badge + delete on right */
    .ac-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .ac-symbol-wrap {
      display: flex; align-items: center; gap: 4px; cursor: pointer;
    }
    .ac-symbol { font-size: 18px; font-weight: 700; color: var(--tf-text-primary); }
    .ac-link-icon { font-size: 14px; color: var(--tf-text-muted); }
    .ac-symbol-wrap:hover .ac-symbol { color: var(--tf-cyan); }
    .ac-symbol-wrap:hover .ac-link-icon { color: var(--tf-cyan); }

    /* Right side of header: badge and delete sit side by side */
    .ac-header-right { display: flex; align-items: center; gap: 6px; }

    .ac-condition-badge {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px;
    }
    .above-badge { background: rgba(63,185,80,0.12); color: var(--tf-green); }
    .below-badge { background: rgba(248,81,73,0.12); color: var(--tf-red); }
    .cond-icon { font-size: 14px; width: 14px; height: 14px; }

    /* Target price */
    .ac-target { display: flex; flex-direction: column; gap: 2px; }
    .ac-label { font-size: 10px; color: var(--tf-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .ac-price { font-size: 22px; font-weight: 700; color: var(--tf-text-primary); }

    /* Meta row */
    .ac-meta { display: flex; gap: 20px; }
    .ac-meta-item { display: flex; flex-direction: column; gap: 2px; }
    .ac-meta-val { font-size: 12px; color: var(--tf-text-secondary); }

    /* Gap */
    .ac-gap { display: flex; justify-content: space-between; align-items: center; }
    .ac-gap-val { font-size: 14px; font-weight: 600; }

    /* Delete — contained red pill so it looks intentional, not clashing */
    .ac-delete {
      color: var(--tf-red) !important;
      background: rgba(248,81,73,0.1) !important;
      border-radius: 8px !important;
      width: 32px !important; height: 32px !important;
      line-height: 32px !important;
      display: inline-flex !important; align-items: center; justify-content: center;
    }
    .ac-delete mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; }
    .ac-delete:hover { background: rgba(248,81,73,0.22) !important; }
  `]
})
export class AlertsComponent implements OnInit {

  private readonly alertSvc  = inject(AlertService);
  private readonly notifSvc  = inject(NotificationService);
  private readonly router    = inject(Router);

  readonly loading  = signal(true);
  readonly alerts   = signal<PriceAlert[]>([]);
  readonly deleting = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.loading.set(true);
    this.alertSvc.getAlerts().subscribe({
      next: alerts => { this.alerts.set(alerts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  deleteAlert(alert: PriceAlert): void {
    this.deleting.set(alert.id);
    this.alertSvc.deleteAlert(alert.id).subscribe({
      next: () => {
        this.alerts.update(list => list.filter(a => a.id !== alert.id));
        this.deleting.set(null);
        this.notifSvc.add(
          'ORDER_CANCELLED',
          `Alert removed — ${alert.symbol}`,
          `Price alert for ₹${alert.targetPrice.toFixed(2)} (${alert.condition}) has been removed`,
          alert.symbol
        );
      },
      error: () => this.deleting.set(null),
    });
  }

  goToStock(symbol: string): void {
    this.router.navigate(['/stock-detail', symbol]);
  }

  // WHY format ISO date? The backend stores createdAt as ISO string.
  // Showing a human-readable relative or formatted date is better UX.
  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  // % gap between price-at-creation and target — shows how far price needs to move
  getGapPercent(alert: PriceAlert): string {
    const gap = ((alert.targetPrice - alert.priceAtCreation) / alert.priceAtCreation) * 100;
    return (gap >= 0 ? '+' : '') + gap.toFixed(2);
  }
}
