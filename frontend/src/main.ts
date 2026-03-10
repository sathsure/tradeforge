// WHY main.ts?
// This is the entry point of the Angular application.
// Angular CLI compiles this file first and everything is bootstrapped from here.

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// bootstrapApplication() is the modern Angular 18 way (standalone components).
// Old approach was bootstrapModule(AppModule) — now deprecated in favor of this.
// WHY standalone? No NgModule needed. Less boilerplate, tree-shakeable, faster builds.
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error('Bootstrap failed:', err));
