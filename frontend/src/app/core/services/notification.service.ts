// WHY NotificationService?
// Centralized in-app notification management.
// Generates notifications from trading events: order fills, price alerts, corporate actions.
// Uses BehaviorSubject so all subscribers always get the current list on subscribe.
// Signals (Angular 18) drive the unread count for the bell badge — O(1) reactive update.

import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AppNotification, NotificationType } from '../models/market.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {

  // WHY BehaviorSubject? Notifications list is "state over time" — new subscribers
  // need the current list immediately (not just future events like a Subject).
  private readonly _notifications = new BehaviorSubject<AppNotification[]>([]);
  readonly notifications$ = this._notifications.asObservable();

  // WHY signal for unreadCount? The topbar bell badge is a tiny reactive slice.
  // Using a computed signal prevents re-rendering the full notification list
  // just to update a badge number — fine-grained reactivity.
  readonly unreadCount = signal(0);

  constructor() {
    // Seed with a few startup notifications to make the UI feel alive
    this.addStartupNotifications();
  }

  /**
   * Adds a new notification. Called by effects, WebSocket handlers, etc.
   * WHY prepend (unshift)? Most-recent notifications appear at the top.
   */
  add(type: NotificationType, title: string, message: string, symbol?: string): void {
    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      message,
      symbol,
      timestamp: Date.now(),
      read: false,
    };
    const current = this._notifications.getValue();
    // WHY limit to 50? Prevent memory growth from long trading sessions.
    // Oldest notifications (>50) are silently dropped.
    const updated = [notification, ...current].slice(0, 50);
    this._notifications.next(updated);
    this.unreadCount.update(n => n + 1);
  }

  /** Marks a single notification as read. */
  markRead(id: string): void {
    const updated = this._notifications.getValue().map(n =>
      n.id === id ? { ...n, read: true } : n
    );
    this._notifications.next(updated);
    this.recalcUnread(updated);
  }

  /** Marks all notifications as read (e.g., when panel opens). */
  markAllRead(): void {
    const updated = this._notifications.getValue().map(n => ({ ...n, read: true }));
    this._notifications.next(updated);
    this.unreadCount.set(0);
  }

  /** Clear all notifications. */
  clearAll(): void {
    this._notifications.next([]);
    this.unreadCount.set(0);
  }

  // ─── Convenience methods for specific event types ─────────────────────────

  notifyOrderFilled(symbol: string, qty: number, price: number, type: 'BUY' | 'SELL'): void {
    this.add(
      'ORDER_FILLED',
      `Order Filled — ${symbol}`,
      `${type} ${qty} shares @ ₹${price.toFixed(2)} executed successfully`,
      symbol
    );
  }

  notifyOrderCancelled(symbol: string): void {
    this.add('ORDER_CANCELLED', `Order Cancelled — ${symbol}`,
      `Your pending order for ${symbol} was cancelled`, symbol);
  }

  notifyPriceAlert(symbol: string, price: number, targetPrice: number, direction: 'above' | 'below'): void {
    this.add(
      'PRICE_ALERT',
      `Price Alert — ${symbol}`,
      `${symbol} is now ₹${price.toFixed(2)} (${direction} your target of ₹${targetPrice.toFixed(2)})`,
      symbol
    );
  }

  notifyCorporateAction(symbol: string, type: string, description: string): void {
    this.add('CORPORATE_ACTION', `${type} — ${symbol}`, description, symbol);
  }

  private recalcUnread(notifications: AppNotification[]): void {
    this.unreadCount.set(notifications.filter(n => !n.read).length);
  }

  private addStartupNotifications(): void {
    // WHY startup notifications? Makes the UI feel populated immediately.
    // In production, these would be loaded from a persistence layer (Redis/DB).
    const now = Date.now();
    const initial: AppNotification[] = [
      {
        id: 'startup-1',
        type: 'MARKET_OPEN',
        title: 'Market Open',
        message: 'NSE/BSE markets are now open. Trading hours: 9:15 AM – 3:30 PM IST',
        timestamp: now - 3600000,  // 1 hour ago
        read: false,
      },
      {
        id: 'startup-2',
        type: 'CORPORATE_ACTION',
        title: 'Dividend — TCS',
        message: 'TCS ex-dividend date upcoming (₹70/share). Hold before ex-date to qualify.',
        symbol: 'TCS',
        timestamp: now - 7200000,  // 2 hours ago
        read: false,
      },
      {
        id: 'startup-3',
        type: 'ORDER_FILLED',
        title: 'Order Filled — RELIANCE',
        message: 'BUY 10 shares @ ₹2,847.35 executed successfully',
        symbol: 'RELIANCE',
        timestamp: now - 86400000, // Yesterday
        read: true,
      },
    ];
    this._notifications.next(initial);
    this.unreadCount.set(initial.filter(n => !n.read).length);
  }
}
