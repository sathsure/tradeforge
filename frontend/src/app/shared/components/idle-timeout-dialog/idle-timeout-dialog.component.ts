import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { interval, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

// WHY a dialog for idle warning?
// Modal dialogs guarantee the user sees the warning — they can't accidentally
// miss it because it overlays all content.
// MatDialog is already in the Angular Material design system we use.
@Component({
  selector: 'app-idle-timeout-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="idle-dialog">
      <div class="idle-icon">
        <mat-icon class="idle-main-icon">hourglass_bottom</mat-icon>
      </div>
      <h2 mat-dialog-title class="idle-title">Still trading?</h2>
      <mat-dialog-content class="idle-body">
        <p class="idle-sub">
          Your session has been idle for <strong>5 minutes</strong>.<br>
          For your security, we'll sign you out in:
        </p>
        <div class="idle-countdown">{{ secondsLeft() }}</div>
        <mat-progress-bar
          mode="determinate"
          [value]="progress()"
          class="idle-progress"
          color="warn">
        </mat-progress-bar>
        <p class="idle-hint">seconds remaining</p>
      </mat-dialog-content>
      <mat-dialog-actions class="idle-actions" align="center">
        <button mat-raised-button color="primary" (click)="stayIn()" class="idle-btn-stay">
          <mat-icon>trending_up</mat-icon>
          Keep me in — I'm trading!
        </button>
        <button mat-stroked-button (click)="signOut()" class="idle-btn-out">
          Sign out
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .idle-dialog {
      text-align: center;
      padding: 8px 8px 0;
      max-width: 360px;
    }
    .idle-icon {
      width: 72px; height: 72px; border-radius: 50%;
      background: rgba(255, 152, 0, 0.12);
      border: 2px solid rgba(255, 152, 0, 0.3);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .idle-main-icon { font-size: 36px; width: 36px; height: 36px; color: #ff9800; }
    .idle-title { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
    .idle-body { text-align: center; }
    .idle-sub { font-size: 14px; color: #8b949e; line-height: 1.6; margin-bottom: 20px; }
    .idle-countdown {
      font-size: 64px; font-weight: 900; color: #ff9800;
      font-family: monospace; line-height: 1; margin-bottom: 12px;
    }
    .idle-progress { border-radius: 4px; height: 8px; margin-bottom: 6px; }
    .idle-hint { font-size: 12px; color: #8b949e; margin: 0 0 8px; }
    .idle-actions { flex-direction: column; gap: 10px; padding-bottom: 16px; }
    .idle-btn-stay { width: 100%; height: 48px; font-weight: 700; font-size: 15px; }
    .idle-btn-out { width: 100%; }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.3); }
      50% { box-shadow: 0 0 0 12px rgba(255, 152, 0, 0); }
    }
  `],
})
export class IdleTimeoutDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<IdleTimeoutDialogComponent>);

  readonly TOTAL_SECONDS = 30;
  readonly secondsLeft = signal(this.TOTAL_SECONDS);
  readonly progress = signal(100);
  private countdown?: Subscription;

  ngOnInit(): void {
    // WHY take(TOTAL_SECONDS)? Automatically completes after 30 emissions.
    // Each emission = 1 second. After 30s, auto-logout.
    this.countdown = interval(1000).pipe(take(this.TOTAL_SECONDS)).subscribe({
      next: (i) => {
        const remaining = this.TOTAL_SECONDS - i - 1;
        this.secondsLeft.set(remaining);
        this.progress.set((remaining / this.TOTAL_SECONDS) * 100);
      },
      complete: () => {
        // 30 seconds elapsed without response — auto sign out
        this.dialogRef.close('timeout');
      }
    });
  }

  ngOnDestroy(): void {
    this.countdown?.unsubscribe();
  }

  stayIn(): void {
    this.dialogRef.close('stay');
  }

  signOut(): void {
    this.dialogRef.close('signout');
  }
}
