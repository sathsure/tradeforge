// WHY a dedicated WebSocket service?
// Live price data is needed by multiple components simultaneously:
// - Market watchlist (showing all prices)
// - Portfolio (showing live P&L)
// - Order form (showing current price before placing order)
//
// ONE WebSocket connection shared across the whole app — not one per component.
// This service manages the single connection and dispatches tick actions to NgRx.

import { Injectable, OnDestroy, inject } from '@angular/core';
import { Client, StompSubscription } from '@stomp/stompjs';
import { Subject } from 'rxjs';
import { Store } from '@ngrx/store';
import { environment } from '../../../environments/environment';
import { MarketActions } from '../../features/markets/state/market.actions';
import { PortfolioActions } from '../../features/portfolio/state/portfolio.actions';
import { selectAllHoldings } from '../../features/portfolio/state/portfolio.selectors';
import { NotificationService } from './notification.service';
import { NotificationType } from '../models/market.models';
import { MarketHoursService } from './market-hours.service';

export interface PriceTick {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

// WHY a prefix constant? Notification subscriptions share the same stompSubscriptions Map
// as symbol subscriptions. The prefix prevents key collision ('RELIANCE' vs '__notif_uuid').
const NOTIF_KEY_PREFIX = '__notif_';

@Injectable({ providedIn: 'root' })
// WHY providedIn: 'root'? Creates a singleton — one instance for the entire app.
// All components share the SAME WebSocket connection.
export class WebSocketService implements OnDestroy {

  private readonly store     = inject(Store);
  // WHY inject NotificationService here?
  // When a price alert fires, the notification arrives via WebSocket.
  // We call NotificationService.add() so the bell badge increments and the
  // panel shows the alert — without the component needing to know about WS.
  private readonly notifSvc  = inject(NotificationService);
  // WHY inject MarketHoursService?
  // Gate live price dispatches — prices should not update outside trading hours,
  // just like real brokerage platforms (Zerodha, Kite, Groww).
  private readonly marketHours = inject(MarketHoursService);

  private client!: Client;
  private stompSubscriptions = new Map<string, StompSubscription>();
  // WHY Map<key, subscription>? Tracks all active STOMP subscriptions.
  // Symbol ticks use the symbol as key ('RELIANCE').
  // User notifications use NOTIF_KEY_PREFIX + userId ('__notif_uuid').
  // Both are cleaned up and re-subscribed after reconnect via resubscribeAll().

  private connectionStatus$ = new Subject<'connected' | 'disconnected' | 'error'>();
  connectionStatus = this.connectionStatus$.asObservable();

  // WHY track held symbols?
  // When a tick arrives for a symbol the user holds, we also update portfolio P&L.
  private heldSymbols = new Set<string>();

  // WHY track notificationUserId separately?
  // resubscribeAll() must re-subscribe notifications after reconnect.
  // The userId needs to survive between disconnect and reconnect.
  private notificationUserId: string | null = null;

  constructor() {
    this.initializeClient();
    // WHY subscribe to portfolio holdings here?
    // WebSocketService needs to know which symbols the user holds so it can
    // dispatch PortfolioActions.updateHoldingPrice on ticks for those symbols.
    // This creates a reactive link: portfolio state → WebSocket subscriptions.
    this.store.select(selectAllHoldings).subscribe(holdings => {
      this.heldSymbols = new Set(holdings.map(h => h.symbol));
    });
  }

