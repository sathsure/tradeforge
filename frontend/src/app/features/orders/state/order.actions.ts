// WHY NgRx Actions for orders?
// Every order operation (load, place, cancel) is an async side effect.
// NgRx Actions describe WHAT happened. Effects handle HOW (HTTP calls).
// Components dispatch actions — they don't call services directly.
// This makes components pure (no side effects) and fully testable.

import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { OrderRequest, OrderResponse } from '../../../core/models/order.models';

/**
 * WHY createActionGroup?
 * Groups related actions under a source namespace ('Orders').
 * Auto-generates success/failure pairs with correct typing.
 * Reduces boilerplate vs individual createAction() calls.
 *
 * Naming convention:
 * - "Load Orders" = user navigated to orders page
 * - "Place Order" = user submitted the buy/sell form
 * - "Cancel Order" = user clicked cancel on a PENDING order
 * - "*Success" / "*Failure" = async results dispatched by effects
 */
export const OrderActions = createActionGroup({
  source: 'Orders',
  events: {
    // ── Load all orders ───────────────────────────────────────────────
    'Load Orders': emptyProps(),
    'Load Orders Success': props<{ orders: OrderResponse[] }>(),
    'Load Orders Failure': props<{ error: string }>(),

    // ── Place a new order ─────────────────────────────────────────────
    'Place Order': props<{ request: OrderRequest }>(),
    'Place Order Success': props<{ order: OrderResponse }>(),
    'Place Order Failure': props<{ error: string }>(),

    // ── Cancel a pending order ────────────────────────────────────────
    'Cancel Order': props<{ id: string }>(),
    'Cancel Order Success': props<{ order: OrderResponse }>(),
    'Cancel Order Failure': props<{ error: string }>(),

    // ── UI state ──────────────────────────────────────────────────────
    // WHY a separate Clear Error action?
    // Lets the user dismiss error messages without triggering an API call.
    'Clear Order Error': emptyProps(),

    // WHY Set Selected Symbol?
    // When user clicks on a stock (from watchlist/portfolio), the order form
    // pre-fills with that symbol. This action bridges market → orders state.
    'Set Selected Symbol': props<{ symbol: string }>(),

    // WHY Clear Orders?
    // On logout, clear order history so a second user logging in doesn't see
    // the previous user's orders — data privacy between sessions.
    'Clear Orders': emptyProps(),
  }
});
