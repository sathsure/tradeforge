// WHY order.service.ts?
// Centralizes all HTTP calls to the order-service backend.
// NgRx effects inject this service — they don't make HTTP calls directly.
// This layer is easily mockable in tests and swappable if the API changes.

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OrderRequest, OrderResponse } from '../models/order.models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrderService {

  private readonly http = inject(HttpClient);
  // WHY environment.apiUrl? Routes through API Gateway (8080), not directly to order-service (8084).
  // API Gateway handles auth token forwarding, load balancing, and routing.
  private readonly baseUrl = `${environment.apiUrl}/api/orders`;

  /**
   * GET /api/orders
   * Returns all orders for the authenticated user.
   * The auth.interceptor automatically adds the Bearer token header.
   */
  getOrders(): Observable<OrderResponse[]> {
    return this.http.get<OrderResponse[]>(this.baseUrl);
  }

  /**
   * POST /api/orders
   * Places a new BUY or SELL order.
   * Returns the created order with status PENDING or COMPLETE.
   *
   * WHY Observable<OrderResponse> not Promise?
   * NgRx effects work with Observables — consistency with the reactive pattern.
   * Observables allow retry, timeout, and cancellation operators.
   */
  placeOrder(request: OrderRequest): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(this.baseUrl, request);
  }

  /**
   * DELETE /api/orders/{id}
   * Cancels a PENDING order. Returns the order with status=CANCELLED.
   */
  cancelOrder(id: string): Observable<OrderResponse> {
    return this.http.delete<OrderResponse>(`${this.baseUrl}/${id}`);
  }

  /**
   * PATCH /api/orders/{id}
   * Modifies price or quantity of a PENDING LIMIT/SL order.
   * WHY PATCH? Only send the fields you want to change — not a full replacement.
   */
  modifyOrder(id: string, quantity: number, price: number): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(`${this.baseUrl}/${id}`, { quantity, price });
  }
}
