import { Component, inject, signal, computed } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { switchMap } from 'rxjs';

import { MatCardModule }         from '@angular/material/card';
import { MatSlideToggleModule }  from '@angular/material/slide-toggle';
import { MatRadioModule }        from '@angular/material/radio';
import { MatSelectModule }       from '@angular/material/select';
import { MatButtonModule }       from '@angular/material/button';
import { MatIconModule }         from '@angular/material/icon';
import { MatDividerModule }      from '@angular/material/divider';
import { MatTooltipModule }      from '@angular/material/tooltip';
import { MatChipsModule }        from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatRippleModule }       from '@angular/material/core';

import { SettingsActions }   from './state/settings.actions';
import { selectAllSettings } from './state/settings.selectors';
import { SettingsState }     from './state/settings.reducer';
import { TwoFactorService }  from '../../core/services/two-factor.service';
import { WebAuthnService }   from '../../core/services/webauthn.service';
import { TwoFactorStatus, TrustedDeviceInfo } from '../../core/models/auth.models';

// WHY a typed section model?
// Keeps the section list type-safe. Adding a new section means
// TypeScript will catch if you forget the required fields.
interface SettingsSection {
  id: string;
  label: string;
  icon: string;
  badge?: string;
}

// WHY a typed tech stack entry?
// The About section renders a grid of technologies.
// Strongly typed ensures we never accidentally leave out version or color.
interface TechEntry {
  name: string;
  version: string;
  role: string;
  color: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  // WHY animations here? The template uses @fadeIn on section panels.
  // The animation must be declared in the component's animations array —
  // Angular's animation engine won't recognize it otherwise (NG05105 error).
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatSlideToggleModule, MatRadioModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDividerModule, MatTooltipModule,
    MatChipsModule, MatSnackBarModule, MatRippleModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl:    './settings.component.scss',
})
export class SettingsComponent {

  private readonly store            = inject(Store);
  private readonly snackBar         = inject(MatSnackBar);
  private readonly twoFactorService = inject(TwoFactorService);
  private readonly webAuthnService  = inject(WebAuthnService);

  // WHY Angular Signals for local UI state?
  // `activeSection` is purely presentational — no need for NgRx.
  // Signals give fine-grained reactivity without RxJS overhead.
  // computed() automatically derives activeSectionLabel from it.
  activeSection      = signal<string>('appearance');
  activeSectionLabel = computed(() =>
    this.sections.find(s => s.id === this.activeSection())?.label ?? 'Settings'
  );

  // ── 2FA local state (signals for fine-grained reactivity) ─────────────────
  twoFactorStatus  = signal<TwoFactorStatus | null>(null);
  trustedDevices   = signal<TrustedDeviceInfo[]>([]);
  enrollOtpSent    = signal(false);
  selectedMethod   = signal<string>('EMAIL');
  enrollOtp        = signal('');
  // WHY a separate plain string? [(ngModel)] works better with a plain property
  // that we sync to the signal via (ngModelChange).
  enrollOtpValue   = '';
  webAuthnSupported = this.webAuthnService.isSupported();

  sections: SettingsSection[] = [
    { id: 'appearance',    label: 'Appearance',          icon: 'palette'            },
    { id: 'trading',       label: 'Trading Preferences', icon: 'candlestick_chart'  },
    { id: 'notifications', label: 'Notifications',       icon: 'notifications'      },
    { id: 'security',      label: 'Security',            icon: 'security'           },
    { id: 'about',         label: 'About',               icon: 'info'               },
  ];

  // WHY selectAllSettings?
  // The template needs all settings to display current values.
  // One observable + async pipe > twelve individual subscriptions.
  settings$ = this.store.select(selectAllSettings);

  readonly currentYear = new Date().getFullYear();

  techStack: TechEntry[] = [
    { name: 'Angular',       version: '18',      role: 'Frontend Framework',  color: '#dd0031' },
    { name: 'NgRx',          version: '18',      role: 'State Management',    color: '#ba2bd2' },
    { name: 'Spring Boot',   version: '3.2.3',   role: 'Backend Framework',   color: '#6db33f' },
    { name: 'Spring Cloud',  version: '2023.0',  role: 'Microservices',       color: '#6db33f' },
    { name: 'PostgreSQL',    version: '16',      role: 'Primary Database',    color: '#336791' },
    { name: 'Redis',         version: '7',       role: 'Cache / Sessions',    color: '#d82c20' },
    { name: 'Kafka',         version: '7.6',     role: 'Event Streaming',     color: '#231f20' },
    { name: 'Eureka',        version: '4.x',     role: 'Service Discovery',   color: '#59abe3' },
    { name: 'Java',          version: '21 LTS',  role: 'Runtime',             color: '#f89820' },
    { name: 'TypeScript',    version: '5.4',     role: 'Language',            color: '#3178c6' },
    { name: 'Flyway',        version: '9.x',     role: 'DB Migrations',       color: '#cc0200' },
    { name: 'Docker',        version: '26',      role: 'Containerisation',    color: '#2496ed' },
  ];

  // ── Appearance ────────────────────────────────────────────────────────
  setTheme(theme: 'dark' | 'light'): void {
    this.store.dispatch(SettingsActions.updateTheme({ theme }));
    this.notify(`Switched to ${theme} mode`);
  }

  setPnlScheme(scheme: 'green-red' | 'red-green'): void {
    this.store.dispatch(SettingsActions.updatePnlColorScheme({ scheme }));
  }

  setCompactMode(enabled: boolean): void {
    this.store.dispatch(SettingsActions.toggleCompactMode({ enabled }));
  }

  // ── Trading ───────────────────────────────────────────────────────────
  setOrderType(orderType: 'MARKET' | 'LIMIT' | 'SL'): void {
    this.store.dispatch(SettingsActions.updateDefaultOrderType({ orderType }));
  }

