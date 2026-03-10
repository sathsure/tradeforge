// WHY AlertService?
// Centralizes all HTTP calls for price alert CRUD.
// The price alert backend is in market-service, routed via /api/alerts.
// JWT is sent automatically by the authInterceptor — no manual header needed here.

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PriceAlert } from '../models/market.models';

@Injectable({ providedIn: 'root' })
export class AlertService {

  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/alerts`;

  /** GET /api/alerts — all active alerts for the logged-in user */
  getAlerts(): Observable<PriceAlert[]> {
    return this.http.get<PriceAlert[]>(this.base);
  }

  /**
   * POST /api/alerts — create a price alert.
   * condition: 'ABOVE' fires when price >= targetPrice
   * condition: 'BELOW' fires when price <= targetPrice
   */
  createAlert(
    symbol: string,
    targetPrice: number,
    condition: 'ABOVE' | 'BELOW'
  ): Observable<PriceAlert> {
    return this.http.post<PriceAlert>(this.base, { symbol, targetPrice, condition });
  }

  /** DELETE /api/alerts/{id} — remove an alert (also happens automatically when it fires) */
  deleteAlert(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
