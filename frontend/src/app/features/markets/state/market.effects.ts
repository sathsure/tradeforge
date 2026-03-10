// WHY Market Effects?
// Market data requires multiple async sources:
// 1. HTTP API: initial batch of quotes when watchlist loads (current snapshot)
// 2. WebSocket: live ticks dispatched by WebSocketService (ongoing updates)
//
// Effects handle async operations and dispatch result actions.
// Components remain pure — they only subscribe to state.

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { HttpClient } from '@angular/common/http';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MarketActions, StockQuote } from './market.actions';
import { environment } from '../../../../environments/environment';

@Injectable()
export class MarketEffects {

  private readonly actions$ = inject(Actions);
  private readonly http = inject(HttpClient);

  // ── Load Watchlist ─────────────────────────────────────────────────────────
  // WHY HTTP for initial load + WebSocket for updates?
  // WebSocket only sends price CHANGES — not current snapshots.
  // On page load, we need the full current price for every watchlist symbol.
  // HTTP gives us the current snapshot; WebSocket keeps it fresh.
  loadWatchlist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.loadWatchlist),
      switchMap(() =>
        this.http.get<StockQuote[]>(
          `${environment.apiUrl}/api/markets/quotes?symbols=RELIANCE,TCS,INFY,HDFCBANK,ICICIBANK,WIPRO,BAJFINANCE,MARUTI,SUNPHARMA,TITAN,LTIM,AXISBANK,KOTAKBANK,SBIN,HINDUNILVR`
        ).pipe(
          map(quotes => MarketActions.loadWatchlistSuccess({ quotes })),
          catchError(error =>
            of(MarketActions.loadWatchlistFailure({
              error: error?.error?.message ?? error?.message ?? 'Failed to load market data'
            }))
          )
        )
      )
    )
  );

  // ── Search Symbol ──────────────────────────────────────────────────────────
  // Calls market-service /api/markets/search?q=query
  // WHY switchMap? If the user types quickly (RELIANCE → RELI → REL),
  // switchMap cancels the previous HTTP request and only processes the latest.
  searchSymbol$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.searchSymbol),
      switchMap(({ query }) =>
        this.http.get<StockQuote[]>(
          `${environment.apiUrl}/api/markets/search?q=${encodeURIComponent(query)}`
        ).pipe(
          map(results => MarketActions.searchSymbolSuccess({ results })),
          catchError(error =>
            of(MarketActions.searchSymbolFailure({
              error: error?.error?.message ?? error?.message ?? 'Search failed'
            }))
          )
        )
      )
    )
  );
}
