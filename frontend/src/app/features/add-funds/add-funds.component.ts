// WHY AddFundsComponent?
// Provides a professional multi-step payment flow for users to deposit funds.
// Step 1: Choose amount (presets + custom input)
// Step 2: Choose payment method (UPI, Net Banking, Credit/Debit Card)
// Step 3: Enter payment details (UPI ID or card form)
// Step 4: Processing spinner (simulated 2.5s gateway delay)
// Step 5: Success screen with transaction ID
// Dispatches PortfolioActions.addCash() to update the NgRx store balance optimistically.

import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRippleModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PortfolioActions } from '../portfolio/state/portfolio.actions';
import { selectAvailableBalance } from '../portfolio/state/portfolio.selectors';
import { toSignal } from '@angular/core/rxjs-interop';

type PaymentMethod = 'upi' | 'netbanking' | 'credit' | 'debit';
type Step = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-add-funds',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatRippleModule, MatDividerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './add-funds.component.html',
  styleUrl: './add-funds.component.scss',
})
export class AddFundsComponent {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  // WHY signal for step? Local UI state — multi-step wizard steps don't need NgRx.
  // The step drives @if blocks in the template for each step's content.
  readonly step = signal<Step>(1);

  // Amount selection
  readonly presets = [1000, 5000, 10000, 25000, 50000];
  readonly selectedAmount = signal<number>(0);
  readonly customAmount = signal<string>('');
  // WHY computed? finalAmount updates automatically when either selectedAmount or
  // customAmount changes — no manual event wiring or OnChanges needed.
  readonly finalAmount = computed(() => {
    const custom = parseInt(this.customAmount(), 10);
    return custom > 0 ? custom : this.selectedAmount();
  });

  // Payment method
  readonly selectedMethod = signal<PaymentMethod | null>(null);
  readonly paymentMethods = [
    { id: 'upi' as PaymentMethod, label: 'UPI', sublabel: 'GPay, PhonePe, BHIM', icon: 'qr_code_2', color: '#4CAF50' },
    { id: 'netbanking' as PaymentMethod, label: 'Net Banking', sublabel: 'All major banks', icon: 'account_balance', color: '#2196F3' },
    { id: 'credit' as PaymentMethod, label: 'Credit Card', sublabel: 'Visa, Mastercard, Amex', icon: 'credit_card', color: '#9C27B0' },
    { id: 'debit' as PaymentMethod, label: 'Debit Card', sublabel: 'All bank debit cards', icon: 'credit_score', color: '#FF9800' },
  ];

  // Payment detail forms
  readonly upiForm = this.fb.group({
    upiId: ['', [Validators.required, Validators.pattern(/^[\w.-]+@[\w]+$/)]],
  });
  readonly cardForm = this.fb.group({
    cardNumber: ['', [Validators.required, Validators.pattern(/^\d{16}$/)]],
    expiry: ['', [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/)]],
    cvv: ['', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
    name: ['', Validators.required],
  });

  // WHY toSignal? currentBalance is driven by NgRx store — toSignal makes it
  // available in the template without an async pipe.
  readonly currentBalance = toSignal(this.store.select(selectAvailableBalance), { initialValue: 0 });

  readonly amountValid = computed(() => this.finalAmount() >= 100 && this.finalAmount() <= 1_000_000);
  readonly methodSelected = computed(() => !!this.selectedMethod());

  // WHY transactionId signal? Computed in pay() so it's available in step 5 template.
  // Using a signal avoids calling Math.random() in the template (not supported).
  readonly transactionId = signal<string>('');

  selectPreset(amount: number): void {
    this.selectedAmount.set(amount);
    this.customAmount.set('');
  }

  onCustomAmount(value: string): void {
    this.customAmount.set(value);
    this.selectedAmount.set(0);
  }

  selectMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  proceed(): void {
    if (this.step() === 1 && this.amountValid()) this.step.set(2);
    else if (this.step() === 2 && this.methodSelected()) this.step.set(3);
    else if (this.step() === 3) this.pay();
  }

  pay(): void {
    // Validate the correct form based on payment method
    const method = this.selectedMethod();
    if (method === 'upi' && this.upiForm.invalid) { this.upiForm.markAllAsTouched(); return; }
    if ((method === 'credit' || method === 'debit') && this.cardForm.invalid) { this.cardForm.markAllAsTouched(); return; }

    this.step.set(4); // Processing
    // WHY 2500ms timeout? Simulates payment gateway processing delay.
    // Real payment: this would be a POST to the payment API with a callback.
    setTimeout(() => {
      this.store.dispatch(PortfolioActions.addCash({ amount: this.finalAmount() }));
      this.transactionId.set('TF' + Math.floor(Math.random() * 9_999_999_999).toString().padStart(10, '0'));
      this.step.set(5); // Success
    }, 2500);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  formatCard(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').substring(0, 16);
    this.cardForm.patchValue({ cardNumber: input.value });
  }

  formatExpiry(event: Event): void {
    let val = (event.target as HTMLInputElement).value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 3) val = val.substring(0, 2) + '/' + val.substring(2);
    (event.target as HTMLInputElement).value = val;
    this.cardForm.patchValue({ expiry: val });
  }

  getMethodLabel(id: PaymentMethod): string {
    return this.paymentMethods.find(m => m.id === id)?.label ?? '';
  }
}
