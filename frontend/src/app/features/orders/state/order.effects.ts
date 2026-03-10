// WHY NgRx Effects for orders?
// Effects are the middleware between actions and side effects.
// Actions describe intent. Effects execute the async work (HTTP calls)
// and dispatch success/failure actions with the result.
// Components remain pure — no HTTP calls, just action dispatches.

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { OrderActions } from './order.actions';
import { OrderService } from '../../../core/services/order.service';
import { PortfolioActions } from '../../portfolio/state/portfolio.actions';
import { Store } from '@ngrx/store';

@Injectable()
export class OrderEffects {

  private readonly actions$ = inject(Actions);
  private readonly orderService = inject(OrderService);
  private readonly store = inject(Store);

  // ── Load Orders ───────────────────────────────────────────────────────────
  loadOrders$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.loadOrders),
      switchMap(() =>
        this.orderService.getOrders().pipe(
          map(orders => OrderActions.loadOrdersSuccess({ orders })),
          catchError(error =>
            of(OrderActions.loadOrdersFailure({
              error: error?.error?.message ?? error?.message ?? 'Failed to load orders'
            }))
          )
        )
      )
    )
  );

  // ── Place Order ───────────────────────────────────────────────────────────
  placeOrder$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.placeOrder),
      switchMap(({ request }) =>
        this.orderService.placeOrder(request).pipe(
          map(order => OrderActions.placeOrderSuccess({ order })),
          catchError(error =>
            of(OrderActions.placeOrderFailure({
              error: error?.error?.message ?? error?.message ?? 'Order placement failed'
            }))
          )
        )
      )
    )
  );

  /**
   * WHY refreshPortfolio after placeOrderSuccess?
   * When an order completes (MARKET order fills immediately), the portfolio
   * holdings change. We trigger a portfolio refresh so the UI stays in sync.
   *
   * WHY dispatch a PortfolioActions action from OrderEffects?
   * Cross-feature effects are acceptable when there's a clear causal relationship.
   * An order completing → portfolio updating is a direct business rule.
   *
   * Alternative: portfolio-service already updates via Kafka, so the DB is current.
   * We just need the Angular state to reflect the DB state.
   */
  refreshPortfolioOnOrderSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.placeOrderSuccess),
      // WHY filter by status? Only refresh if the order was filled (COMPLETE).
      // PENDING orders don't change holdings yet — no refresh needed.
      tap(({ order }) => {
        if (order.status === 'COMPLETE') {
          this.store.dispatch(PortfolioActions.refreshPortfolio());
        }
      })
    ),
    { dispatch: false } // WHY dispatch: false? The tap already dispatches — no additional action needed.
  );

  // ── Cancel Order ──────────────────────────────────────────────────────────
  cancelOrder$ = createEffect(() =>
    this.actions$.pipe(
      ofType(OrderActions.cancelOrder),
      switchMap(({ id }) =>
        this.orderService.cancelOrder(id).pipe(
          map(order => OrderActions.cancelOrderSuccess({ order })),
          catchError(error =>
            of(OrderActions.cancelOrderFailure({
              error: error?.error?.message ?? error?.message ?? 'Cancel failed'
            }))
          )
        )
      )
    )
  );
}
