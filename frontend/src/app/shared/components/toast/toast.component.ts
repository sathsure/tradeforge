// WHY a custom toast component?
// MatSnackBar's default appearance is minimal. We need light-red / light-green
// styled toasts with an icon, title, message, and close button — things the
// default snackbar doesn't support without a custom component.

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';

export interface ToastData {
  type: 'success' | 'error';
  title: string;
  message: string;
}

@Component({
  selector: 'tf-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="toast-wrapper" [class]="'toast-' + data.type">
      <div class="toast-accent"></div>
      <div class="toast-body">
        <div class="toast-icon-wrap">
          <mat-icon class="toast-icon">{{ data.type === 'success' ? 'check_circle' : 'cancel' }}</mat-icon>
        </div>
        <div class="toast-content">
          <p class="toast-title">{{ data.title }}</p>
          <p class="toast-message">{{ data.message }}</p>
        </div>
        <button class="toast-close" (click)="dismiss()" aria-label="Dismiss">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="toast-progress" [class]="'toast-progress-' + data.type"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .toast-wrapper {
      position: relative;
      min-width: 320px;
      max-width: 420px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.16);
      backdrop-filter: blur(12px);
    }

    /* ── Success ── */
    .toast-success {
      background: rgba(16, 36, 24, 0.97);
      border: 1px solid rgba(52, 211, 153, 0.35);
    }
    .toast-success .toast-accent  { background: linear-gradient(90deg, #10b981, #34d399); }
    .toast-success .toast-icon    { color: #34d399; }
    .toast-success .toast-title   { color: #6ee7b7; }
    .toast-success .toast-message { color: #a7f3d0; }
    .toast-success .toast-close   { color: rgba(110,231,183,0.5); }
    .toast-success .toast-close:hover { color: #6ee7b7; }
    .toast-success .toast-progress { background: linear-gradient(90deg, #10b981, #34d399); }

    /* ── Error ── */
    .toast-error {
      background: rgba(36, 10, 10, 0.97);
      border: 1px solid rgba(248, 81, 73, 0.35);
    }
    .toast-error .toast-accent  { background: linear-gradient(90deg, #ef4444, #f87171); }
    .toast-error .toast-icon    { color: #f87171; }
    .toast-error .toast-title   { color: #fca5a5; }
    .toast-error .toast-message { color: #fecaca; }
    .toast-error .toast-close   { color: rgba(252,165,165,0.5); }
    .toast-error .toast-close:hover { color: #fca5a5; }
    .toast-error .toast-progress { background: linear-gradient(90deg, #ef4444, #f87171); }

    /* ── Top accent bar ── */
    .toast-accent {
      height: 3px;
      width: 100%;
    }

    /* ── Body ── */
    .toast-body {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 12px 12px 14px;
    }

    .toast-icon-wrap {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .toast-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .toast-content {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      margin: 0 0 3px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      line-height: 1.3;
    }

    .toast-message {
      margin: 0;
      font-size: 12px;
      font-weight: 400;
      line-height: 1.5;
      opacity: 0.9;
    }

    .toast-close {
      flex-shrink: 0;
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
      margin-top: -1px;

      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }

    /* ── Progress bar (shrinks over toast duration) ── */
    .toast-progress {
      height: 2px;
      width: 100%;
      animation: toastProgress 4s linear forwards;
    }

    @keyframes toastProgress {
      from { transform: scaleX(1); transform-origin: left; }
      to   { transform: scaleX(0); transform-origin: left; }
    }
  `]
})
export class ToastComponent {
  readonly data: ToastData = inject(MAT_SNACK_BAR_DATA);
  private readonly ref = inject(MatSnackBarRef);

  dismiss(): void { this.ref.dismiss(); }
}
