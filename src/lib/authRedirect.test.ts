import { describe, expect, it } from 'vitest';
import { resolveAuthRedirectUrl } from './authRedirect';

describe('resolveAuthRedirectUrl', () => {
  it('uses the current app origin when no production URL is configured', () => {
    expect(resolveAuthRedirectUrl(undefined, 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('uses the configured HTTPS production origin', () => {
    expect(resolveAuthRedirectUrl('https://kiluadev.my.id/path', 'http://localhost:3000'))
      .toBe('https://kiluadev.my.id');
  });

  it('allows HTTP only for local development', () => {
    expect(resolveAuthRedirectUrl('http://localhost:3000', 'https://app.example'))
      .toBe('http://localhost:3000');
    expect(() => resolveAuthRedirectUrl('http://app.example', 'https://app.example'))
      .toThrow('must use HTTPS');
  });

  it('rejects invalid URLs and embedded credentials', () => {
    expect(() => resolveAuthRedirectUrl('not a URL', 'https://app.example'))
      .toThrow('valid absolute URL');
    expect(() => resolveAuthRedirectUrl('https://user:pass@app.example', 'https://app.example'))
      .toThrow('must not contain credentials');
  });
});
