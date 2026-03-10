// WHY a Shell Component?
// The Shell is the persistent "chrome" (frame) of the authenticated app.
// It contains the sidebar, topbar, and <router-outlet> for feature pages.
// It loads ONLY for authenticated routes — login/register are full-screen.

import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, interval, Subscription, combineLatest, filter, take } from 'rxjs';

import { MatIconModule }    from '@angular/material/icon';
import { MatButtonModule }  from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule }   from '@angular/material/badge';

import { AuthActions }                        from '../../../features/auth/state/auth.actions';
import { selectCurrentUser, selectAccessToken } from '../../../features/auth/state/auth.selectors';
import { UserInfo }                           from '../../../core/models/auth.models';
import { NotificationService }                from '../../../core/services/notification.service';
import { WebSocketService }                   from '../../../core/services/websocket.service';
import { NotificationPanelComponent }         from '../notification-panel/notification-panel.component';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
    MatBadgeModule,
    NotificationPanelComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {

  private readonly store    = inject(Store);
  // WHY inject NotificationService here? Shell owns the notification bell badge.
  // unreadCount signal drives the badge number — reactive without subscriptions.
  readonly notifSvc = inject(NotificationService);
  // WHY inject WebSocketService here?
  // Shell loads immediately after login (protected route root component).
  // Connecting WebSocket here ensures market prices arrive on Dashboard before
  // the user navigates to Markets, giving instant live data on the first screen.
  // Shell also subscribes to the user's notification topic so price alerts
  // are delivered no matter which page the user is on.
  private readonly wsSvc    = inject(WebSocketService);
  private clockSub?: Subscription;
  private wsSub?: Subscription;

  currentUser$: Observable<UserInfo | null> = this.store.select(selectCurrentUser);

  // WHY signal for notifPanelOpen? Local UI state — toggling a panel doesn't need NgRx.
  readonly notifPanelOpen = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard',    icon: 'dashboard',        path: '/dashboard'    },
    { label: 'Watchlist',    icon: 'candlestick_chart', path: '/markets'      },
    { label: 'Screener',     icon: 'manage_search',     path: '/screener'     },
    { label: 'Mutual Funds', icon: 'account_balance',   path: '/mutual-funds' },
    { label: 'Orders',       icon: 'receipt_long',      path: '/orders'       },
    { label: 'Portfolio',    icon: 'pie_chart',         path: '/portfolio'    },
    { label: 'Alerts',       icon: 'notifications_active', path: '/alerts'    },
    { label: 'Settings',     icon: 'settings',          path: '/settings'     },
    // WHY Settings at the bottom? Convention from Kite, Robinhood, Zerodha —
    // settings is a secondary action, placed after primary navigation items.
  ];

  // WHY signal for the live clock?
  // Signals give fine-grained reactivity — only the {{currentTime()}} interpolation
  // re-evaluates every second, not the whole component.
  // Using a plain property + manual change detection would be more complex.
  currentTime = signal<Date>(new Date());

  // Whether the market is currently open (IST 9:15 AM – 3:30 PM, Mon–Fri)
  marketOpen = signal<boolean>(false);

  ngOnInit(): void {
    // WHY interval(1000)?
    // Updates the clock every second for a live trading terminal feel.
    // Real trading apps (Bloomberg, Kite) show live seconds — conveys real-time data.
    // interval() is RxJS — fires every 1000ms, never drifts like setInterval.
    // WHY subscription + OnDestroy? Must unsubscribe when shell is destroyed.
    // Without unsubscribe: memory leak — interval keeps firing after logout.
    this.clockSub = interval(1000).subscribe(() => {
      const now = new Date();
      this.currentTime.set(now);
      this.marketOpen.set(this.isMarketOpen(now));
    });
    // Set initial market status immediately (don't wait 1 second)
    this.marketOpen.set(this.isMarketOpen(new Date()));

    // ── WebSocket + Notification subscription ───────────────────────────────
    // WHY combineLatest? We need BOTH the token (to authenticate WS) AND the user
    // (to subscribe to their notification topic). combineLatest emits when both are ready.
    //
    // WHY filter(...)? State starts null — wait until both values are present.
    // WHY take(1)? We only need to connect/subscribe once per login session.
    // If the token refreshes, the WS connection stays alive (JWT is used only at connect).
    this.wsSub = combineLatest([
      this.store.select(selectAccessToken),
      this.store.select(selectCurrentUser),
    ]).pipe(
      filter(([token, user]) => !!token && !!user),
      take(1),
    ).subscribe(([token, user]) => {
      if (token && user) {
        // Connect WebSocket with JWT for server-side auth header
        this.wsSvc.connect(token);
        // Subscribe to this user's personal notification topic.
        // If WS isn't connected yet, subscribeToNotifications() stores the userId
        // and resubscribeAll() sets up the subscription once connected.
        this.wsSvc.subscribeToNotifications(user.id);
      }
    });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    // WHY optional chaining (.?)? Shell might be destroyed before subscription is set.
    // Defensive programming: always clean up observables to prevent memory leaks.
  }

  // WHY separate method?
  // Keeps the business logic (market hours) out of the template and ngOnInit.
  // Testable: we can unit test isMarketOpen() independently.
  private isMarketOpen(now: Date): boolean {
    const day = now.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false; // Weekend

    // Convert to IST (UTC+5:30) for correct market hours check
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utcMs + (5.5 * 3600000));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const totalMinutes = h * 60 + m;

    // NSE market hours: 9:15 AM – 3:30 PM IST
    const marketStart = 9 * 60 + 15;   // 555
    const marketEnd   = 15 * 60 + 30;  // 930
    return totalMinutes >= marketStart && totalMinutes < marketEnd;
  }

  toggleNotifPanel(): void {
    this.notifPanelOpen.update(v => !v);
  }

  logout(): void {
    this.store.dispatch(AuthActions.logout());
  }

  getInitials(user: UserInfo): string {
    return user.fullName
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }
}
