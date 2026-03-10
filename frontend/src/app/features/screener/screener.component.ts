// WHY Screener?
// Zerodha/Screener.in style fundamental analysis tool.
// Traders filter stocks by PE, ROE, MCap before taking positions.
// Client-side filtering + sorting gives instant feedback without API round-trips on every keystroke.

import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';

import { MarketService } from '../../core/services/market.service';
import { StockDetail } from '../../core/models/market.models';

type SortKey    = 'mcap' | 'pe_asc' | 'pe_desc' | 'roe' | 'div_yield' | 'change';
type PEFilter   = '' | 'lt15' | '15to25' | '25to40' | 'gt40';
type McapFilter = '' | 'large' | 'mid' | 'small';
type ROEFilter  = '' | 'gt15' | 'gt20' | 'gt25';
type DivFilter  = '' | 'gt1'  | 'gt2'  | 'gt3';

@Component({
  selector: 'app-screener',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule,
    MatTableModule, MatButtonModule,
  ],
  template: `
    <div class="screener-page">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">
            <mat-icon class="title-icon">manage_search</mat-icon>
            Stock Screener
          </h2>
          @if (!loading()) {
            <span class="result-count">{{ filtered().length }} stocks</span>
          }
        </div>
        <div class="header-controls">
          <mat-form-field class="search-field" appearance="outline">
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="searchCtrl" placeholder="Hunt the next multibagger…">
          </mat-form-field>
          <mat-form-field class="sort-field" appearance="outline">
            <mat-label>Sort by</mat-label>
            <mat-select [formControl]="sortCtrl">
              <mat-option value="mcap">Market Cap ↓</mat-option>
              <mat-option value="pe_asc">P/E Low→High</mat-option>
              <mat-option value="pe_desc">P/E High→Low</mat-option>
              <mat-option value="roe">ROE % ↓</mat-option>
              <mat-option value="div_yield">Div Yield ↓</mat-option>
              <mat-option value="change">Change % ↓</mat-option>
            </mat-select>
          </mat-form-field>
          <button class="filter-toggle-btn"
                  [class.filter-toggle-btn--on]="showFilters()"
                  (click)="showFilters.set(!showFilters())">
            <mat-icon>tune</mat-icon>
            Filters
            @if (activeFilterCount() > 0) {
              <span class="ftb-badge">{{ activeFilterCount() }}</span>
            }
          </button>
        </div>
      </div>

      <!-- Sector filter chips -->
      <div class="sector-chips">
        @for (s of sectors; track s.value) {
          <button class="sector-chip"
                  [class.active]="activeSector() === s.value"
                  (click)="setSector(s.value)">
            {{ s.label }}
          </button>
        }
      </div>

      <!-- Advanced filter panel -->
      @if (showFilters()) {
        <div class="filter-panel">
          <div class="fp-grid">

            <div class="fp-group">
              <span class="fp-label"><mat-icon>trending_up</mat-icon> P/E Ratio</span>
              <div class="fp-chips">
                @for (o of peOptions; track o.value) {
                  <button class="fp-chip" [class.fp-chip--on]="activePE() === o.value"
                          (click)="activePE.set(o.value)">{{ o.label }}</button>
                }
              </div>
            </div>

            <div class="fp-group">
              <span class="fp-label"><mat-icon>account_balance_wallet</mat-icon> Market Cap</span>
              <div class="fp-chips">
                @for (o of mcapOptions; track o.value) {
                  <button class="fp-chip" [class.fp-chip--on]="activeMcap() === o.value"
                          (click)="activeMcap.set(o.value)">{{ o.label }}</button>
                }
              </div>
            </div>

            <div class="fp-group">
              <span class="fp-label"><mat-icon>percent</mat-icon> ROE %</span>
              <div class="fp-chips">
                @for (o of roeOptions; track o.value) {
                  <button class="fp-chip" [class.fp-chip--on]="activeROE() === o.value"
                          (click)="activeROE.set(o.value)">{{ o.label }}</button>
                }
              </div>
            </div>

            <div class="fp-group">
              <span class="fp-label"><mat-icon>savings</mat-icon> Div Yield</span>
              <div class="fp-chips">
                @for (o of divOptions; track o.value) {
                  <button class="fp-chip" [class.fp-chip--on]="activeDiv() === o.value"
                          (click)="activeDiv.set(o.value)">{{ o.label }}</button>
                }
              </div>
            </div>

          </div>
          @if (activeFilterCount() > 0) {
            <button class="fp-clear-btn" (click)="clearFilters()">
              <mat-icon>clear_all</mat-icon> Clear filters
            </button>
          }
        </div>
      }

      <!-- Active filter chips (shown when panel is closed) -->
      @if (activeFilterCount() > 0 && !showFilters()) {
        <div class="active-filters-bar">
          <span class="afb-label">Filters:</span>
          @for (f of activeFilterLabels(); track f.key) {
            <span class="afb-chip">
              {{ f.label }}
              <button class="afb-remove" (click)="removeFilter(f.key)">
                <mat-icon>close</mat-icon>
              </button>
            </span>
          }
          <button class="afb-clear" (click)="clearFilters()">Clear all</button>
        </div>
      }

      <!-- Loading state -->
      @if (loading()) {
        <div class="loading-wrap">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading stocks…</span>
        </div>
      }

      <!-- Table -->
      @if (!loading()) {
        <!-- Mobile swipe hint — outside table-wrap so it doesn't scroll away -->
        @if (filtered().length > 0) {
          <div class="scroll-hint-bar mobile-only">
            <mat-icon class="scroll-hint-icon">swipe</mat-icon>
            <span>Swipe left to see all columns</span>
          </div>
        }

        <div class="table-wrap">
          <table mat-table [dataSource]="filtered()" class="screener-table">

            <!-- Symbol column -->
            <ng-container matColumnDef="symbol">
              <th mat-header-cell *matHeaderCellDef>Symbol / Name</th>
              <td mat-cell *matCellDef="let s">
                <div class="symbol-cell">
                  <span class="sym">{{ s.symbol }}</span>
                  <span class="sym-name">{{ s.name }}</span>
                </div>
              </td>
            </ng-container>

            <!-- Sector column -->
            <ng-container matColumnDef="sector">
              <th mat-header-cell *matHeaderCellDef>Sector</th>
              <td mat-cell *matCellDef="let s">
                <span class="sector-tag">{{ s.sector }}</span>
              </td>
            </ng-container>

            <!-- Price + Change column -->
            <ng-container matColumnDef="price">
              <th mat-header-cell *matHeaderCellDef>Price</th>
              <td mat-cell *matCellDef="let s">
                <div class="price-cell">
                  <span class="price text-mono">₹{{ s.price | number:'1.2-2' }}</span>
                  <span class="change-badge"
                    [class.up]="s.changePercent >= 0"
                    [class.dn]="s.changePercent < 0">
                    {{ s.changePercent >= 0 ? '+' : '' }}{{ s.changePercent | number:'1.2-2' }}%
                  </span>
                </div>
              </td>
            </ng-container>

            <!-- Market Cap column -->
            <ng-container matColumnDef="mcap">
              <th mat-header-cell *matHeaderCellDef>Mkt Cap</th>
              <td mat-cell *matCellDef="let s" class="text-mono text-muted">{{ s.marketCap }}</td>
            </ng-container>

            <!-- PE Ratio column -->
            <ng-container matColumnDef="pe">
              <th mat-header-cell *matHeaderCellDef>P/E</th>
              <td mat-cell *matCellDef="let s" class="text-mono">{{ s.peRatio | number:'1.1-1' }}</td>
            </ng-container>

            <!-- PB Ratio column -->
            <ng-container matColumnDef="pb">
              <th mat-header-cell *matHeaderCellDef>P/B</th>
              <td mat-cell *matCellDef="let s" class="text-mono">{{ s.pbRatio | number:'1.1-1' }}</td>
            </ng-container>

            <!-- ROE column -->
            <ng-container matColumnDef="roe">
              <th mat-header-cell *matHeaderCellDef>ROE %</th>
              <td mat-cell *matCellDef="let s" class="text-mono"
                [class.text-green]="s.roe > 15"
                [class.text-muted]="s.roe <= 15">
                {{ s.roe | number:'1.1-1' }}%
              </td>
            </ng-container>

            <!-- Dividend Yield column -->
            <ng-container matColumnDef="divYield">
              <th mat-header-cell *matHeaderCellDef>Div Yield</th>
              <td mat-cell *matCellDef="let s" class="text-mono text-muted">
                {{ s.dividendYield | number:'1.2-2' }}%
              </td>
            </ng-container>

            <!-- 52W Range column -->
            <ng-container matColumnDef="range">
              <th mat-header-cell *matHeaderCellDef>52W Range</th>
              <td mat-cell *matCellDef="let s">
                <div class="range-cell">
                  <span class="range-lo text-red">{{ s.fiftyTwoWeekLow | number:'1.0-0' }}</span>
                  <div class="range-bar">
                    <div class="range-fill" [style.width.%]="getRangePercent(s)"></div>
                    <div class="range-marker" [style.left.%]="getRangePercent(s)"></div>
                  </div>
                  <span class="range-hi text-green">{{ s.fiftyTwoWeekHigh | number:'1.0-0' }}</span>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"
              class="screener-row"
              [class.screener-row--clicked]="clickedRow() === row.symbol"
              (click)="goToDetail(row.symbol)"
              [matTooltip]="'View ' + row.name + ' detail'"
              matTooltipPosition="above">
            </tr>
          </table>

          <!-- Empty state within table area -->
          @if (filtered().length === 0) {
            <div class="empty-state">
              <mat-icon>search_off</mat-icon>
              <p>No stocks match your filters.</p>
              <button mat-stroked-button (click)="resetFilters()">Reset Filters</button>
            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    /* ── Page entry ──────────────────────────────────────────────────────────── */
    .screener-page {
      padding: 24px;
      animation: pageSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes pageSlideIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 16px; flex-wrap: wrap; gap: 12px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .page-title {
      display: flex; align-items: center; gap: 8px;
      color: var(--tf-text-primary); font-size: 20px; font-weight: 600; margin: 0;
    }
    .title-icon { color: var(--tf-cyan); font-size: 22px; }
    .result-count {
      color: var(--tf-text-muted); font-size: 12px;
      background: var(--tf-bg-elevated); padding: 2px 10px; border-radius: 12px;
    }
    .header-controls { display: flex; gap: 12px; align-items: center; }

    /* ── Search field: ease-in-out expand + cyan glow on focus ──────────────── */
    .search-field {
      width: 280px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                  filter 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      /* Material CSS custom properties — no ::ng-deep needed */
      --mdc-outlined-text-field-focus-outline-color: var(--tf-cyan);
      --mdc-outlined-text-field-hover-outline-color: rgba(79,172,254,0.5);
      --mdc-outlined-text-field-focus-outline-width: 2px;
    }
    .search-field:focus-within {
      width: 360px;
      filter: drop-shadow(0 0 8px rgba(79,172,254,0.30));
    }
    .sort-field { width: 190px; }

    /* Filter toggle button */
    .filter-toggle-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 0 16px; height: 56px;
      border: 1px solid var(--tf-border); border-radius: var(--tf-radius-sm);
      background: var(--tf-bg-surface); color: var(--tf-text-secondary);
      font-size: 13px; font-weight: 500; cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    .filter-toggle-btn mat-icon { font-size: 18px; }
    .filter-toggle-btn:hover {
      border-color: var(--tf-cyan); color: var(--tf-cyan);
      background: rgba(79,172,254,0.06);
    }
    .filter-toggle-btn--on {
      border-color: var(--tf-cyan); color: var(--tf-cyan);
      background: rgba(79,172,254,0.10);
      box-shadow: 0 0 0 1px rgba(79,172,254,0.3);
    }
    .ftb-badge {
      background: var(--tf-cyan); color: #000;
      font-size: 10px; font-weight: 700;
      width: 18px; height: 18px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
    }

    /* Advanced filter panel */
    .filter-panel {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); padding: 16px 20px 14px;
      margin-bottom: 16px;
      animation: fpSlideIn 0.22s cubic-bezier(0.4,0,0.2,1) both;
    }
    @keyframes fpSlideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .fp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .fp-group { display: flex; flex-direction: column; gap: 8px; }
    .fp-label {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; color: var(--tf-text-muted);
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .fp-label mat-icon { font-size: 14px; }
    .fp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .fp-chip {
      padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--tf-border); background: var(--tf-bg-elevated);
      color: var(--tf-text-secondary); cursor: pointer;
      transition: all 0.15s cubic-bezier(0.4,0,0.2,1);
    }
    .fp-chip:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .fp-chip--on {
      background: rgba(79,172,254,0.15); border-color: var(--tf-cyan);
      color: var(--tf-cyan); font-weight: 600;
    }
    .fp-clear-btn {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 14px; padding: 4px 12px; border-radius: 14px;
      border: 1px solid rgba(248,81,73,0.3); background: rgba(248,81,73,0.06);
      color: var(--tf-red); font-size: 12px; cursor: pointer;
      transition: all 0.15s;
    }
    .fp-clear-btn mat-icon { font-size: 15px; }
    .fp-clear-btn:hover { background: rgba(248,81,73,0.14); }

    /* Active filter chips bar (when panel is closed) */
    .active-filters-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      margin-bottom: 14px;
      animation: fpSlideIn 0.18s ease both;
    }
    .afb-label { font-size: 11px; color: var(--tf-text-muted); font-weight: 600; }
    .afb-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px 3px 12px; border-radius: 14px;
      background: rgba(79,172,254,0.12); border: 1px solid rgba(79,172,254,0.35);
      color: var(--tf-cyan); font-size: 12px; font-weight: 500;
    }
    .afb-remove {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; padding: 0;
      border: none; background: transparent; color: var(--tf-cyan);
      cursor: pointer; border-radius: 50%;
      transition: background 0.12s;
    }
    .afb-remove mat-icon { font-size: 12px; }
    .afb-remove:hover { background: rgba(79,172,254,0.25); }
    .afb-clear {
      padding: 3px 10px; border-radius: 14px; font-size: 11px;
      border: 1px solid var(--tf-border); background: transparent;
      color: var(--tf-text-muted); cursor: pointer; transition: all 0.12s;
    }
    .afb-clear:hover { border-color: var(--tf-red); color: var(--tf-red); }

    /* Sector chips */
    .sector-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .sector-chip {
      padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--tf-border); background: var(--tf-bg-surface);
      color: var(--tf-text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .sector-chip:hover { border-color: var(--tf-cyan); color: var(--tf-cyan); }
    .sector-chip.active {
      background: var(--tf-cyan); color: #000; border-color: var(--tf-cyan); font-weight: 600;
    }

    /* Loading */
    .loading-wrap {
      display: flex; flex-direction: column; align-items: center;
      gap: 16px; padding: 60px; color: var(--tf-text-muted);
    }

    /* Table */
    .table-wrap {
      background: var(--tf-bg-surface); border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md); overflow: auto; max-height: calc(100vh - 260px);
    }
    .screener-table { width: 100%; background: transparent; min-width: 900px; }
    .screener-table ::ng-deep .mat-mdc-header-row {
      position: sticky; top: 0; z-index: 10;
      background: var(--tf-bg-elevated) !important;
    }
    .screener-table ::ng-deep .mat-mdc-header-cell {
      background: var(--tf-bg-elevated) !important;
      border-bottom: 1px solid var(--tf-border) !important;
    }
    /* ── Row interactions ────────────────────────────────────────────────────── */
    .screener-row {
      cursor: pointer;
      transition: background 0.15s ease-out, transform 0.15s ease-out;
    }
    .screener-row:hover {
      background: rgba(79,172,254,0.06) !important;
      transform: translateX(3px);
    }
    /* Click animation — flashes cyan and scales slightly before navigation */
    .screener-row--clicked {
      background: rgba(79,172,254,0.18) !important;
      animation: rowClick 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    @keyframes rowClick {
      0%   { background: rgba(79,172,254,0.25); transform: scale(0.997) translateX(3px); }
      60%  { background: rgba(79,172,254,0.12); transform: scale(0.999) translateX(2px); }
      100% { background: rgba(79,172,254,0.05); transform: scale(1)     translateX(0); }
    }

    /* Symbol cell */
    .symbol-cell { display: flex; flex-direction: column; gap: 1px; }
    .sym { font-weight: 600; font-size: 13px; color: var(--tf-cyan); }
    .sym-name {
      font-size: 11px; color: var(--tf-text-muted);
      max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Sector tag */
    .sector-tag {
      font-size: 11px; padding: 2px 8px; border-radius: 4px;
      background: rgba(79,172,254,0.08); color: var(--tf-cyan); white-space: nowrap;
    }

    /* Price cell */
    .price-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
    .price { font-weight: 600; font-size: 13px; }
    .change-badge {
      font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600;
    }
    .change-badge.up { background: rgba(63,185,80,0.15); color: var(--tf-green); }
    .change-badge.dn { background: rgba(248,81,73,0.15); color: var(--tf-red); }

    /* 52W range bar */
    .range-cell { display: flex; align-items: center; gap: 6px; min-width: 170px; }
    .range-lo, .range-hi { font-size: 10px; min-width: 38px; font-family: monospace; }
    .range-lo { text-align: right; }
    .range-bar {
      flex: 1; height: 4px; background: var(--tf-border);
      border-radius: 2px; position: relative; min-width: 60px;
    }
    .range-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--tf-red) 0%, var(--tf-green) 100%);
      border-radius: 2px; transition: width 0.3s;
    }
    .range-marker {
      position: absolute; top: -3px; width: 10px; height: 10px; border-radius: 50%;
      background: var(--tf-cyan); border: 1px solid var(--tf-bg-app); transform: translateX(-50%);
    }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 48px; color: var(--tf-text-muted); text-align: center;
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--tf-border); }

    /* Scroll hint bar: hidden on desktop, shown on mobile via media query below */
    .scroll-hint-bar { display: none; }

    /* ── Responsive ─────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .screener-page { padding: 14px; }

      /* Stack title row above controls */
      .page-header { flex-direction: column; gap: 10px; align-items: stretch; }
      .header-left  { width: 100%; }

      /* Controls: 2-row grid — search full width on top, sort + filter below */
      .header-controls {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto;
        gap: 8px;
        width: 100%;
      }
      .search-field {
        grid-column: 1 / -1;   /* spans both columns — full row */
        width: 100% !important;
        transition: none;
      }
      .search-field:focus-within { width: 100% !important; filter: none; }
      .sort-field {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
      }
      /* WHY hide subscript-wrapper? Angular Material reserves ~20px below the input
         for validation/hint text even when unused, making the field taller than the
         button beside it and causing vertical misalignment. */
      .sort-field ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
      .filter-toggle-btn {
        grid-column: 2;
        grid-row: 2;
        align-self: stretch;    /* match the sort-field height exactly */
        white-space: nowrap;
      }

      /* Sector chips: scroll horizontally */
      .sector-chips { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
      .sector-chips::-webkit-scrollbar { display: none; }
      .sector-chip { flex-shrink: 0; }

      /* Filter panel grid: single column */
      .fp-grid { grid-template-columns: 1fr; }

      /* Scroll hint — prominent banner above the table */
      .scroll-hint-bar {
        display: flex;
        align-items: center; gap: 8px; justify-content: center;
        padding: 8px 14px;
        background: rgba(79,172,254,0.08);
        border: 1px solid rgba(79,172,254,0.2);
        border-radius: var(--tf-radius-sm);
        margin-bottom: 4px;
        font-size: 12px; font-weight: 600;
        color: var(--tf-cyan);
      }
      .scroll-hint-bar .scroll-hint-icon {
        font-size: 18px; width: 18px; height: 18px;
        animation: swipeHint 1.6s ease-in-out infinite;
      }
      @keyframes swipeHint {
        0%, 100% { transform: translateX(0); }
        40%       { transform: translateX(-6px); }
        60%       { transform: translateX(4px); }
      }
    }
  `]
})
export class ScreenerComponent implements OnInit {