  private initializeClient(): void {
    this.client = new Client({
      brokerURL: environment.wsUrl,
      // WHY STOMP over raw WebSocket?
      // STOMP adds topics, subscriptions, ack/nack, heartbeats.
      // "/topic/prices/RELIANCE" is meaningful routing, not raw bytes.

      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      // WHY heartbeats? Detect dead connections within ~4 seconds.
      // Without them, a dropped network connection could go undetected for minutes.

      reconnectDelay: 5000,
      // WHY auto-reconnect? Network drops happen.
      // Trading app must reconnect automatically without user intervention.

      onConnect: () => {
        console.log('WebSocket connected to', environment.wsUrl);
        this.connectionStatus$.next('connected');
        this.resubscribeAll();
        // WHY resubscribe on connect? After reconnection, STOMP subscriptions
        // are lost. We re-subscribe to all active symbols automatically.
      },

      onDisconnect: () => {
        console.log('WebSocket disconnected');
        this.connectionStatus$.next('disconnected');
      },

      onStompError: (frame) => {
        console.error('STOMP error:', frame);
        this.connectionStatus$.next('error');
      }
    });
  }

  // WHY not check isActive() before activate()?
  // @stomp/stompjs Client.activate() is idempotent — calling it when already
  // connected is a no-op. Multiple components calling connect() is safe.
  connect(jwt?: string): void {
    if (jwt) {
      this.client.connectHeaders = { Authorization: `Bearer ${jwt}` };
    }
    this.client.activate();
  }

  disconnect(): void {
    this.notificationUserId = null;
    this.client.deactivate();
  }

  /**
   * Subscribe to live price ticks for a symbol.
   * On each tick:
   * 1. Dispatch MarketActions.updateQuote → updates market state (watchlist prices)
   * 2. If user holds this symbol, dispatch PortfolioActions.updateHoldingPrice → updates P&L
   *
   * WHY dispatch to NgRx instead of returning Observable?
   * Sprint 1: returned Observable<PriceTick> for direct component subscription.
   * Sprint 2: NgRx state is the single source of truth. Components subscribe to
   * market/portfolio state selectors. WebSocket dispatches actions → state updates →
   * all subscribed components re-render. Cleaner, no component-level subscriptions.
   */
  subscribeToSymbol(symbol: string): void {
    if (!this.client.connected || this.stompSubscriptions.has(symbol)) {
      return;
    }
    this.addStompSubscription(symbol);
  }

  unsubscribeFromSymbol(symbol: string): void {
    const sub = this.stompSubscriptions.get(symbol);
    if (sub) {
      sub.unsubscribe();
      this.stompSubscriptions.delete(symbol);
    }
  }

  subscribeToWatchlist(symbols: string[]): void {
    symbols.forEach(symbol => this.subscribeToSymbol(symbol));
  }

  /**
   * Subscribe to real-time user notifications (price alerts, order fills).
   *
   * WHY per-user topic (/topic/notifications/{userId})?
   * websocket-gateway's NotificationConsumer publishes to /topic/notifications/{userId}.
   * Only the user with that exact UUID subscribed will receive the message.
   * Other users' notifications are routed to their own UUID topics.
   *
   * WHY store userId for reconnect?
   * If the WebSocket disconnects (e.g. network hiccup), resubscribeAll() is called
   * on reconnect. We need the userId to re-subscribe to the notification topic.
   * The notificationUserId field survives disconnect/reconnect.
   *
   * @param userId - The user's UUID from the JWT (UserInfo.id)
   */
  subscribeToNotifications(userId: string): void {
    this.notificationUserId = userId;
    if (!this.client.connected) {
      // Client not yet connected — resubscribeAll() will call this after connect
      return;
    }
    this.addNotificationSubscription(userId);
  }

  /** Unsubscribes from the notification topic. Called on logout. */
  unsubscribeFromNotifications(): void {
    if (!this.notificationUserId) return;
    const key = NOTIF_KEY_PREFIX + this.notificationUserId;
    const sub = this.stompSubscriptions.get(key);
    if (sub) {
      sub.unsubscribe();
      this.stompSubscriptions.delete(key);
    }
    this.notificationUserId = null;
  }

