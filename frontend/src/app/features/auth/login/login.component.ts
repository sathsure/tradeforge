// WHY a dedicated LoginComponent?
// Single Responsibility: this component ONLY handles the login form UX.
// It dispatches actions but knows nothing about HTTP, tokens, or storage.
// That separation makes it trivial to test: mock the store, check dispatched actions.
//
// WHY standalone: true?
// No NgModule needed. The component declares its own imports.
// Tree-shaking removes unused Material modules at build time.
// Adding MatButtonModule here means ONLY LoginComponent pays for it if no one else imports it.

import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

// Angular Material imports — each is a separate package for tree-shaking
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { AuthActions } from '../state/auth.actions';
import { selectAuthLoading, selectAuthError } from '../state/auth.selectors';

@Component({
  selector: 'app-login',
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
    MatCheckboxModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {

  // WHY inject() instead of constructor params?
  // Cleaner syntax. No need for (private readonly store: Store) in constructor.
  // Angular 14+ best practice for standalone components.
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);

  // ── Observables from NgRx Store ──────────────────────────────────────────
  // WHY Observable$ naming convention? Signals to other developers:
  // "this is async — use async pipe in template or subscribe carefully"
  loading$: Observable<boolean> = this.store.select(selectAuthLoading);
  error$: Observable<string | null> = this.store.select(selectAuthError);

  // ── Form State ────────────────────────────────────────────────────────────
  hidePassword = true;
  // WHY state in component not store?
  // Password visibility is LOCAL UI state — no other component cares.
  // Only global, shared state belongs in NgRx.

  // ── Reactive Form ─────────────────────────────────────────────────────────
  // WHY FormBuilder instead of new FormGroup()?
  // FormBuilder is a factory that creates forms with less boilerplate.
  // new FormGroup({ email: new FormControl('', [...validators]) }) → verbose.
  // fb.group({ email: ['', validators] }) → concise.
  loginForm = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        // WHY Validators.email? Built-in Angular validator.
        // Checks format (x@y.z). Not exhaustive but catches obvious typos.
        // The backend validates more strictly with @Email + regex.
      ]
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        // WHY minLength(8) here? Matches backend @Size(min = 8).
        // No point submitting a 4-char password we know will fail server validation.
        // Fail fast on client = better UX.
      ]
    ]
  });

  ngOnInit(): void {
    // If we need to pre-fill form from queryParams (e.g., redirect from register),
    // we could use ActivatedRoute here. Empty for now.
  }

  // ── Form Submission ───────────────────────────────────────────────────────
  onSubmit(): void {
    if (this.loginForm.invalid) {
      // WHY markAllAsTouched?
      // Angular shows validation errors only after a field is "touched" (user interacted).
      // If user clicks Submit without touching any field, errors stay hidden.
      // markAllAsTouched() forces all errors to show immediately.
      this.loginForm.markAllAsTouched();
      return;
    }

    // WHY dispatch to store instead of calling AuthService directly?
    // Components don't own the HTTP call lifecycle. The store does.
    // Loading state, error handling, navigation after success — all handled by effects/reducer.
    // Component only needs to dispatch: "user wants to log in with these credentials".
    this.store.dispatch(AuthActions.login({
      request: {
        email: this.loginForm.value.email!,
        password: this.loginForm.value.password!,
        // WHY non-null assertion (!)? TypeScript: form value can be null/undefined.
        // But we checked loginForm.invalid above — if we're here, fields have values.
        // This tells TypeScript we're confident the value exists.
      }
    }));
  }

  // ── Error Getters ─────────────────────────────────────────────────────────
  // WHY getters? Clean template syntax: {{ emailError }} instead of nested *ngIf.
  // Computed on every change detection cycle — but form validation is cheap.

  get emailError(): string {
    const ctrl = this.loginForm.get('email');
    if (ctrl?.hasError('required')) return 'Email is required';
    if (ctrl?.hasError('email')) return 'Please enter a valid email address';
    return '';
  }

  get passwordError(): string {
    const ctrl = this.loginForm.get('password');
    if (ctrl?.hasError('required')) return 'Password is required';
    if (ctrl?.hasError('minlength')) return 'Password must be at least 8 characters';
    return '';
  }
}
