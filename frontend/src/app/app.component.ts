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
import { fromEvent } from 'rxjs';
import { environment } from '../environments/environment';

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

    // WHY ping ALL warmupUrls? Each Render free-tier service sleeps independently.
    // Pinging only the gateway wakes it, but auth-service / order-service / portfolio-service
    // each have their own sleep timer. If auth-service is still cold when the user submits
    // the registration form, the gateway returns 502 ("Bad Gateway") to the user.
    // Firing all pings in parallel at app load gives every service 60-90s to wake up
    // while the user reads the page / fills the form. Fire-and-forget: CORS blocks are
    // expected (the server still receives the TCP request and wakes up even if CORS rejects
    // the response in the browser).
    environment.warmupUrls.forEach(url => fetch(url).catch(() => {}));

    // WHY listen for visibilitychange? The 24h tf_last_seen expiry should only count
    // when the tab is completely closed — not when it's open but idle.
    // Whenever the user brings the tab back into focus, update tf_last_seen so the
    // 24h window resets. The session stays alive as long as the tab is open.
    fromEvent(document, 'visibilitychange').subscribe(() => {
      if (!document.hidden) {
        const token = localStorage.getItem('refreshToken');
        if (token) localStorage.setItem('tf_last_seen', Date.now().toString());
      }
    });
  }
}
