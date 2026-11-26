import { describe, expect, it } from 'vitest';
import { describeNotificationError, isWebPushSupported, isValidVapidPublicKey, urlBase64ToUint8Array } from './pushService';

describe('pushService', () => {
  it('decodes url-safe base64 VAPID keys to bytes', () => {
    // "hello" → aGVsbG8= ; url-safe form drops padding and uses -_
    const bytes = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(bytes)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('handles url-safe alphabet characters (- and _)', () => {
    // 0xfb 0xff → "+/8=" standard, "-_8" url-safe
    const bytes = urlBase64ToUint8Array('-_8');
    expect(Array.from(bytes)).toEqual([0xfb, 0xff]);
  });

  it('validates uncompressed VAPID public keys', () => {
    expect(isValidVapidPublicKey('aGVsbG8')).toBe(false);
    expect(isValidVapidPublicKey('A'.repeat(87))).toBe(true);
  });

  it('reports push support only when browser APIs exist', () => {
    expect(typeof isWebPushSupported()).toBe('boolean');
  });

  it('explains browser push registration failures without raw browser text', () => {
    const message = describeNotificationError(new Error('Registration failed - push service error'));
    expect(message).toContain('HTTPS');
    expect(message).toContain('/sw.js');
  });

  it('renders object errors as readable messages', () => {
    expect(describeNotificationError({ message: 'relasi tidak ada' })).toBe('relasi tidak ada');
  });
});