  private addStompSubscription(symbol: string): void {
    // WHY /topic/prices/{symbol}?
    // websocket-gateway broadcasts to /topic/prices/RELIANCE for RELIANCE ticks.
    // Per-symbol subscription means Angular only receives ticks for its watchlist.
    const sub = this.client.subscribe(
      `/topic/prices/${symbol}`,
      (message) => {
        try {
          const tick: PriceTick = JSON.parse(message.body);

          // WHY market hours gate? Prices should not tick outside NSE trading hours.
          // Mirrors real brokerage UX (Zerodha, Groww) where live updates stop at 3:30 PM.
          if (!this.marketHours.isOpen()) return;

          // Update market watchlist state with live price
          this.store.dispatch(MarketActions.updateQuote({
            symbol: tick.symbol,
            price: tick.price,
            change: tick.change,
            changePercent: tick.changePercent
          }));

          // If user holds this symbol, update portfolio P&L too
          if (this.heldSymbols.has(tick.symbol)) {
            this.store.dispatch(PortfolioActions.updateHoldingPrice({
              symbol: tick.symbol,
              currentPrice: tick.price
            }));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket tick:', e);
        }
      }
    );
    this.stompSubscriptions.set(symbol, sub);
  }

  private addNotificationSubscription(userId: string): void {
    const key = NOTIF_KEY_PREFIX + userId;
    if (this.stompSubscriptions.has(key)) return; // already subscribed

    const sub = this.client.subscribe(
      `/topic/notifications/${userId}`,
      (message) => {
        try {
          // WHY any? The notification shape is dynamic — type, symbol, message fields
          // differ per notification type. We check fields explicitly below.
          const notif = JSON.parse(message.body) as {
            type?: string;
            symbol?: string;
            message?: string;
          };

          const type = (notif.type ?? 'PRICE_ALERT') as NotificationType;
          const symbol = notif.symbol;
          const body = notif.message ?? 'You have a new notification';

          // WHY NotificationService.add()? Centralises bell badge increment + panel update.
          // The shell's badge uses NotificationService.unreadCount signal — reactive.
          this.notifSvc.add(type, this.buildTitle(type, symbol), body, symbol);
        } catch (e) {
          console.error('Failed to parse notification:', e);
        }
      }
    );
    this.stompSubscriptions.set(key, sub);
  }

  // WHY a helper for titles? The Kafka message contains the full body but no
  // pre-formatted title. We derive it from the type + symbol for consistency
  // with how NotificationService.notifyPriceAlert() formats its title.
  private buildTitle(type: NotificationType, symbol?: string): string {
    const sym = symbol ? ` — ${symbol}` : '';
    switch (type) {
      case 'PRICE_ALERT':      return `Price Alert${sym}`;
      case 'ORDER_FILLED':     return `Order Filled${sym}`;
      case 'ORDER_CANCELLED':  return `Order Cancelled${sym}`;
      case 'CORPORATE_ACTION': return `Corporate Action${sym}`;
      case 'MARKET_OPEN':      return 'Market Open';
      case 'MARKET_CLOSE':     return 'Market Closed';
      default:                 return `Notification${sym}`;
    }
  }

  private resubscribeAll(): void {
    // WHY filter by NOTIF_KEY_PREFIX? Symbol subscriptions and notification subscriptions
    // use different STOMP destinations and different handler logic.
    // We separate them here so each is re-added via its own dedicated helper.
    const symbolKeys = [...this.stompSubscriptions.keys()]
      .filter(k => !k.startsWith(NOTIF_KEY_PREFIX));

    this.stompSubscriptions.clear(); // STOMP subscriptions are gone after reconnect

    // Re-subscribe to all price symbols
    symbolKeys.forEach(symbol => this.addStompSubscription(symbol));

    // Re-subscribe to user notifications if we have a userId
    // WHY check notificationUserId separately? It's stored even when stompSubscriptions
    // is cleared, so we never lose the userId on reconnect.
    if (this.notificationUserId) {
      this.addNotificationSubscription(this.notificationUserId);
    }
  }

  ngOnDestroy(): void {
    this.client.deactivate();
  }
}
