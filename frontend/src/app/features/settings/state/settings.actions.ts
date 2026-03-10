// WHY createActionGroup?
// Groups all Settings actions under one namespace ('Settings').
// Auto-generates action type strings: '[Settings] Update Theme', etc.
// Keeps related actions co-located — easy to find all settings actions.
// Alternative (createAction per action) requires more boilerplate and
// scattered type strings that can drift out of sync.

import { createActionGroup, props } from '@ngrx/store';

export type Theme = 'dark' | 'light';
export type PnlColorScheme = 'green-red' | 'red-green';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL';
export type Exchange = 'NSE' | 'BSE';

export const SettingsActions = createActionGroup({
  source: 'Settings',
  events: {

    // ── Appearance ────────────────────────────────────────────────────────
    // WHY pass value instead of toggling in reducer?
    // Explicit value avoids state drift in devtools time-travel debugging.
    // "Set theme to light" is clearer than "toggle theme" when replaying.
    'Update Theme':            props<{ theme: Theme }>(),
    'Update Pnl Color Scheme': props<{ scheme: PnlColorScheme }>(),
    'Toggle Compact Mode':     props<{ enabled: boolean }>(),

    // ── Trading Preferences ───────────────────────────────────────────────
    // WHY expose these as settings?
    // Power users (Zerodha-style) want their preferred order type pre-selected.
    // "I always trade LIMIT" — saves 1 click per order, adds up over 50+ trades/day.
    'Update Default Order Type': props<{ orderType: OrderType }>(),
    'Update Default Exchange':   props<{ exchange: Exchange }>(),
    'Toggle Confirm Orders':     props<{ enabled: boolean }>(),
    // Confirmation dialogs: new traders want them, experienced traders turn off.
    'Toggle One Click Trading':  props<{ enabled: boolean }>(),
    // One-click: execute at market price without any dialog. Expert traders only.
    'Update Auto Square Off Time': props<{ time: string }>(),
    // Auto square-off: force-close all intraday positions at this time.
    // SEBI requires brokers to support this for risk management.

    // ── Notifications ─────────────────────────────────────────────────────
    'Toggle Order Alerts': props<{ enabled: boolean }>(),
    'Toggle Price Alerts': props<{ enabled: boolean }>(),
    'Toggle Pnl Alerts':   props<{ enabled: boolean }>(),
    // WHY granular notification settings?
    // Traders get alert fatigue from too many notifications.
    // Letting them choose: only P&L alerts during market hours is a real need.

    // ── Security ──────────────────────────────────────────────────────────
    'Update Session Timeout': props<{ minutes: number }>(),
    'Toggle Two Factor Auth':  props<{ enabled: boolean }>(),
    // 2FA UI-only in Sprint 1. Backend integration in Sprint 3.

    // ── Reset ─────────────────────────────────────────────────────────────
    'Reset To Defaults': props<Record<string, never>>(),
    // WHY allow reset? Settings can get into unexpected states during development.
    // In production: "I messed up my settings" — one-click restore.
  }
});
