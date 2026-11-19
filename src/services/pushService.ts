// Web Push subscription helpers (Tahap G — iOS PWA / web notifications).
// The service worker lives at /public/sw.js; VAPID public key is a build-time
// env (VITE_VAPID_PUBLIC_KEY), private key only ever exists server-side.

import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function isWebPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** iOS only delivers Web Push to apps added to the Home Screen (standalone). */
export function isIosStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(standalone);
}

export function getVapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscriptionPayload> {
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) throw new Error('VAPID public key is not configured (VITE_VAPID_PUBLIC_KEY).');
  if (!isWebPushSupported()) throw new Error('Web Push is not supported in this browser.');

  const registration = await registerServiceWorker();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  return toPayload(subscription);
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getPushSubscription();
  if (!subscription) return false;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await removePushSubscription(endpoint);
  return true;
}

export async function savePushSubscription(payload: PushSubscriptionPayload, platform: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured — cannot store the push subscription.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('You must be signed in to enable update notifications.');
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: authData.user.id,
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
      platform,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(`Could not store push subscription: ${error.message}`);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(`Could not remove push subscription: ${error.message}`);
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Push subscription is missing endpoint or keys.');
  }
  return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}
