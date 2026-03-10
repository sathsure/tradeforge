// WHY app.component.ts?
// The ROOT component — Angular mounts this first, all other components live inside it.
// It contains <router-outlet> which acts as the placeholder where routed components appear.
//
// WHY OnInit here?
// AppComponent is the earliest lifecycle hook we can reliably use.
// ThemeService.init() subscribes to the settings store and applies the saved theme
// before any feature component renders. This prevents a flash of the wrong theme.

import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {

  private readonly themeService = inject(ThemeService);
  // WHY inject instead of constructor param?
  // Modern Angular 14+ pattern. Equivalent to constructor injection but
  // usable anywhere — no constructor boilerplate, easier to test.

  title = 'TradeForge';

  ngOnInit(): void {
    // WHY here instead of the constructor?
    // ngOnInit fires after Angular has set up bindings and the DI tree is stable.
    // The store is guaranteed to be ready here.
    // Constructor injection is fine for services, but DOM/store reads need ngOnInit.
    this.themeService.init();
  }
}
