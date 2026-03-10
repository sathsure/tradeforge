// WHY a dedicated TwoFactorVerifyComponent?
// Single Responsibility: handles only the 2FA verification step.
// Decoupled from LoginComponent — different route, different UI, different actions.
// Supports OTP (6-digit box UX) and WebAuthn (biometric button) in one component.

import {
  Component, inject, OnInit, OnDestroy,
  ElementRef, ViewChildren, QueryList
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, interval, Subscription, take } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthActions } from '../state/auth.actions';
import {
  selectAuthLoading, selectAuthError,
  selectTwoFactorMethod, selectTwoFactorTempToken
} from '../state/auth.selectors';
import { WebAuthnService } from '../../../core/services/webauthn.service';
import { TwoFactorMethod } from '../../../core/models/auth.models';

@Component({
  selector: 'app-two-factor-verify',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatCheckboxModule, MatProgressSpinnerModule,
  ],
  templateUrl: './two-factor-verify.component.html',
  styleUrl: './two-factor-verify.component.scss',
})
export class TwoFactorVerifyComponent implements OnInit, OnDestroy {

  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly webAuthnService = inject(WebAuthnService);

  // ── Store observables ─────────────────────────────────────────────────────
  method$: Observable<TwoFactorMethod | null> = this.store.select(selectTwoFactorMethod);
  tempToken$: Observable<string | null> = this.store.select(selectTwoFactorTempToken);
  loading$: Observable<boolean> = this.store.select(selectAuthLoading);
  error$: Observable<string | null> = this.store.select(selectAuthError);

  // ── Local UI state ────────────────────────────────────────────────────────
  // WHY six separate string slots? Each maps to one input box.
  // This enables precise per-box focus control and paste-splitting.
  digits = ['', '', '', '', '', ''];
  trustDevice = false;
  resendCooldown = 0;
  // WHY computed at runtime? isSupported() checks window.PublicKeyCredential.
  // SSR would return false even if the browser supports it.
  webAuthnSupported = this.webAuthnService.isSupported();

  private tempToken: string | null = null;
  private method: TwoFactorMethod | null = null;
  private cooldownSub?: Subscription;
  private storeSub?: Subscription;

  // WHY ViewChildren? We need direct DOM access to call .focus() on individual
  // input elements — Angular's template refs don't expose focus() on QueryList items
  // without ElementRef.
  @ViewChildren('digitInput') digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngOnInit(): void {
    // Keep local copies of store values for use in event handlers
    this.storeSub = this.store.select(selectTwoFactorTempToken).subscribe(t => this.tempToken = t);
    this.store.select(selectTwoFactorMethod).subscribe(m => this.method = m);

    // Guard: if there's no pending 2FA state, redirect back to login.
    // Give the store a tick to hydrate before checking — avoids false redirect on first render.
    setTimeout(() => {
      this.store.select(selectTwoFactorTempToken).pipe(take(1)).subscribe(t => {
        if (!t) this.router.navigate(['/auth/login']);
      });
    }, 100);
  }

  ngOnDestroy(): void {
    this.storeSub?.unsubscribe();
    this.cooldownSub?.unsubscribe();
  }

  // ── OTP box interaction ───────────────────────────────────────────────────

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    // Strip non-digits and keep only the last character (handles rapid typing)
    const val = input.value.replace(/\D/g, '');
    this.digits[index] = val ? val[val.length - 1] : '';
    input.value = this.digits[index];
    // Auto-advance focus to next box when a digit is entered
    if (this.digits[index] && index < 5) {
      const inputs = this.digitInputs.toArray();
      inputs[index + 1]?.nativeElement.focus();
    }
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    // Backspace on empty box → go to previous box
    if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
      const inputs = this.digitInputs.toArray();
      inputs[index - 1]?.nativeElement.focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text')?.replace(/\D/g, '') ?? '';
    // Distribute pasted digits across boxes
    for (let i = 0; i < 6 && i < text.length; i++) {
      this.digits[i] = text[i];
    }
  }

  // WHY a getter? Template uses `otp.length` — computed from digits array on each CD cycle.
  get otp(): string { return this.digits.join(''); }

  // ── Actions ───────────────────────────────────────────────────────────────

  onVerifyOtp(): void {
    if (this.otp.length !== 6 || !this.tempToken) return;
    this.store.dispatch(AuthActions.verifyOtp({
      request: { tempToken: this.tempToken, otp: this.otp, trustDevice: this.trustDevice }
    }));
  }

  onWebAuthn(): void {
    if (!this.tempToken) return;
    // WHY subscribe here not in an effect? WebAuthn requires user gesture.
    // The browser blocks navigator.credentials.get() unless called from a user-initiated event.
    // Dispatching an action and triggering it via an effect would break the gesture requirement.
    this.webAuthnService.authenticate(this.tempToken, this.trustDevice).subscribe({
      next: payload => this.store.dispatch(AuthActions.verifyWebauthn({ payload })),
      error: err => console.error('WebAuthn authentication failed', err)
    });
  }

  resendOtp(): void {
    // WHY 60s cooldown? Prevent spam — OTP endpoints are rate-limited on the backend too.
    this.resendCooldown = 60;
    this.cooldownSub = interval(1000).pipe(take(60)).subscribe(() => {
      this.resendCooldown--;
    });
    // Backend resend — OTP is auto-sent on login, resend is a future enhancement
  }

  onCancel(): void {
    // Wipe all 2FA state and go back to the login form
    this.store.dispatch(AuthActions.twoFactorCancel());
    this.router.navigate(['/auth/login']);
  }
}