  private readonly svc = inject(MarketService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  private readonly allStocks = signal<StockDetail[]>([]);
  readonly activeSector   = signal('');
  readonly searchQuery    = signal('');
  readonly activeSort     = signal<SortKey>('mcap');
  readonly activePE       = signal<PEFilter>('');
  readonly activeMcap     = signal<McapFilter>('');
  readonly activeROE      = signal<ROEFilter>('');
  readonly activeDiv      = signal<DivFilter>('');
  readonly showFilters    = signal(false);
  // WHY clickedRow signal? Tracks which row is mid-click so CSS can flash it
  // before the router navigates away — gives visible feedback on every selection.
  readonly clickedRow = signal<string | null>(null);

  // WHY nonNullable FormControl? We never want null — empty string is fine.
  readonly searchCtrl = new FormControl('', { nonNullable: true });
  readonly sortCtrl = new FormControl<SortKey>('mcap', { nonNullable: true });

  readonly activeFilterCount = computed(() =>
    ([this.activePE(), this.activeMcap(), this.activeROE(), this.activeDiv()] as string[])
      .filter(v => v !== '').length
  );

  readonly peOptions: { value: PEFilter; label: string }[] = [
    { value: '',       label: 'Any'    },
    { value: 'lt15',   label: '< 15'   },
    { value: '15to25', label: '15–25'  },
    { value: '25to40', label: '25–40'  },
    { value: 'gt40',   label: '> 40'   },
  ];
  readonly mcapOptions: { value: McapFilter; label: string }[] = [
    { value: '',       label: 'Any'       },
    { value: 'large',  label: 'Large Cap' },
    { value: 'mid',    label: 'Mid Cap'   },
    { value: 'small',  label: 'Small Cap' },
  ];
  readonly roeOptions: { value: ROEFilter; label: string }[] = [
    { value: '',      label: 'Any'    },
    { value: 'gt15',  label: '> 15%'  },
    { value: 'gt20',  label: '> 20%'  },
    { value: 'gt25',  label: '> 25%'  },
  ];
  readonly divOptions: { value: DivFilter; label: string }[] = [
    { value: '',      label: 'Any'    },
    { value: 'gt1',   label: '> 1%'   },
    { value: 'gt2',   label: '> 2%'   },
    { value: 'gt3',   label: '> 3%'   },
  ];

  // WHY computed labels? So active-filter chips can display human-readable text
  // without duplicating label strings across template and class.
  readonly activeFilterLabels = computed(() => {
    const result: { key: string; label: string }[] = [];
    const pe = this.activePE();
    if (pe) result.push({ key: 'pe',   label: this.peOptions.find(o => o.value === pe)?.label   ?? pe });
    const mc = this.activeMcap();
    if (mc) result.push({ key: 'mcap', label: this.mcapOptions.find(o => o.value === mc)?.label ?? mc });
    const ro = this.activeROE();
    if (ro) result.push({ key: 'roe',  label: this.roeOptions.find(o => o.value === ro)?.label  ?? ro });
    const dv = this.activeDiv();
    if (dv) result.push({ key: 'div',  label: this.divOptions.find(o => o.value === dv)?.label  ?? dv });
    return result;
  });

  readonly sectors = [
    { label: 'All Sectors', value: '' },
    { label: 'Technology', value: 'Technology' },
    { label: 'Banking & Finance', value: 'Banking & Finance' },
    { label: 'Financial Services', value: 'Financial Services' },
    { label: 'FMCG', value: 'FMCG' },
    { label: 'Pharma', value: 'Pharma' },
    { label: 'Auto', value: 'Auto' },
    { label: 'Energy', value: 'Energy' },
    { label: 'Consumer', value: 'Consumer' },
    { label: 'Metals', value: 'Metals' },
  ];

  readonly cols = ['symbol', 'sector', 'price', 'mcap', 'pe', 'pb', 'roe', 'divYield', 'range'];

  // WHY computed? Filtering + sorting derive from multiple signals.
  // computed() recalculates automatically when any dependency changes — no subscriptions needed.
  readonly filtered = computed(() => {
    const q    = this.searchQuery().toLowerCase();
    const sector = this.activeSector();
    const sort   = this.activeSort();
    const pe     = this.activePE();
    const mcap   = this.activeMcap();
    const roe    = this.activeROE();
    const div    = this.activeDiv();
    let list = this.allStocks();

    if (q) list = list.filter(s =>
      s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    if (sector) list = list.filter(s => s.sector === sector);

    // P/E ratio presets
    if (pe === 'lt15')   list = list.filter(s => s.peRatio < 15);
    if (pe === '15to25') list = list.filter(s => s.peRatio >= 15 && s.peRatio <= 25);
    if (pe === '25to40') list = list.filter(s => s.peRatio > 25 && s.peRatio <= 40);
    if (pe === 'gt40')   list = list.filter(s => s.peRatio > 40);

    // Market Cap presets (marketCapRaw in ₹ Cr)
    if (mcap === 'large') list = list.filter(s => s.marketCapRaw >= 20000);
    if (mcap === 'mid')   list = list.filter(s => s.marketCapRaw >= 5000 && s.marketCapRaw < 20000);
    if (mcap === 'small') list = list.filter(s => s.marketCapRaw < 5000);

    // ROE % presets
    if (roe === 'gt15') list = list.filter(s => s.roe > 15);
    if (roe === 'gt20') list = list.filter(s => s.roe > 20);
    if (roe === 'gt25') list = list.filter(s => s.roe > 25);

    // Dividend Yield presets
    if (div === 'gt1') list = list.filter(s => s.dividendYield > 1);
    if (div === 'gt2') list = list.filter(s => s.dividendYield > 2);
    if (div === 'gt3') list = list.filter(s => s.dividendYield > 3);

    // WHY spread before sort? sort() mutates the array — mutating a signal value
    // directly bypasses Angular's change detection.
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'mcap':      return b.marketCapRaw - a.marketCapRaw;
        case 'pe_asc':    return a.peRatio - b.peRatio;
        case 'pe_desc':   return b.peRatio - a.peRatio;
        case 'roe':       return b.roe - a.roe;
        case 'div_yield': return b.dividendYield - a.dividendYield;
        case 'change':    return b.changePercent - a.changePercent;
        default:          return 0;
      }
    });
  });

  constructor() {
    // WHY takeUntilDestroyed in constructor?
    // DestroyRef is resolved in the injection context — constructor is injection context.
    // Calling inside ngOnInit() fails because injection context is gone by then.
    this.searchCtrl.valueChanges.pipe(
      debounceTime(200), distinctUntilChanged(), takeUntilDestroyed()
    ).subscribe(v => this.searchQuery.set(v));

    this.sortCtrl.valueChanges.pipe(
      takeUntilDestroyed()
    ).subscribe(v => this.activeSort.set(v));
  }

  ngOnInit(): void {
    this.svc.screener().subscribe({
      next: stocks => { this.allStocks.set(stocks); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setSector(v: string): void { this.activeSector.set(v); }

  resetFilters(): void {
    this.searchCtrl.setValue('');
    this.activeSector.set('');
    this.sortCtrl.setValue('mcap');
    this.clearFilters();
  }

  clearFilters(): void {
    this.activePE.set('');
    this.activeMcap.set('');
    this.activeROE.set('');
    this.activeDiv.set('');
  }

  removeFilter(key: string): void {
    if (key === 'pe')   this.activePE.set('');
    if (key === 'mcap') this.activeMcap.set('');
    if (key === 'roe')  this.activeROE.set('');
    if (key === 'div')  this.activeDiv.set('');
  }

  // WHY 180ms delay? The rowClick animation runs for 200ms.
  // Delaying navigation lets the user see the flash before the page changes.
  goToDetail(symbol: string): void {
    this.clickedRow.set(symbol);
    setTimeout(() => this.router.navigate(['/stock-detail', symbol], {
      queryParams: { source: 'screener' }
    }), 180);
  }

  getRangePercent(s: StockDetail): number {
    const range = s.fiftyTwoWeekHigh - s.fiftyTwoWeekLow;
    if (range === 0) return 50;
    return Math.min(100, Math.max(0, ((s.price - s.fiftyTwoWeekLow) / range) * 100));
  }
}
