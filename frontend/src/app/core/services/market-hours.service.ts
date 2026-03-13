import { Injectable, signal } from '@angular/core';
import { interval } from 'rxjs';

// WHY MarketHoursService?
// Single source of truth for NSE market open/closed status.
// ShellComponent uses it for the status dot; WebSocketService uses it
// to gate live price dispatches — prices stop ticking outside trading hours
// just like real brokerage platforms (Zerodha, Groww, Kite).
@Injectable({ providedIn: 'root' })
export class MarketHoursService {

  // WHY signal? Reactive, fine-grained — only affected bindings re-evaluate.
  readonly isOpen = signal<boolean>(false);

  constructor() {
    // Set initial value immediately — don't wait 30s
    this.isOpen.set(this.checkMarketOpen());
    // WHY 30000ms interval? Opening/closing bell precision is fine at 30s granularity.
    // No need for per-second polling — the clock in ShellComponent already handles seconds.
    interval(30_000).subscribe(() => this.isOpen.set(this.checkMarketOpen()));
  }

  // NSE market hours: 9:15 AM – 3:30 PM IST, Monday–Friday only.
  // WHY IST conversion? The user's browser may be in any timezone.
  // We convert to IST (UTC+5:30) to check against NSE trading hours.
  checkMarketOpen(): boolean {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;

    const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
    const ist = new Date(utcMs + 5.5 * 3_600_000);
    const total = ist.getHours() * 60 + ist.getMinutes();
    // NSE: 9:15 AM (555 min) – 3:30 PM (930 min)
    return total >= 555 && total < 930;
  }
}
