// WHY MarketService?
// Centralizes ALL HTTP calls to market-service endpoints.
// Components and effects inject this service — no HTTP logic scattered in components.
// Typed return values give Angular compile-time safety + IDE autocompletion.

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StockQuote, StockDetail, StockDetailResponse,
  CandleBar, OrderBook, MutualFund, CorporateAction
} from '../models/market.models';

@Injectable({ providedIn: 'root' })
export class MarketService {

  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/markets`;

  // ─── Live Quotes ────────────────────────────────────────────────────────────

  /** GET /api/markets/quotes — all watchlist quotes */
  getAllQuotes(): Observable<StockQuote[]> {
    return this.http.get<StockQuote[]>(`${this.base}/quotes`);
  }

  /** GET /api/markets/quotes/{symbol} — single quote */
  getQuote(symbol: string): Observable<StockQuote> {
    return this.http.get<StockQuote>(`${this.base}/quotes/${symbol}`);
  }

  /** GET /api/markets/search?q= — quick symbol/name search */
  searchQuotes(q: string): Observable<StockQuote[]> {
    return this.http.get<StockQuote[]>(`${this.base}/search`, { params: { q } });
  }

  // ─── Screener & Stock Detail ─────────────────────────────────────────────────

  /**
   * GET /api/markets/stocks/screener — fundamental screener.
   * WHY optional params? All filters are optional — unfiltered = full stock list.
   */
  screener(q?: string, sector?: string, sortBy?: string): Observable<StockDetail[]> {
    let params = new HttpParams();
    if (q)      params = params.set('q', q);
    if (sector) params = params.set('sector', sector);
    if (sortBy) params = params.set('sortBy', sortBy);
    return this.http.get<StockDetail[]>(`${this.base}/stocks/screener`, { params });
  }

  /** GET /api/markets/stocks/{symbol}/detail — full detail + corporate actions */
  getStockDetail(symbol: string): Observable<StockDetailResponse> {
    return this.http.get<StockDetailResponse>(`${this.base}/stocks/${symbol}/detail`);
  }

  /**
   * GET /api/markets/stocks/{symbol}/history — OHLCV bars for chart.
   * WHY default period '1M'? Most traders start with a monthly view for context.
   */
  getStockHistory(symbol: string, period = '1M'): Observable<CandleBar[]> {
    return this.http.get<CandleBar[]>(
      `${this.base}/stocks/${symbol}/history`,
      { params: { period } }
    );
  }

  /** GET /api/markets/stocks/{symbol}/orderbook — Level 2 market depth */
  getOrderBook(symbol: string): Observable<OrderBook> {
    return this.http.get<OrderBook>(`${this.base}/stocks/${symbol}/orderbook`);
  }

  // ─── Mutual Funds ────────────────────────────────────────────────────────────

  /** GET /api/markets/mutual-funds — MF screener list */
  getMutualFunds(q?: string, category?: string): Observable<MutualFund[]> {
    let params = new HttpParams();
    if (q)        params = params.set('q', q);
    if (category) params = params.set('category', category);
    return this.http.get<MutualFund[]>(`${this.base}/mutual-funds`, { params });
  }

  /** GET /api/markets/mutual-funds/{code}/nav — NAV history for chart */
  getMutualFundNav(code: string, period = '1Y'): Observable<CandleBar[]> {
    return this.http.get<CandleBar[]>(
      `${this.base}/mutual-funds/${code}/nav`,
      { params: { period } }
    );
  }
}
