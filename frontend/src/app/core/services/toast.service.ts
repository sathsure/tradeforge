// WHY a ToastService?
// Centralises all toast/snackbar calls in one place.
// Components and Effects call toast.success() / toast.error() instead of
// importing and configuring MatSnackBar everywhere individually.
// Consistent styling, position, duration — change once, applies everywhere.

import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastComponent, ToastData } from '../../shared/components/toast/toast.component';

@Injectable({ providedIn: 'root' })
export class ToastService {

  private readonly snackBar = inject(MatSnackBar);

  // WHY 4200ms? Matches the CSS progress-bar animation (4s).
  // Long enough to read a two-line message, short enough not to annoy.
  private readonly DURATION = 4200;

  success(title: string, message: string): void {
    this.show({ type: 'success', title, message });
  }

  error(title: string, message: string): void {
    this.show({ type: 'error', title, message });
  }

  private show(data: ToastData): void {
    this.snackBar.openFromComponent(ToastComponent, {
      data,
      duration: this.DURATION,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['tf-toast-panel'],
    });
  }
}
