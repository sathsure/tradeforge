// WHY a 404 NotFoundComponent?
// Without it, any unknown URL (/typo, /invalid) would show a blank page.
// The ** wildcard route in app.routes.ts catches all unmatched routes and shows this.
// A helpful 404 page guides users back to a working part of the app.
//
// WHY standalone: true?
// NotFoundComponent is lazily loaded (only downloaded when user hits an unknown URL).
// Being standalone means it carries no NgModule overhead — minimal chunk size.

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent {
  // WHY no logic here?
  // A 404 page has nothing to compute — just navigation links.
  // Zero state, zero subscriptions, zero services.
  // The leanest component possible.
}
