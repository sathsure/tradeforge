// WHY NotificationPanelComponent?
// Slide-out overlay panel for in-app notifications.
// Decoupled from the shell so it can be tested and styled independently.
// Uses NotificationService (BehaviorSubject) for the list and marks all as read on open.

import {
  Component, inject, Output, EventEmitter, OnInit, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

import { NotificationService } from '../../../core/services/notification.service';
import { AppNotification, NotificationType } from '../../../core/models/market.models';

// Maps notification types to Material icon names
const TYPE_ICONS: Record<NotificationType, string> = {
  ORDER_FILLED:     'check_circle',
  ORDER_CANCELLED:  'cancel',
  PRICE_ALERT:      'notifications_active',
  CORPORATE_ACTION: 'business',
  MARKET_OPEN:      'store',
  MARKET_CLOSE:     'store_front',
};

// Maps types to CSS colour class
const TYPE_CLASSES: Record<NotificationType, string> = {
  ORDER_FILLED:     'type-success',
  ORDER_CANCELLED:  'type-error',
  PRICE_ALERT:      'type-warn',
  CORPORATE_ACTION: 'type-info',
  MARKET_OPEN:      'type-success',
  MARKET_CLOSE:     'type-muted',
};

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatIconModule, MatButtonModule, MatDividerModule],
  template: `
    <!-- Backdrop click closes the panel -->
    <div class="panel-backdrop" (click)="close.emit()"></div>

    <div class="panel">

      <!-- Panel header -->
      <div class="panel-header">
        <div class="panel-title">
          <mat-icon class="h-icon">notifications</mat-icon>
          <span>Notifications</span>
        </div>
        <div class="panel-actions">
          <button mat-button class="action-btn" (click)="markAllRead()" *ngIf="hasUnread()">
            Mark all read
          </button>
          <button mat-button class="action-btn danger-btn" (click)="clearAll()" *ngIf="(notifications$ | async)?.length">
            Clear all
          </button>
          <button mat-icon-button (click)="close.emit()" class="close-btn" aria-label="Close notifications">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <mat-divider></mat-divider>

      <!-- Notification list -->
      <div class="panel-body">
        @if ((notifications$ | async); as notifs) {
          @if (notifs.length === 0) {
            <div class="empty-state">
              <mat-icon>notifications_none</mat-icon>
              <p>No notifications yet.</p>
              <span class="empty-sub">Order fills, price alerts, and corporate actions will appear here.</span>
            </div>
          } @else {
            <div class="notif-list">
              @for (n of notifs; track n.id) {
                <div class="notif-item"
                  [class.unread]="!n.read"
                  (click)="onItemClick(n)">
                  <!-- Type icon -->
                  <div class="notif-icon-wrap" [ngClass]="getTypeClass(n.type)">
                    <mat-icon class="notif-icon">{{ getTypeIcon(n.type) }}</mat-icon>
                  </div>

                  <!-- Content -->
                  <div class="notif-content">
                    <div class="notif-title">{{ n.title }}</div>
                    <div class="notif-msg">{{ n.message }}</div>
                    <div class="notif-time">{{ n.timestamp | date:'MMM d, h:mm a' }}</div>
                  </div>

                  <!-- Unread dot -->
                  @if (!n.read) {
                    <div class="unread-dot"></div>
                  }

                  <!-- Symbol chip (if applicable) -->
                  @if (n.symbol) {
                    <div class="sym-chip" [routerLink]="['/stock-detail', n.symbol]"
                      (click)="$event.stopPropagation()" matTooltip="View stock">
                      {{ n.symbol }}
                    </div>
                  }
                </div>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    /* Backdrop */
    .panel-backdrop {
      position: fixed; inset: 0; z-index: 999;
      background: rgba(0,0,0,0.3);
    }

    /* Slide-in panel */
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 380px; max-width: 100vw;
      background: var(--tf-bg-surface);
      border-left: 1px solid var(--tf-border);
      z-index: 1000;
      display: flex; flex-direction: column;
      box-shadow: -8px 0 32px rgba(0,0,0,0.4);
      animation: slideIn 0.22s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }

    /* Panel header */
    .panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; flex-shrink: 0;
    }
    .panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 16px; font-weight: 600; color: var(--tf-text-primary);
    }
    .h-icon { color: var(--tf-cyan); font-size: 20px; }
    .panel-actions { display: flex; align-items: center; gap: 4px; }
    .action-btn { font-size: 12px; color: var(--tf-text-muted) !important; }
    .danger-btn { color: var(--tf-red) !important; }
    .close-btn { color: var(--tf-text-muted); }

    /* Scrollable body */
    .panel-body { flex: 1; overflow-y: auto; }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 48px 24px; text-align: center; color: var(--tf-text-muted);
    }
    .empty-state mat-icon { font-size: 40px; width: 40px; height: 40px; color: var(--tf-border); }
    .empty-sub { font-size: 12px; color: var(--tf-text-muted); line-height: 1.5; }

    /* Notification items */
    .notif-list { display: flex; flex-direction: column; }
    .notif-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 20px; cursor: pointer; transition: background 0.12s;
      border-bottom: 1px solid rgba(255,255,255,0.04); position: relative;
    }
    .notif-item:hover { background: var(--tf-bg-elevated); }
    .notif-item.unread { background: rgba(79,172,254,0.04); }

    /* Icon wrap */
    .notif-icon-wrap {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .type-success { background: rgba(63,185,80,0.15); color: var(--tf-green); }
    .type-error   { background: rgba(248,81,73,0.15); color: var(--tf-red); }
    .type-warn    { background: rgba(227,179,65,0.15); color: #e3b341; }
    .type-info    { background: rgba(79,172,254,0.15); color: var(--tf-cyan); }
    .type-muted   { background: var(--tf-bg-elevated); color: var(--tf-text-muted); }
    .notif-icon { font-size: 18px; }

    /* Content */
    .notif-content { flex: 1; min-width: 0; }
    .notif-title { font-weight: 600; font-size: 13px; color: var(--tf-text-primary); }
    .notif-msg { font-size: 12px; color: var(--tf-text-secondary); line-height: 1.4; margin: 2px 0; }
    .notif-time { font-size: 11px; color: var(--tf-text-muted); }

    /* Unread indicator */
    .unread-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--tf-cyan); flex-shrink: 0; margin-top: 4px;
    }

    /* Symbol chip */
    .sym-chip {
      font-size: 10px; padding: 2px 7px; border-radius: 4px;
      background: rgba(79,172,254,0.1); color: var(--tf-cyan);
      font-weight: 600; cursor: pointer; flex-shrink: 0; align-self: flex-start;
      transition: background 0.12s;
    }
    .sym-chip:hover { background: rgba(79,172,254,0.25); }
  `]
})
export class NotificationPanelComponent implements OnInit {

  private readonly notifSvc = inject(NotificationService);

  // WHY EventEmitter close? Parent (shell) controls visibility.
  // Panel emits close → shell hides the panel. Clean parent/child contract.
  @Output() close = new EventEmitter<void>();

  readonly notifications$ = this.notifSvc.notifications$;

  ngOnInit(): void {
    // WHY markAllRead on open? Opening the panel implies the user is reading.
    // Avoids stale unread badge after user has seen the notifications.
    this.notifSvc.markAllRead();
  }

  hasUnread(): boolean {
    return this.notifSvc.unreadCount() > 0;
  }

  onItemClick(n: AppNotification): void {
    if (!n.read) this.notifSvc.markRead(n.id);
  }

  markAllRead(): void { this.notifSvc.markAllRead(); }
  clearAll(): void { this.notifSvc.clearAll(); }

  getTypeIcon(type: NotificationType): string {
    return TYPE_ICONS[type] ?? 'info';
  }

  getTypeClass(type: NotificationType): string {
    return TYPE_CLASSES[type] ?? 'type-info';
  }
}
