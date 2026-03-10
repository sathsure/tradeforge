// WHY a dedicated ToastEffects?
// All toast notifications are side-effects of NgRx actions.
// Putting them here keeps each feature's effects focused on its own API calls.
// One centralized file owns ALL notification messages — easy to update copy.

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';
import { ToastService } from '../services/toast.service';

import { AuthActions } from '../../features/auth/state/auth.actions';
import { OrderActions } from '../../features/orders/state/order.actions';
import { PortfolioActions } from '../../features/portfolio/state/portfolio.actions';
import { MarketActions } from '../../features/markets/state/market.actions';

@Injectable()
export class ToastEffects {

  private readonly actions$ = inject(Actions);
  private readonly toast = inject(ToastService);

  // ══ AUTH ════════════════════════════════════════════════════════════════════

  loginFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginFailure),
      tap(({ error }) => {
        const msg = error?.toLowerCase().includes('bad credentials') || error?.toLowerCase().includes('invalid')
          ? 'Wrong email or password — give it another shot!'
          : error ?? 'Something went sideways. Please try again.';
        this.toast.error('Login Failed', msg);
      })
    ), { dispatch: false }
  );

  registerFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.registerFailure),
      tap(({ error }) => {
        if (error?.toLowerCase().includes('already registered')) return; // handled by snackbar in register component
        this.toast.error('Registration Failed', error ?? 'Could not create your account. Please try again.');
      })
    ), { dispatch: false }
  );

  verifyRegistrationFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyRegistrationFailure),
      tap(({ error }) => {
        if (error?.toLowerCase().includes('too many') || error?.toLowerCase().includes('attempts')) {
          this.toast.error('Too Many Attempts', 'Account locked — restart registration to try again.');
        } else if (error?.toLowerCase().includes('expired')) {
          this.toast.error('Code Expired', 'Your code has expired — tap Resend for a fresh one!');
        }
        // Other cases handled inline in the component with attempt count
      })
    ), { dispatch: false }
  );


  resendOtpSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.registerVerificationRequired),
      // WHY no filter? registerVerificationRequired fires both on first register AND resend.
      // We only want to show "resent" toast on resend — handled by the register component
      // navigating away on first register, so this toast only shows on verify page.
    ), { dispatch: false }
  );

  verifyOtpFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyOtpFailure),
      tap(({ error }) => {
        this.toast.error('2FA Failed', error ?? 'Invalid code — try again or request a new one.');
      })
    ), { dispatch: false }
  );

  verifyWebauthnFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.verifyWebauthnFailure),
      tap(({ error }) => {
        this.toast.error('Biometric Failed', error ?? 'Couldn\'t verify your identity. Try again.');
      })
    ), { dispatch: false }
  );

  logoutSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logoutSuccess),
      tap(() => {
        this.toast.success('Logged Out', 'See you next session — trade safe!');
      })
    ), { dispatch: false }
  );

  // ══ ORDERS ══════════════════════════════════════════════════════════════════

  placeOrderSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.placeOrderSuccess),
      tap(({ order }) => {
        const filled = order.status === 'COMPLETE';
        if (filled) {
          this.toast.success(
            'Order Filled!',
            `${order.transactionType} ${order.quantity} × ${order.symbol} @ ₹${order.price?.toFixed(2) ?? 'market'} — you\'re in!`
          );
        } else {
          this.toast.success(
            'Order Placed',
            `${order.transactionType} ${order.quantity} × ${order.symbol} queued — waiting for the right moment.`
          );
        }
      })
    ), { dispatch: false }
  );

  placeOrderFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.placeOrderFailure),
      tap(({ error }) => {
        this.toast.error('Order Rejected', error ?? 'Your order didn\'t go through — check your funds or try again.');
      })
    ), { dispatch: false }
  );

  cancelOrderSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.cancelOrderSuccess),
      tap(({ order }) => {
        this.toast.success('Order Cancelled', `${order.symbol} order cancelled — no damage done.`);
      })
    ), { dispatch: false }
  );

  cancelOrderFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.cancelOrderFailure),
      tap(({ error }) => {
        this.toast.error('Cancel Failed', error ?? 'Couldn\'t cancel the order. It may have already been filled.');
      })
    ), { dispatch: false }
  );

  loadOrdersFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.loadOrdersFailure),
      tap(({ error }) => {
        this.toast.error('Orders Unavailable', error ?? 'Couldn\'t fetch your orders. Pull to refresh.');
      })
    ), { dispatch: false }
  );

  // ══ PORTFOLIO ═══════════════════════════════════════════════════════════════

  loadPortfolioFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PortfolioActions.loadPortfolioFailure),
      tap(({ error }) => {
        this.toast.error('Portfolio Unavailable', error ?? 'Holdings failed to load — we\'re on it.');
      })
    ), { dispatch: false }
  );

  // ══ MARKETS ═════════════════════════════════════════════════════════════════

  loadWatchlistFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.loadWatchlistFailure),
      tap(({ error }) => {
        this.toast.error('Market Data Unavailable', error ?? 'Live prices couldn\'t load — please refresh.');
      })
    ), { dispatch: false }
  );

  searchFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.searchSymbolFailure),
      tap(() => {
        this.toast.error('Search Failed', 'Couldn\'t find that symbol — check your spelling and try again.');
      })
    ), { dispatch: false }
  );
}
