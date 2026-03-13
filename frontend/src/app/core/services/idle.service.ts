import { Injectable, NgZone, inject } from '@angular/core';
import { fromEvent, merge, timer, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';

// WHY IdleService?
// After 5 minutes of no user interaction, prompt the user to confirm they're still active.
// Auto-logout protects the trading account if the user forgets to close the browser.
// Common in banking and brokerage apps (HDFC Securities, Zerodha timeout after inactivity).
@Injectable({ providedIn: 'root' })
export class IdleService {
  private readonly ngZone = inject(NgZone);
  private readonly destroy$ = new Subject<void>();

  // WHY Observable (not EventEmitter)? Observables are composable, cancellable, and testable.
  // EventEmitter is Angular-specific and doesn't work well with RxJS operators.
  private readonly idleSubject = new Subject<void>();
  readonly idle$ = this.idleSubject.asObservable();

  // 5 minutes in ms
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000;

  // WHY NgZone.runOutsideAngular?
  // Event listeners (mousemove, keydown) fire thousands of times.
  // Running inside Angular zone would trigger change detection on every mousemove — severe perf hit.
  // We only enter the zone when we actually need to emit the idle signal.
  startWatching(): void {
    this.ngZone.runOutsideAngular(() => {
      const events$ = merge(
        fromEvent(document, 'mousemove'),
        fromEvent(document, 'keydown'),
        fromEvent(document, 'click'),
        fromEvent(document, 'touchstart'),
        fromEvent(document, 'scroll'),
      );

      events$.pipe(
        debounceTime(300), // WHY debounce? Mousemove fires 60fps — we don't need 60 resets/sec.
        switchMap(() =>
          timer(this.IDLE_TIMEOUT).pipe(takeUntil(this.destroy$))
        ),
        takeUntil(this.destroy$)
      ).subscribe(() => {
        // Re-enter Angular zone to trigger change detection when emitting the idle signal.
        this.ngZone.run(() => this.idleSubject.next());
      });
    });
  }

  reset(): void {
    // Simulate user activity to reset the timer by re-triggering a mousemove event.
    // This is the simplest way to reset the switchMap-based timer.
    document.dispatchEvent(new MouseEvent('mousemove'));
  }

  stopWatching(): void {
    this.destroy$.next();
  }
}
