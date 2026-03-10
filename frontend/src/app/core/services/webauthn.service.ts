// WHY a dedicated WebAuthnService?
// The browser's navigator.credentials API works with ArrayBuffer, not base64 strings.
// This service handles all the binary<->base64url conversions so components stay clean.
// Components just call authenticate() or register() and receive typed results.

import { Injectable, inject } from '@angular/core';
import { from, Observable, switchMap } from 'rxjs';
import { TwoFactorService } from './two-factor.service';
import { WebAuthnAssertionPayload, WebAuthnRegistrationRequest } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class WebAuthnService {
  private readonly twoFactorService = inject(TwoFactorService);

  // WHY runtime check? SSR environments and old browsers don't have PublicKeyCredential.
  // Callers check isSupported() before showing the biometric button.
  isSupported(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential;
  }

  // Registers a new WebAuthn credential (fingerprint / face ID enrollment)
  register(deviceName: string): Observable<any> {
    return this.twoFactorService.getWebAuthnRegisterOptions().pipe(
      // WHY switchMap + from()? getWebAuthnRegisterOptions returns an Observable.
      // performRegistration is async — from() wraps the Promise into an Observable.
      // switchMap cancels any in-flight registration if called again.
      switchMap(options => from(this.performRegistration(options, deviceName)))
    );
  }

  // Authenticates using WebAuthn during login (assertion flow)
  authenticate(tempToken: string, trustDevice: boolean): Observable<WebAuthnAssertionPayload> {
    return this.twoFactorService.getWebAuthnAssertionOptions(tempToken).pipe(
      switchMap(options => from(this.performAuthentication(options, tempToken, trustDevice)))
    );
  }

  private async performRegistration(options: any, deviceName: string): Promise<any> {
    // WHY convert challenge and user.id? The WebAuthn API requires ArrayBuffer.
    // Servers send base64url-encoded binary — we decode before passing to the browser.
    const publicKey: PublicKeyCredentialCreationOptions = {
      ...options,
      challenge: this.base64ToBuffer(options.challenge),
      user: { ...options.user, id: this.base64ToBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
        ...c, id: this.base64ToBuffer(c.id)
      }))
    };
    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
    const resp = credential.response as AuthenticatorAttestationResponse;
    // WHY encode back to base64? HTTP/JSON can't carry raw ArrayBuffers.
    // Server expects base64url-encoded attestationObject and clientDataJSON.
    const req: WebAuthnRegistrationRequest = {
      deviceName,
      attestationObject: this.bufferToBase64(resp.attestationObject),
      clientDataJSON: this.bufferToBase64(resp.clientDataJSON),
    };
    return req;
  }

  private async performAuthentication(
    options: any, tempToken: string, trustDevice: boolean
  ): Promise<WebAuthnAssertionPayload> {
    const publicKey: PublicKeyCredentialRequestOptions = {
      ...options,
      challenge: this.base64ToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c: any) => ({
        ...c, id: this.base64ToBuffer(c.id)
      }))
    };
    const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
    const resp = credential.response as AuthenticatorAssertionResponse;
    return {
      tempToken,
      credentialId: credential.id,
      clientDataJSON: this.bufferToBase64(resp.clientDataJSON),
      authenticatorData: this.bufferToBase64(resp.authenticatorData),
      signature: this.bufferToBase64(resp.signature),
      // WHY optional userHandle? Not all authenticators return it.
      userHandle: resp.userHandle ? this.bufferToBase64(resp.userHandle) : undefined,
      trustDevice,
    };
  }

  // WHY base64url? WebAuthn uses base64url (RFC 4648 §5): + → -, / → _, no padding.
  // Standard atob() handles base64 but not base64url — we normalise first.
  private base64ToBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  private bufferToBase64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
