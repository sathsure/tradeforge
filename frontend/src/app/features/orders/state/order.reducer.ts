// WHY a reducer for orders?
// Reducers define HOW the state changes in response to actions.
// Pure function: (state, action) => newState
// No side effects — only state transformation. Effects handle side effects.

import { createFeature, createReducer, on } from '@ngrx/store';
import { OrderResponse } from '../../../core/models/order.models';
import { OrderActions } from './order.actions';

export interface OrderState {
  orders: OrderResponse[];
  loading: boolean;
  placing: boolean;         // WHY separate? Placing an order uses a different loading state (the form button)
  error: string | null;
  selectedSymbol: string;   // Pre-fills the order form when navigating from watchlist
}

const initialState: OrderState = {
  orders: [],
  loading: false,
  placing: false,
  error: null,
  selectedSymbol: '',
};

/**
 * WHY createFeature?
 * createFeature automatically creates the feature selector and all sub-selectors.
 * The 'name' becomes the key in the root state: state.orders
 * No need to manually write selectOrders, selectLoading etc. — auto-generated.
 */
export const orderFeature = createFeature({
  name: 'orders',
  reducer: createReducer(
    initialState,

    // ── Load Orders ─────────────────────────────────────────────────────────
    on(OrderActions.loadOrders, state => ({
      ...state,
      loading: true,
      error: null
    })),
    on(OrderActions.loadOrdersSuccess, (state, { orders }) => ({
      ...state,
      loading: false,
      orders
    })),
    on(OrderActions.loadOrdersFailure, (state, { error }) => ({
      ...state,
      loading: false,
      error
    })),

    // ── Place Order ──────────────────────────────────────────────────────────
    on(OrderActions.placeOrder, state => ({
      ...state,
      placing: true,
      error: null
    })),
    on(OrderActions.placeOrderSuccess, (state, { order }) => ({
      ...state,
      placing: false,
      // WHY unshift (prepend)? Most recent order appears at the top of the list.
      orders: [order, ...state.orders]
    })),
    on(OrderActions.placeOrderFailure, (state, { error }) => ({
      ...state,
      placing: false,
      error
    })),

    // ── Cancel Order ─────────────────────────────────────────────────────────
    on(OrderActions.cancelOrderSuccess, (state, { order }) => ({
      ...state,
      // WHY map? Replaces the cancelled order in the list — no reload needed.
      orders: state.orders.map(o => o.id === order.id ? order : o)
    })),
    on(OrderActions.cancelOrderFailure, (state, { error }) => ({
      ...state,
      error
    })),

    // ── UI State ──────────────────────────────────────────────────────────────
    on(OrderActions.clearOrderError, state => ({
      ...state,
      error: null
    })),
    on(OrderActions.setSelectedSymbol, (state, { symbol }) => ({
      ...state,
      selectedSymbol: symbol
    })),
    on(OrderActions.clearOrders, () => initialState)
  )
});

export const {
  name,
  reducer,
  selectOrdersState,
  selectOrders,
  selectLoading,
  selectPlacing,
  selectError,
  selectSelectedSymbol,
} = orderFeature;
