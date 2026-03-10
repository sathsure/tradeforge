// WHY separate order.models.ts?
// Keeps model definitions separate from service logic.
// All order-related types are imported from one place — consistent across
// NgRx state, service calls, and component bindings.

export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type TransactionType = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'COMPLETE' | 'CANCELLED' | 'REJECTED';

/**
 * WHY OrderRequest?
 * The payload Angular sends to POST /api/orders.
 * Matches the OrderRequest record in order-service backend.
 */
export interface OrderRequest {
  symbol: string;
  orderType: OrderType;
  transactionType: TransactionType;
  quantity: number;
  price?: number;        // Required for LIMIT orders, omitted for MARKET
  triggerPrice?: number; // Required for SL / SL-M orders
}

/**
 * WHY OrderResponse?
 * The shape returned by the backend for every order.
 * Matches OrderResponse record in order-service backend.
 */
export interface OrderResponse {
  id: string;
  symbol: string;
  orderType: OrderType;
  transactionType: TransactionType;
  quantity: number;
  price: number | null;
  status: OrderStatus;
  filledQty: number;
  avgPrice: number | null;
  placedAt: string; // ISO datetime string from backend
}
