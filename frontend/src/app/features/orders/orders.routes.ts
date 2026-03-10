// Orders feature routes
// Sprint 2: buy/sell order form, order book, order history table.
import { Routes } from '@angular/router';

export const ORDERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./orders.component').then(m => m.OrdersComponent),
    title: 'Orders — TradeForge'
  }
];

// WHY a separate PLACE_ORDER_ROUTES?
// Registered at /place-order in app.routes so the Dashboard "New Order" button
// lands on a distraction-free form page — no pending/history clutter.
export const PLACE_ORDER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./place-order/place-order.component').then(m => m.PlaceOrderComponent),
    title: 'Place Order — TradeForge'
  }
];
