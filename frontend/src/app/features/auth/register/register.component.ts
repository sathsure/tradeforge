// WHY a separate RegisterComponent?
// Even though login and register look similar (both are forms),
// registration has different fields, different validators, and different business logic
// (password confirmation, phone number, terms acceptance).
// Separating them keeps each component focused and testable independently.

import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, Validators, ValidationErrors } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, distinctUntilChanged, filter, skip } from 'rxjs';
import { environment } from '../../../../environments/environment';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { ToastService } from '../../../core/services/toast.service';

import { AuthActions } from '../state/auth.actions';
import { selectAuthLoading, selectAuthError } from '../state/auth.selectors';

// WHY a custom validator function?
// Angular's built-in validators don't cover "passwords must match".
// This is a cross-field validator — it checks one field's value against another.
// Must be a function (not a class) for functional style compatibility.
function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  // WHY null return? null = valid. Return object = invalid.
  // The key of the returned object becomes the error name: hasError('passwordMismatch')
  if (password && confirmPassword && password !== confirmPassword) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit, OnDestroy {

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly http = inject(HttpClient);
  private errorSub?: Subscription;

  loading$: Observable<boolean> = this.store.select(selectAuthLoading);
  error$: Observable<string | null> = this.store.select(selectAuthError);

  // WHY serverCold signal? Probes auth health on component init so we can warn the
  // user BEFORE they click "Create Account" that a cold start may cause a long wait.
  // signal() triggers change detection automatically when set from a non-Angular callback.
  serverCold = signal(false);

  hidePassword = true;
  hideConfirm = true;

  ngOnInit(): void {
    // WHY probe auth on init? The warmup banner currently only shows AFTER the user
    // clicks "Create Account" (when loading$ becomes true). If auth-service is cold,
    // the user has no warning. Probing here shows "Server starting up" BEFORE they submit.
    // A 502/error means auth-service is cold; a 200 means it's ready.
    this.http.get(`${environment.apiUrl}/api/warmup/auth`)
      .subscribe({ error: () => this.serverCold.set(true) });

    // Watch for "Email already registered" error → show red snackbar
    this.errorSub = this.error$.pipe(
      skip(1),
      distinctUntilChanged(),
      filter(e => !!e && e.toLowerCase().includes('already registered'))
    ).subscribe(() => {
      this.toast.error('Email Taken', 'That email is already in the game — try logging in instead!');
    });
  }

  ngOnDestroy(): void {
    this.errorSub?.unsubscribe();
  }

  registerForm = this.fb.group(
    {
      fullName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ]
      ],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          // Password strength: uppercase + lowercase + number + special char
          // WHY this regex? Matches backend @Pattern validation.
          // Client-side validation gives INSTANT feedback without a server round-trip.
          Validators.pattern(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/
          )
        ]
      ],
      confirmPassword: ['', Validators.required],
      phone: [
        '',
        [
          // WHY optional validator with pattern?
          // Phone is not required, but if provided must be valid.
          // Validators.pattern only triggers if field has a value.
          // Actually Validators.pattern still validates empty string — use custom approach.
          Validators.pattern(/^[+]?[0-9]{10,15}$/)
        ]
      ]
    },
    { validators: passwordMatchValidator }
    // WHY pass validator at GROUP level (not field level)?
    // passwordMatchValidator needs to access BOTH password and confirmPassword.
    // Field-level validators only see their own control's value.
    // Group-level validators see the entire form group.
  );

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { fullName, email, password, phone } = this.registerForm.value;

    this.store.dispatch(AuthActions.register({
      request: {
        fullName: fullName!,
        email: email!,
        password: password!,
        phone: phone || undefined,
        // WHY || undefined? If phone is empty string, don't send it to backend.
        // Backend accepts phone as optional — undefined means omit from JSON.
        // Sending "" (empty string) might fail backend's phone regex validation.
      }
    }));
  }

  get fullNameError(): string {
    const ctrl = this.registerForm.get('fullName');
    if (ctrl?.hasError('required')) return 'Full name is required';
    if (ctrl?.hasError('minlength')) return 'Name must be at least 2 characters';
    if (ctrl?.hasError('maxlength')) return 'Name must be at most 100 characters';
    return '';
  }

  get emailError(): string {
    const ctrl = this.registerForm.get('email');
    if (ctrl?.hasError('required')) return 'Email is required';
    if (ctrl?.hasError('email')) return 'Please enter a valid email address';
    return '';
  }

  get passwordError(): string {
    const ctrl = this.registerForm.get('password');
    if (ctrl?.hasError('required')) return 'Password is required';
    if (ctrl?.hasError('minlength')) return 'Password must be at least 8 characters';
    if (ctrl?.hasError('pattern')) {
      return 'Must contain: uppercase, lowercase, number, and special character (@$!%*?&)';
    }
    return '';
  }

  get confirmPasswordError(): string {
    if (this.registerForm.hasError('passwordMismatch')) return 'Not a match! Make sure both passwords are identical.';
    const ctrl = this.registerForm.get('confirmPassword');
    if (ctrl?.hasError('required')) return 'Don\'t leave this blank — confirm your password!';
    return '';
  }

  get phoneError(): string {
    const ctrl = this.registerForm.get('phone');
    if (ctrl?.hasError('pattern')) return 'Enter a valid phone number (10-15 digits)';
    return '';
  }

  get passwordsMatch(): boolean {
    const pwd = this.registerForm.get('password')?.value;
    const confirm = this.registerForm.get('confirmPassword')?.value;
    return !!(pwd && confirm && pwd === confirm);
  }

  get passwordStrength(): 'weak' | 'medium' | 'strong' | null {
    const pwd = this.registerForm.get('password')?.value ?? '';
    if (!pwd) return null;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[@$!%*?&]/.test(pwd);
    const score = [hasUpper, hasLower, hasNumber, hasSpecial, pwd.length >= 12].filter(Boolean).length;
    if (score <= 2) return 'weak';
    if (score <= 3) return 'medium';
    return 'strong';
  }
}
