// WHY market.models.ts?
// Centralized TypeScript interfaces that mirror the backend DTOs.
// Single source of truth for all market-related data shapes.
// Keeping models separate from state prevents circular imports.

// ─── Stock Quote (Sprint 2 — live price data) ────────────────────────────────
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

// ─── Stock Detail (Sprint 3 — fundamentals + screener) ───────────────────────
export interface StockDetail {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: string;        // Formatted string: "₹19.2L Cr"
  marketCapRaw: number;     // Raw crores value for sorting
  peRatio: number;
  pbRatio: number;
  eps: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  dividendYield: number;
  dividendPerShare: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  avgVolume20D: number;
  price: number;
  change: number;
  changePercent: number;
  description: string;
  faceValue: number;
  isin: string;
  exchange: string;
}

export interface StockDetailResponse {
  detail: StockDetail;
  corporateActions: CorporateAction[];
}

// ─── Corporate Actions ────────────────────────────────────────────────────────
export interface CorporateAction {
  symbol: string;
  type: 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'BUYBACK' | 'RIGHTS';
  exDate: string;
  recordDate: string;
  description: string;
  value: number;
  status: 'PAST' | 'UPCOMING';
}

// ─── Candle / OHLCV Bar (for lightweight-charts) ─────────────────────────────
export interface CandleBar {
  time: number;    // Unix epoch seconds (lightweight-charts format)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Lightweight-charts line data (single value per time)
export interface LineBar {
  time: number;
  value: number;
}

// ─── Order Book ───────────────────────────────────────────────────────────────
export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  symbol: string;
  lastPrice: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  totalBidQty: number;
  totalAskQty: number;
}

// ─── Mutual Funds ─────────────────────────────────────────────────────────────
export type MFCategory = 'EQUITY' | 'DEBT' | 'HYBRID' | 'INDEX' | 'ELSS';
export type RiskLevel = 'LOW' | 'MODERATE' | 'MODERATELY_HIGH' | 'HIGH' | 'VERY_HIGH';

export interface FundHolding {
  symbol: string;
  name: string;
  percentage: number;
}

export interface MutualFund {
  id: string;
  name: string;
  category: MFCategory;
  subCategory: string;
  fundManager: string;
  amcName: string;
  nav: number;
  lastNavDate: string;
  aumCrore: number;
  aumFmt: string;
  expenseRatio: number;
  returns1Y: number;
  returns3Y: number;
  returns5Y: number;
  riskLevel: RiskLevel;
  minSip: number;
  minLumpsum: number;
  topHoldings: FundHolding[];
  benchmark: string;
  benchmarkReturn: number;
}

// ─── Price Alerts ─────────────────────────────────────────────────────────────
export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  priceAtCreation: number;  // Price when alert was created — gives context
  createdAt: string;        // ISO datetime string
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'ORDER_FILLED'
  | 'ORDER_CANCELLED'
  | 'PRICE_ALERT'
  | 'CORPORATE_ACTION'
  | 'MARKET_OPEN'
  | 'MARKET_CLOSE';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  symbol?: string;
  timestamp: number;   // Unix ms
  read: boolean;
}