  setExchange(exchange: 'NSE' | 'BSE'): void {
    this.store.dispatch(SettingsActions.updateDefaultExchange({ exchange }));
  }

  setConfirmOrders(enabled: boolean): void {
    this.store.dispatch(SettingsActions.toggleConfirmOrders({ enabled }));
  }

  setOneClickTrading(enabled: boolean): void {
    this.store.dispatch(SettingsActions.toggleOneClickTrading({ enabled }));
    if (enabled) {
      this.notify('⚡ One-click trading active — orders execute without confirmation', 'warn');
    }
  }

  setAutoSquareOff(time: string): void {
    this.store.dispatch(SettingsActions.updateAutoSquareOffTime({ time }));
    this.notify(`Auto square-off set to ${time}`);
  }

  // ── Notifications ─────────────────────────────────────────────────────
  setOrderAlerts(enabled: boolean): void {
    this.store.dispatch(SettingsActions.toggleOrderAlerts({ enabled }));
  }

  setPriceAlerts(enabled: boolean): void {
    this.store.dispatch(SettingsActions.togglePriceAlerts({ enabled }));
  }

  setPnlAlerts(enabled: boolean): void {
    this.store.dispatch(SettingsActions.togglePnlAlerts({ enabled }));
  }

  // ── Security ──────────────────────────────────────────────────────────
  setSessionTimeout(minutes: number): void {
    this.store.dispatch(SettingsActions.updateSessionTimeout({ minutes }));
    this.notify(`Session timeout set to ${minutes < 60 ? minutes + ' minutes' : minutes / 60 + ' hours'}`);
  }

  setTwoFactor(enabled: boolean): void {
    this.store.dispatch(SettingsActions.toggleTwoFactorAuth({ enabled }));
    // Reload live 2FA status from backend after the NgRx toggle
    this.loadTwoFactorStatus();
    if (enabled) {
      this.notify('2FA setup — choose your method below');
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────
  resetToDefaults(): void {
    this.store.dispatch(SettingsActions.resetToDefaults({}));
    this.notify('All settings restored to defaults');
  }

  selectSection(id: string): void {
    this.activeSection.set(id);
    // WHY load 2FA status on section switch?
    // We only call the API when the user actually navigates to Security.
    // No unnecessary HTTP calls on other sections.
    if (id === 'security') this.loadTwoFactorStatus();
  }

  // ── 2FA Methods ──────────────────────────────────────────────────────────

  loadTwoFactorStatus(): void {
    this.twoFactorService.getStatus().subscribe({
      next: status => {
        this.twoFactorStatus.set(status);
        // WHY load trusted devices only when 2FA is enabled?
        // The endpoint is only useful if there are potentially trusted devices.
        // Saves an HTTP call for users without 2FA active.
        if (status.enabled) this.loadTrustedDevices();
      },
      error: () => {} // User may not be authenticated during initial render
    });
  }

  sendEnrollOtp(): void {
    this.twoFactorService.sendEnrollOtp(this.selectedMethod()).subscribe({
      next: () => { this.enrollOtpSent.set(true); this.notify('Verification code sent'); },
      error: () => this.notify('Failed to send code', 'warn')
    });
  }

  verifyEnrollOtp(): void {
    this.twoFactorService
      .verifyEnrollOtp({ method: this.selectedMethod() as any, otp: this.enrollOtp() })
      .subscribe({
        next: () => {
          this.notify('2FA enabled successfully');
          this.enrollOtpSent.set(false);
          this.loadTwoFactorStatus();
        },
        error: err => this.notify(err?.error?.message ?? 'Invalid code', 'warn')
      });
  }

  disable2fa(): void {
    this.twoFactorService.disable2fa().subscribe({
      next: () => { this.notify('2FA disabled'); this.loadTwoFactorStatus(); },
      error: () => this.notify('Failed to disable 2FA', 'warn')
    });
  }

  loadTrustedDevices(): void {
    this.twoFactorService.getTrustedDevices().subscribe({
      next: devices => this.trustedDevices.set(devices),
      error: () => {} // Non-critical — devices list is supplementary info
    });
  }

  revokeDevice(id: string): void {
    this.twoFactorService.revokeTrustedDevice(id).subscribe({
      next: () => { this.notify('Device removed'); this.loadTrustedDevices(); },
      error: () => this.notify('Failed to remove device', 'warn')
    });
  }

  registerWebAuthn(): void {
    // WHY build deviceName from navigator.platform?
    // Gives the user a recognisable name in the trusted-devices list.
    const deviceName = `${navigator.platform} \u2013 ${new Date().toLocaleDateString()}`;
    this.webAuthnService.register(deviceName).pipe(
      // WHY switchMap? register() returns an Observable<WebAuthnRegistrationRequest>.
      // We then post that to the backend — chaining two async operations.
      switchMap((req: any) => this.twoFactorService.registerWebAuthn(req))
    ).subscribe({
      next: () => { this.notify('Biometric registered'); this.loadTwoFactorStatus(); },
      error: err => this.notify(err?.message ?? 'Registration failed', 'warn')
    });
  }

  hasChanges(settings: SettingsState): boolean {
    return settings.theme !== 'dark'
      || settings.defaultOrderType !== 'MARKET'
      || settings.defaultExchange !== 'NSE'
      || !settings.confirmOrders
      || settings.oneClickTrading
      || settings.twoFactorEnabled;
  }

  private notify(msg: string, type: 'info' | 'warn' = 'info'): void {
    this.snackBar.open(msg, '✕', {
      duration: 3000,
      panelClass: type === 'warn' ? 'snack-warn' : 'snack-info',
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}
