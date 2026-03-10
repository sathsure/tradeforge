// WHY PriceChartComponent?
// Wraps TradingView's lightweight-charts library in an Angular component.
// lightweight-charts renders to a DOM element via imperative API — we bridge this
// to Angular's declarative style by managing the chart lifecycle in ngAfterViewInit/OnDestroy.
//
// Features:
// - Candlestick chart (OHLCV) and Area/Line chart (MF NAV)
// - Period selector: 1D, 1W, 1M, 3M, 6M, 1Y, 5Y
// - TWO-POINT % CALCULATOR: click to set two reference points; shows % between them
// - Crosshair tooltip: shows OHLCV values on hover
// - ResizeObserver: chart fills container responsively

import {
  Component, ElementRef, ViewChild, Input, Output, EventEmitter,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges, signal, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  CrosshairMode,
  ColorType,
  Time
} from 'lightweight-charts';
import { CandleBar } from '../../../core/models/market.models';

export type ChartType = 'candlestick' | 'area';
export type ChartPeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';

@Component({
  selector: 'app-price-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-wrapper">
      <!-- Period selector -->
      <div class="chart-controls">
        <div class="period-tabs">
          @for (p of periods; track p) {
            <button
              class="period-btn"
              [class.active]="activePeriod() === p"
              (click)="onPeriodChange(p)">
              {{ p }}
            </button>
          }
        </div>
        <div class="chart-type-toggle">
          <button class="type-btn" [class.active]="chartTypeSignal() === 'candlestick'"
                  (click)="setChartType('candlestick')" title="Candlestick">
            <span class="icon-candle">&#9646;</span>
          </button>
          <button class="type-btn" [class.active]="chartTypeSignal() === 'area'"
                  (click)="setChartType('area')" title="Line/Area">
            <span>&#9650;</span>
          </button>
        </div>
        @if (measureMode()) {
          <div class="measure-badge">
            <span class="measure-dot"></span>
            Measure mode — click 2 points
          </div>
        }
        @if (measureResult()) {
          <div class="measure-result" [class.positive]="measureResult()! >= 0" [class.negative]="measureResult()! < 0">
            {{ measureResult()! >= 0 ? '+' : '' }}{{ measureResult()!.toFixed(2) }}%
          </div>
        }
        <button class="measure-btn" [class.active]="measureMode()" (click)="toggleMeasure()"
                title="Two-point % calculator">
          <span>&#8646;</span> Measure
        </button>
      </div>

      <!-- Chart canvas container -->
      <div #chartContainer class="chart-canvas"
           (click)="onChartClick($event)"
           (touchstart)="onChartTouchStart($event)"
           (touchend)="onChartTouchEnd($event)">

        <!-- Measure markers + connecting line -->
        @if (measurePoint1Px() || measurePoint2Px()) {
          <svg class="measure-svg">
            @if (measurePoint1Px() && measurePoint2Px()) {
              <line
                [attr.x1]="measurePoint1Px()!.x" [attr.y1]="measurePoint1Px()!.y"
                [attr.x2]="measurePoint2Px()!.x" [attr.y2]="measurePoint2Px()!.y"
                class="measure-line"/>
            }
          </svg>
          @if (measurePoint1Px()) {
            <div class="measure-marker mp1"
                 [style.left.px]="measurePoint1Px()!.x"
                 [style.top.px]="measurePoint1Px()!.y">
              <div class="mp-dot"></div>
              <div class="mp-price-tag">P1 &nbsp;₹{{ measurePoint1Price()! | number:'1.2-2' }}</div>
            </div>
          }
          @if (measurePoint2Px()) {
            <div class="measure-marker mp2"
                 [style.left.px]="measurePoint2Px()!.x"
                 [style.top.px]="measurePoint2Px()!.y">
              <div class="mp-dot"></div>
              <div class="mp-price-tag">P2 &nbsp;₹{{ measurePoint2Price()! | number:'1.2-2' }}</div>
            </div>
          }
        }

      </div>

      <!-- OHLCV tooltip (shown on crosshair move) -->
      @if (tooltip()) {
        <div class="ohlcv-tooltip">
          <span class="tooltip-date">{{ tooltip()!.date }}</span>
          <span class="tooltip-o">O: <b>{{ tooltip()!.open | number:'1.2-2' }}</b></span>
          <span class="tooltip-h text-green">H: <b>{{ tooltip()!.high | number:'1.2-2' }}</b></span>
          <span class="tooltip-l text-red">L: <b>{{ tooltip()!.low | number:'1.2-2' }}</b></span>
          <span class="tooltip-c">C: <b>{{ tooltip()!.close | number:'1.2-2' }}</b></span>
          <span class="tooltip-v text-muted">Vol: {{ tooltip()!.volume | number }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .chart-wrapper {
      position: relative;
      background: var(--tf-bg-surface);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-md);
      overflow: hidden;
    }
    .chart-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--tf-border);
      flex-wrap: wrap;
    }
    .period-tabs {
      display: flex;
      gap: 2px;
      background: var(--tf-bg-elevated);
      border-radius: var(--tf-radius-sm);
      padding: 2px;
    }
    .period-btn {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      background: transparent;
      color: var(--tf-text-secondary);
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .period-btn.active {
      background: var(--tf-cyan);
      color: #000;
      font-weight: 700;
    }
    .period-btn:hover:not(.active) { background: var(--tf-border); color: var(--tf-text-primary); }
    .chart-type-toggle {
      display: flex;
      gap: 2px;
      background: var(--tf-bg-elevated);
      border-radius: var(--tf-radius-sm);
      padding: 2px;
    }
    .type-btn {
      padding: 4px 8px;
      font-size: 13px;
      border: none;
      background: transparent;
      color: var(--tf-text-secondary);
      border-radius: 3px;
      cursor: pointer;
    }
    .type-btn.active { background: var(--tf-cyan); color: #000; }
    .measure-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid var(--tf-border);
      background: transparent;
      color: var(--tf-text-secondary);
      border-radius: var(--tf-radius-sm);
      cursor: pointer;
    }
    .measure-btn.active {
      border-color: var(--tf-cyan);
      color: var(--tf-cyan);
      background: rgba(57, 208, 216, 0.1);
    }
    .measure-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--tf-cyan);
      animation: fadeIn 0.3s;
    }
    .measure-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--tf-cyan);
      animation: pulse 1s infinite;
    }
    .measure-result {
      font-size: 14px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      padding: 2px 10px;
      border-radius: var(--tf-radius-sm);
      animation: fadeIn 0.3s;
    }
    .measure-result.positive { color: var(--tf-green); background: var(--tf-green-bg); }
    .measure-result.negative { color: var(--tf-red); background: var(--tf-red-bg); }
    .chart-canvas { width: 100%; height: 400px; position: relative; }
    @media (max-width: 768px) { .chart-canvas { height: 260px; } }
    @media (max-width: 480px) { .chart-canvas { height: 220px; } }

    /* Measure overlay */
    .measure-svg {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: visible;
    }
    .measure-line {
      stroke: rgba(57,208,216,0.55); stroke-width: 1.5; stroke-dasharray: 6 4;
    }
    /* Marker wrapper sits at the exact click coordinate (no centering transform) */
    .measure-marker {
      position: absolute;
      pointer-events: none; z-index: 10;
    }
    /* Dot is centered on the coordinate via negative margin */
    .mp-dot {
      position: absolute;
      width: 12px; height: 12px; border-radius: 50%;
      top: -6px; left: -6px;          /* offset by half own size = centered on (0,0) */
      border: 2px solid #fff;
    }
    .mp1 .mp-dot { background: var(--tf-cyan); box-shadow: 0 0 8px rgba(57,208,216,0.8); }
    .mp2 .mp-dot { background: #f0b429;        box-shadow: 0 0 8px rgba(240,180,41,0.8); }
    /* Label floats to the right of the dot, vertically centered */
    .mp-price-tag {
      position: absolute;
      left: 10px; top: 50%; transform: translateY(-50%);
      font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
      padding: 2px 7px; border-radius: 4px; white-space: nowrap;
      background: var(--tf-bg-app); border: 1px solid;
    }
    .mp1 .mp-price-tag { color: var(--tf-cyan); border-color: var(--tf-cyan); }
    .mp2 .mp-price-tag { color: #f0b429;        border-color: #f0b429; }
    .ohlcv-tooltip {
      position: absolute;
      top: 48px;
      left: 12px;
      display: flex;
      gap: 12px;
      font-size: 11px;
      background: var(--tf-bg-elevated);
      border: 1px solid var(--tf-border);
      border-radius: var(--tf-radius-sm);
      padding: 4px 10px;
      pointer-events: none;
      z-index: 10;
    }
    .ohlcv-tooltip b { font-family: 'JetBrains Mono', monospace; }
    .tooltip-date { color: var(--tf-text-secondary); }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  `]
})
export class PriceChartComponent implements AfterViewInit, OnDestroy, OnChanges {

  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  @Input() candles: CandleBar[] = [];
  @Input() chartType: ChartType = 'candlestick';  // candlestick or area
  @Input() currentPeriod: ChartPeriod = '1M';

  @Output() periodChange = new EventEmitter<ChartPeriod>();

  readonly periods: ChartPeriod[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];

  // Signals for reactive UI state
  readonly activePeriod = signal<ChartPeriod>('1M');
  readonly chartTypeSignal = signal<ChartType>('candlestick');
  readonly measureMode = signal(false);
  readonly measureResult = signal<number | null>(null);
  readonly tooltip = signal<{ date: string; open: number; high: number; low: number; close: number; volume: number } | null>(null);

  // Visible measure markers (pixel coords + price)
  readonly measurePoint1Px    = signal<{ x: number; y: number } | null>(null);
  readonly measurePoint2Px    = signal<{ x: number; y: number } | null>(null);
  readonly measurePoint1Price = signal<number | null>(null);
  readonly measurePoint2Price = signal<number | null>(null);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private measureClickCount = 0;
  // Store price+time (not pixels) so markers can be reprojected on zoom/pan
  private measurePoint1Data: { time: Time; price: number } | null = null;
  private measurePoint2Data: { time: Time; price: number } | null = null;
  // Touch tracking: distinguish tap from pan/pinch
  private touchStartX = 0;
  private touchStartY = 0;

  ngAfterViewInit(): void {
    this.initChart();
    this.setupResizeObserver();
    if (this.candles.length) this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['candles'] || changes['chartType']) && this.chart) {
      this.rebuildSeries();
    }
    if (changes['currentPeriod']) {
      this.activePeriod.set(this.currentPeriod);
    }
    if (changes['chartType']) {
      this.chartTypeSignal.set(this.chartType);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.remove();
  }

  onPeriodChange(period: ChartPeriod): void {
    this.activePeriod.set(period);
    this.periodChange.emit(period);
  }

  setChartType(type: ChartType): void {
    this.chartTypeSignal.set(type);
    this.rebuildSeries();
  }

  toggleMeasure(): void {
    const newMode = !this.measureMode();
    this.measureMode.set(newMode);
    if (!newMode) {
      this.measureClickCount = 0;
      this.measureResult.set(null);
      this.measurePoint1Px.set(null);
      this.measurePoint2Px.set(null);
      this.measurePoint1Price.set(null);
      this.measurePoint2Price.set(null);
      this.measurePoint1Data = null;
      this.measurePoint2Data = null;
    }
  }

  /**
   * WHY onChartClick?
   * Implements the two-point percentage calculator.
   * - First click: records the price at the clicked x-coordinate
   * - Second click: calculates % change from point 1 to point 2
   * Uses the chart's crosshair price (not pixel coordinates) for accuracy.
   */
  onChartClick(event: MouseEvent): void {
    if (!this.measureMode() || !this.chart || !this.candles.length) return;
    const container = this.chartContainer.nativeElement;
    const rect = container.getBoundingClientRect();
    this.handleMeasurePoint(event.clientX - rect.left, event.clientY - rect.top);
  }

  /**
   * WHY onChartTouchStart/End?
   * On mobile, lightweight-charts intercepts touch events for pan/zoom so the
   * synthetic `click` event never fires. We handle `touchend` directly.
   * touchStart records the starting position so we can ignore drags/swipes.
   */
  onChartTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  }

  onChartTouchEnd(event: TouchEvent): void {
    if (!this.measureMode() || !this.chart || !this.candles.length) return;
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    // Only treat as a tap if movement was minimal — ignore pans and pinches
    if (Math.abs(touch.clientX - this.touchStartX) > 10 ||
        Math.abs(touch.clientY - this.touchStartY) > 10) return;
    const container = this.chartContainer.nativeElement;
    const rect = container.getBoundingClientRect();
    this.handleMeasurePoint(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  /**
   * WHY handleMeasurePoint?
   * Shared by click and touch — records the first/second measure point,
   * stores logical time+price, and reprojects to pixel coordinates.
   */
  private handleMeasurePoint(x: number, y: number): void {
    // WHY coordinateToTime? Stores the logical time so markers can be reprojected
    // after zoom/pan — pixel coords alone become stale when the chart rescales.
    const time  = this.chart!.timeScale().coordinateToTime(x);
    const price = (this.series as any).coordinateToPrice(y) as number | null;
    if (!time || price === null) return;

    this.measureClickCount++;
    if (this.measureClickCount === 1) {
      this.measurePoint1Data = { time, price };
      this.measurePoint2Data = null;
      this.measurePoint2Px.set(null);
      this.measurePoint2Price.set(null);
      this.measureResult.set(null);
      this.updateMeasurePixels();
    } else {
      this.measurePoint2Data = { time, price };
      const pct = ((price - this.measurePoint1Data!.price) / this.measurePoint1Data!.price) * 100;
      this.measureResult.set(pct);
      this.measureClickCount = 0;
      this.updateMeasurePixels();
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private initChart(): void {
    const container = this.chartContainer.nativeElement;

    this.chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b949e',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#39d0d8', width: 1, style: 3, labelBackgroundColor: '#161b22' },
        horzLine: { color: '#39d0d8', width: 1, style: 3, labelBackgroundColor: '#161b22' },
      },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });

    this.buildSeries();
    this.setupCrosshairTooltip();

    // WHY subscribeVisibleLogicalRangeChange? Fires on every zoom and pan.
    // We reproject stored price+time data back to pixel coords after each change.
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this.updateMeasurePixels();
    });
  }

  private buildSeries(): void {
    if (this.chartTypeSignal() === 'area') {
      this.series = this.chart!.addAreaSeries({
        lineColor: '#39d0d8',
        topColor: 'rgba(57, 208, 216, 0.3)',
        bottomColor: 'rgba(57, 208, 216, 0.0)',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      }) as ISeriesApi<'Area'>;
    } else {
      this.series = this.chart!.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderUpColor: '#3fb950',
        borderDownColor: '#f85149',
        wickUpColor: '#3fb950',
        wickDownColor: '#f85149',
      }) as ISeriesApi<'Candlestick'>;
    }
  }

  private rebuildSeries(): void {
    if (!this.chart) return;
    this.chart.removeSeries(this.series!);
    this.buildSeries();
    this.loadData();
  }

  private loadData(): void {
    if (!this.series || !this.candles.length) return;

    if (this.chartTypeSignal() === 'area') {
      const lineData: LineData[] = this.candles.map(c => ({
        time: c.time as Time,
        value: c.close,
      }));
      (this.series as ISeriesApi<'Area'>).setData(lineData);
    } else {
      const candleData: CandlestickData[] = this.candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      (this.series as ISeriesApi<'Candlestick'>).setData(candleData);
    }

    this.chart!.timeScale().fitContent();
  }

  private setupCrosshairTooltip(): void {
    this.chart!.subscribeCrosshairMove(param => {
      if (!param.time || !this.series) {
        this.tooltip.set(null);
        return;
      }
      const data = param.seriesData.get(this.series) as any;
      if (!data) { this.tooltip.set(null); return; }

      // Find the full candle data (including volume) for the tooltip
      const timeVal = param.time as number;
      const candle = this.candles.find(c => c.time === timeVal);

      const date = new Date(timeVal * 1000).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

      this.tooltip.set({
        date,
        open: data.open ?? data.value,
        high: data.high ?? data.value,
        low: data.low ?? data.value,
        close: data.close ?? data.value,
        volume: candle?.volume ?? 0,
      });
    });
  }

  private setupResizeObserver(): void {
    // WHY ResizeObserver? The chart must fill its container.
    // CSS alone can't tell the lightweight-charts canvas its new size.
    // ResizeObserver fires whenever the container dimensions change (window resize,
    // sidebar toggle, panel open) and resizes the chart accordingly.
    this.resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      this.chart?.applyOptions({ width, height });
      this.updateMeasurePixels();
    });
    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  /**
   * WHY updateMeasurePixels?
   * Called after every zoom, pan, or resize. Converts stored price+time data
   * back to current pixel coordinates using the chart's live scale APIs.
   * series.priceToCoordinate() and timeScale.timeToCoordinate() always return
   * the correct pixel for the current viewport — no stale values.
   */
  private updateMeasurePixels(): void {
    if (!this.chart || !this.series) return;

    const project = (data: { time: Time; price: number } | null) => {
      if (!data) return null;
      const x = this.chart!.timeScale().timeToCoordinate(data.time);
      const y = (this.series as any).priceToCoordinate(data.price);
      return (x !== null && y !== null) ? { x: x as number, y: y as number } : null;
    };

    if (this.measurePoint1Data) {
      const px = project(this.measurePoint1Data);
      this.measurePoint1Px.set(px);
      this.measurePoint1Price.set(this.measurePoint1Data.price);
    }
    if (this.measurePoint2Data) {
      const px = project(this.measurePoint2Data);
      this.measurePoint2Px.set(px);
      this.measurePoint2Price.set(this.measurePoint2Data.price);
    }
  }

  /**
   * WHY getPriceAtY?
   * lightweight-charts v4 doesn't expose a direct pixel→price conversion.
   * We approximate it using the visible price range (top/bottom of scale)
   * and the container height. This is accurate enough for the measure tool.
   */
  private getPriceAtY(y: number, height: number): number | null {
    if (!this.chart || !this.candles.length) return null;
    const prices = this.candles.map(c => c.close);
    const maxPrice = Math.max(...prices) * 1.05;
    const minPrice = Math.min(...prices) * 0.95;
    const ratio = 1 - (y / height);
    return minPrice + (maxPrice - minPrice) * ratio;
  }
}
