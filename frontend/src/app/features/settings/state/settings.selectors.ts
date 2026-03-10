// WHY selectors?
// Components should NEVER read state.settings.theme directly.
// Selectors are:
// 1. MEMOIZED — only recompute when input changes (performance)
// 2. COMPOSABLE — build complex selectors from simple ones
// 3. TESTABLE — unit test selectors independently of components
// 4. ENCAPSULATED — if state shape changes, update selector not every component

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { SettingsState } from './settings.reducer';

// WHY createFeatureSelector?
// Locates the 'settings' slice from the root state.
// The string 'settings' must match the key in provideStore({ settings: settingsReducer }).
export const selectSettingsState = createFeatureSelector<SettingsState>('settings');

// ── Appearance Selectors ──────────────────────────────────────────────────
export const selectTheme         = createSelector(selectSettingsState, s => s.theme);
export const selectPnlScheme     = createSelector(selectSettingsState, s => s.pnlColorScheme);
export const selectCompactMode   = createSelector(selectSettingsState, s => s.compactMode);
export const selectIsDarkTheme   = createSelector(selectTheme, theme => theme === 'dark');
export const selectIsLightTheme  = createSelector(selectTheme, theme => theme === 'light');

// ── Trading Selectors ─────────────────────────────────────────────────────
export const selectDefaultOrderType  = createSelector(selectSettingsState, s => s.defaultOrderType);
export const selectDefaultExchange   = createSelector(selectSettingsState, s => s.defaultExchange);
export const selectConfirmOrders     = createSelector(selectSettingsState, s => s.confirmOrders);
export const selectOneClickTrading   = createSelector(selectSettingsState, s => s.oneClickTrading);
export const selectAutoSquareOffTime = createSelector(selectSettingsState, s => s.autoSquareOffTime);

// ── Notification Selectors ────────────────────────────────────────────────
export const selectOrderAlerts = createSelector(selectSettingsState, s => s.orderAlerts);
export const selectPriceAlerts = createSelector(selectSettingsState, s => s.priceAlerts);
export const selectPnlAlerts   = createSelector(selectSettingsState, s => s.pnlAlerts);

// ── Security Selectors ────────────────────────────────────────────────────
export const selectSessionTimeout   = createSelector(selectSettingsState, s => s.sessionTimeoutMinutes);
export const selectTwoFactorEnabled = createSelector(selectSettingsState, s => s.twoFactorEnabled);

// ── Combined Selector (for the settings page to get all at once) ──────────
// WHY a combined selector?
// The SettingsComponent needs all settings to display current values.
// One subscription instead of 12 separate ones.
export const selectAllSettings = createSelector(selectSettingsState, s => s);
