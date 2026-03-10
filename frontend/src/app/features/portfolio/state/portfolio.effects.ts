// WHY Portfolio Effects?
// Handles:
// 1. Loading portfolio data from portfolio-service via API Gateway
// 2. Refreshing portfolio after orders are placed (triggered by OrderEffects)

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { HttpClient } from '@angular/common/http';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { PortfolioActions, Holding, PortfolioSummary } from './portfolio.actions';
import { environment } from '../../../../environments/environment';

interface PortfolioApiResponse {
  holdings: Holding[];
  summary: PortfolioSummary;
}

@Injectable()
export class PortfolioEffects {

  private readonly actions$ = inject(Actions);
  private readonly http = inject(HttpClient);

  // ── Load Portfolio ─────────────────────────────────────────────────────────
  // WHY handle both loadPortfolio and refreshPortfolio?
  // Load = initial page load. Refresh = re-fetch after order placement.
  // Same HTTP call, different trigger — DRY.
  loadPortfolio$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PortfolioActions.loadPortfolio, PortfolioActions.refreshPortfolio),
      switchMap(() =>
        this.http.get<PortfolioApiResponse>(
          `${environment.apiUrl}/api/portfolio`
        ).pipe(
          map(response => PortfolioActions.loadPortfolioSuccess({
            holdings: response.holdings,
            summary: response.summary
          })),
          catchError(error =>
            of(PortfolioActions.loadPortfolioFailure({
              error: error?.error?.message ?? error?.message ?? 'Failed to load portfolio'
            }))
          )
        )
      )
    )
  );
}
