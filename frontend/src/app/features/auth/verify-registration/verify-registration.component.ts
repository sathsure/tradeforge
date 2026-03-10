// WHY a dedicated verify-registration component?
// After registration, the backend sends a 6-digit OTP to the user's email/phone.
// This component collects that OTP and submits it to confirm account ownership.
// Mirrors the structure of TwoFactorVerifyComponent for visual consistency.

import {
  Component, OnInit, OnDestroy, ViewChildren, QueryList,
  ElementRef, signal, computed, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subscription, interval, distinctUntilChanged, filter } from 'rxjs';
import { take, skip } from 'rxjs/operators';

import { AuthActions } from '../state/auth.actions';
import {
  selectRegistrationPending,
  selectRegistrationMethod,
  selectRegistrationTempToken,
  selectRegistrationMaskedContact,
  selectAuthLoading,
  selectAuthError
} from '../state/auth.selectors';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'tf-verify-registration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './verify-registration.component.html',
  styleUrl: './verify-registration.component.scss'
})
export class VerifyRegistrationComponent implements OnInit, OnDestroy {

  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // ── Store Observables ──────────────────────────────────────────────────────
  // WHY async pipe + Observables here?
  // Consistent with the rest of the auth module — reactive, no manual subscribe/unsubscribe.

  readonly pending$ = this.store.select(selectRegistrationPending);
  readonly method$ = this.store.select(selectRegistrationMethod);
  readonly maskedContact$ = this.store.select(selectRegistrationMaskedContact);
  readonly loading$ = this.store.select(selectAuthLoading);
  readonly error$ = this.store.select(selectAuthError);

  // ── OTP State ─────────────────────────────────────────────────────────────
  digits: string[] = ['', '', '', '', '', ''];
  get otp(): string { return this.digits.join(''); }

  @ViewChildren('digitInput') digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  // ── Error shake state ──────────────────────────────────────────────────────
  otpShaking = false;
  otpErrorMessage = '';
  wrongAttempts = 0;
  readonly MAX_ATTEMPTS = 3;

  // ── Resend Cooldown ────────────────────────────────────────────────────────
  resendCooldown = 60;
  private cooldownSub?: Subscription;
  private errorSub?: Subscription;

  ngOnInit(): void {
    this.pending$.subscribe(pending => {
      if (!pending) this.router.navigate(['/auth/register']);
    });

    this.startCooldown();

    // Watch for verification errors — shake boxes, clear inputs, track attempts
    this.errorSub = this.error$.pipe(
      skip(1),
      distinctUntilChanged(),
      filter(e => !!e)
    ).subscribe(error => {
      this.wrongAttempts++;
      if (this.wrongAttempts >= this.MAX_ATTEMPTS) {
        this.otpErrorMessage = '';
        this.triggerShake();
        this.toast.error(
          '3 Strikes — You\'re Out!',
          'Too many wrong codes. Redirecting to login — start fresh.'
        );
        setTimeout(() => {
          this.store.dispatch(AuthActions.registrationCancel());
          this.router.navigate(['/auth/login']);
        }, 3500);
      } else {
        const remaining = this.MAX_ATTEMPTS - this.wrongAttempts;
        this.otpErrorMessage = this.getOtpCatchPhrase(error ?? '', remaining);
        this.triggerShake();
        this.clearDigits();
      }
    });
  }

  ngOnDestroy(): void {
    this.cooldownSub?.unsubscribe();
    this.errorSub?.unsubscribe();
  }

  private getOtpCatchPhrase(error: string, remaining: number): string {
    if (error.toLowerCase().includes('expired')) {
      return 'Code expired — tap Resend to get a fresh one!';
    }
    if (remaining === 1) {
      return 'Last chance! One wrong attempt left before you\'re redirected.';
    }
    return `Nope, that's not it! ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`;
  }

  private triggerShake(): void {
    this.otpShaking = true;
    setTimeout(() => { this.otpShaking = false; }, 600);
  }

  private clearDigits(): void {
    this.digits = ['', '', '', '', '', ''];
    setTimeout(() => {
      this.digitInputs?.toArray().forEach(el => { el.nativeElement.value = ''; });
      this.digitInputs?.first?.nativeElement.focus();
    }, 50);
  }

  // ── OTP Input Handlers ─────────────────────────────────────────────────────

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Accept only digits
    if (!/^\d$/.test(value)) {
      input.value = this.digits[index];
      return;
    }

    this.digits[index] = value;

    // Auto-advance to next box
    if (index < 5) {
      this.digitInputs.toArray()[index + 1].nativeElement.focus();
    }
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      if (this.digits[index]) {
        // Clear current box
        this.digits[index] = '';
        (event.target as HTMLInputElement).value = '';
      } else if (index > 0) {
        // Move to previous box
        this.digits[index - 1] = '';
        const inputs = this.digitInputs.toArray();
        inputs[index - 1].nativeElement.value = '';
        inputs[index - 1].nativeElement.focus();
      }
      event.preventDefault();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const digits = pasted.replace(/\D/g, '').slice(0, 6).split('');

    digits.forEach((d, i) => {
      if (i < 6) {
        this.digits[i] = d;
        const inputs = this.digitInputs.toArray();
        if (inputs[i]) inputs[i].nativeElement.value = d;
      }
    });

    // Focus the box after the last filled digit
    const nextIndex = Math.min(digits.length, 5);
    this.digitInputs.toArray()[nextIndex]?.nativeElement.focus();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  onVerify(): void {
    if (this.otp.length !== 6) return;

    // WHY read tempToken from state synchronously via subscribe?
    // We need the current tempToken one time. take(1) ensures we unsubscribe immediately.
    this.store.select(selectRegistrationTempToken).pipe(take(1)).subscribe(tempToken => {
      if (!tempToken) return;
      this.store.dispatch(AuthActions.verifyRegistration({
        request: { tempToken, otp: this.otp }
      }));
    });
  }

  resendOtp(): void {
    if (this.resendCooldown > 0) return;
    this.store.dispatch(AuthActions.resendRegistrationOtp());
    this.startCooldown();
    // Clear OTP boxes after resend
    this.digits = ['', '', '', '', '', ''];
    this.digitInputs?.toArray().forEach(el => { el.nativeElement.value = ''; });
    setTimeout(() => this.digitInputs?.first?.nativeElement.focus(), 50);
  }

  onCancel(): void {
    this.store.dispatch(AuthActions.registrationCancel());
    this.router.navigate(['/auth/register']);
  }

  // ── Countdown Timer ────────────────────────────────────────────────────────

  private startCooldown(): void {
    this.cooldownSub?.unsubscribe();
    this.resendCooldown = 60;
    this.cooldownSub = interval(1000).subscribe(() => {
      if (this.resendCooldown > 0) {
        this.resendCooldown--;
      } else {
        this.cooldownSub?.unsubscribe();
      }
    });
  }
}
