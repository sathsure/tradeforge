// WHY a dedicated settings reducer?
// Settings are user preferences that outlive the browser session.
// They must be persisted to localStorage and rehydrated on app start.
// Keeping them in NgRx means components react to changes automatically —
// the moment the user toggles dark/light, every component re-renders.
//
// PATTERN: "Rehydrated State"
// initialState reads from localStorage first, falls back to defaults.
// Every reducer case writes the new state back to localStorage.
// Result: settings survive page refreshes with zero extra code.

import { createReducer, on } from '@ngrx/store';
import { SettingsActions, Theme, PnlColorScheme, OrderType, Exchange } from './settings.actions';

export interface SettingsState {
  // Appearance
  theme: Theme;
  pnlColorScheme: PnlColorScheme;
  compactMode: boolean;

  // Trading Preferences
  defaultOrderType: OrderType;
  defaultExchange: Exchange;
  confirmOrders: boolean;
  oneClickTrading: boolean;
  autoSquareOffTime: string;

  // Notifications
  orderAlerts: boolean;
  priceAlerts: boolean;
  pnlAlerts: boolean;

  // Security
  sessionTimeoutMinutes: number;
  twoFactorEnabled: boolean;
}

// WHY this default state?
// Mirrors Zerodha Kite defaults: dark theme, NSE, MARKET order, confirmations on.
// These defaults serve the majority. Power users opt out in settings.
export const defaultSettings: SettingsState = {
  theme: 'dark',
  pnlColorScheme: 'green-red',
  compactMode: false,
  defaultOrderType: 'MARKET',
  defaultExchange: 'NSE',
  confirmOrders: true,
  oneClickTrading: false,
  autoSquareOffTime: '15:15',
  orderAlerts: true,
  priceAlerts: true,
  pnlAlerts: true,
  sessionTimeoutMinutes: 30,
  twoFactorEnabled: false,
};

const STORAGE_KEY = 'tf_settings';

// WHY this helper?
// Reads previously saved settings from localStorage.
// Deep-merges with defaults so newly added settings keys get their defaults
// even when the user has an older saved version (forward compatibility).
function loadFromStorage(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const saved = JSON.parse(raw) as Partial<SettingsState>;
    // WHY spread order (defaults first, then saved)?
    // Any new settings fields added in code get their default value.
    // Existing user preferences are preserved from saved.
    return { ...defaultSettings, ...saved };
  } catch {
    // WHY silent catch? localStorage might be blocked (private mode, security policy).
    // App should still work — just use defaults.
    return defaultSettings;
  }
}

// WHY this helper?
// Called after every reducer case so settings always survive page refresh.
function saveToStorage(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore — quota exceeded or security policy.
  }
}

// Load initial state from localStorage on module init.
// This is why settings feel "instant" on page reload — no HTTP call needed.
const initialState: SettingsState = loadFromStorage();

export const settingsReducer = createReducer(
  initialState,

  // ── Appearance ────────────────────────────────────────────────────────
  on(SettingsActions.updateTheme, (state, { theme }) => {
    const next = { ...state, theme };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.updatePnlColorScheme, (state, { scheme }) => {
    const next = { ...state, pnlColorScheme: scheme };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.toggleCompactMode, (state, { enabled }) => {
    const next = { ...state, compactMode: enabled };
    saveToStorage(next);
    return next;
  }),

  // ── Trading Preferences ───────────────────────────────────────────────
  on(SettingsActions.updateDefaultOrderType, (state, { orderType }) => {
    const next = { ...state, defaultOrderType: orderType };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.updateDefaultExchange, (state, { exchange }) => {
    const next = { ...state, defaultExchange: exchange };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.toggleConfirmOrders, (state, { enabled }) => {
    const next = { ...state, confirmOrders: enabled };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.toggleOneClickTrading, (state, { enabled }) => {
    // WHY disable confirmOrders when one-click is ON?
    // One-click trading and confirmation dialogs are mutually exclusive.
    // Confirmation dialogs defeat the purpose of one-click.
    const next = { ...state, oneClickTrading: enabled, confirmOrders: enabled ? false : state.confirmOrders };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.updateAutoSquareOffTime, (state, { time }) => {
    const next = { ...state, autoSquareOffTime: time };
    saveToStorage(next);
    return next;
  }),

  // ── Notifications ─────────────────────────────────────────────────────
  on(SettingsActions.toggleOrderAlerts, (state, { enabled }) => {
    const next = { ...state, orderAlerts: enabled };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.togglePriceAlerts, (state, { enabled }) => {
    const next = { ...state, priceAlerts: enabled };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.togglePnlAlerts, (state, { enabled }) => {
    const next = { ...state, pnlAlerts: enabled };
    saveToStorage(next);
    return next;
  }),

  // ── Security ──────────────────────────────────────────────────────────
  on(SettingsActions.updateSessionTimeout, (state, { minutes }) => {
    const next = { ...state, sessionTimeoutMinutes: minutes };
    saveToStorage(next);
    return next;
  }),

  on(SettingsActions.toggleTwoFactorAuth, (state, { enabled }) => {
    const next = { ...state, twoFactorEnabled: enabled };
    saveToStorage(next);
    return next;
  }),

  // ── Reset ─────────────────────────────────────────────────────────────
  on(SettingsActions.resetToDefaults, () => {
    saveToStorage(defaultSettings);
    return defaultSettings;
  }),
);
