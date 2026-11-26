import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { getErrorMessage, getSupabaseErrorMessage } from '../lib/errorMessage';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const updateTopic = 'meeliefont-updates';

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type NotificationPlatform = 'android' | 'web' | 'unsupported';

export interface NotificationStatus {
  platform: NotificationPlatform;
  supported: boolean;
  permission: string;
  subscribed: boolean;
  configured: boolean;
  iosNeedsStandalone: boolean;
}

export function isWebPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isAndroidPlatform(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isIosStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(standalone);
}

export function getNotificationPlatform(): NotificationPlatform {
  if (isAndroidPlatform()) return 'android';
  return isWebPushSupported() ? 'web' : 'unsupported';
}

export function describeNotificationError(error: unknown): string {
  const message = getErrorMessage(error, 'Notifikasi update gagal diaktifkan.');
  const lower = message.toLowerCase();

  if (lower.includes('registration failed') || lower.includes('push service') || lower.includes('subscribe')) {
    return 'Browser gagal mendaftar ke layanan push. Pastikan aplikasi dibuka lewat HTTPS atau localhost, file /sw.js dapat diakses, dan kunci VAPID valid.';
  }
  if (lower.includes('permission') || lower.includes('izin')) {
    return 'Izin notifikasi belum diberikan. Aktifkan notifikasi untuk situs ini di pengaturan browser.';
  }
  if (lower.includes('vapid')) {
    return 'Kunci VAPID belum valid. Periksa VITE_VAPID_PUBLIC_KEY pada konfigurasi aplikasi.';
  }
  return message;
}

export function getVapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';
}

export function isValidVapidPublicKey(key: string): boolean {
  if (!key) return false;
  try {
    return urlBase64ToUint8Array(key).length === 65;
  } catch {
    return false;
  }
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
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscriptionPayload> {
  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) throw new Error('Kunci VAPID belum dikonfigurasi (VITE_VAPID_PUBLIC_KEY).');
  if (!isValidVapidPublicKey(vapidPublicKey)) throw new Error('Kunci VAPID tidak valid (VITE_VAPID_PUBLIC_KEY).');
  if (!isWebPushSupported()) throw new Error('Browser ini tidak mendukung Web Push.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');

  const existing = await getPushSubscription();
  if (existing) await existing.unsubscribe();

  const registration = await registerServiceWorker();
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
    throw new Error('Supabase belum dikonfigurasi, langganan notifikasi tidak dapat disimpan.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Masuk ke akun untuk mengaktifkan notifikasi update.');
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: authData.user.id,
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
      platform,
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) throw new Error(`Langganan notifikasi gagal disimpan: ${getSupabaseErrorMessage(error)}`);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(`Langganan notifikasi gagal dihapus: ${getSupabaseErrorMessage(error)}`);
}

export async function disableAndroidNotifications(): Promise<void> {
  if (!isAndroidPlatform()) return;
  await FirebaseMessaging.unsubscribeFromTopic({ topic: updateTopic });
}

export async function getAndroidNotificationStatus(): Promise<string> {
  if (!isAndroidPlatform()) return 'unsupported';
  const { receive } = await FirebaseMessaging.checkPermissions();
  return receive;
}

export async function enableAndroidNotifications(): Promise<void> {
  if (!isAndroidPlatform()) throw new Error('Notifikasi Android hanya tersedia di aplikasi Android.');
  const current = await FirebaseMessaging.checkPermissions();
  const receive = current.receive === 'granted'
    ? current.receive
    : (await FirebaseMessaging.requestPermissions()).receive;
  if (receive !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');
  await FirebaseMessaging.subscribeToTopic({ topic: updateTopic });
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  const platform = getNotificationPlatform();
  if (platform === 'android') {
    const permission = await getAndroidNotificationStatus().catch(() => 'prompt');
    return {
      platform,
      supported: true,
      permission,
      subscribed: permission === 'granted',
      configured: true,
      iosNeedsStandalone: false,
    };
  }
  if (platform === 'web') {
    const subscription = await getPushSubscription().catch(() => null);
    return {
      platform,
      supported: true,
      permission: Notification.permission,
      subscribed: Boolean(subscription),
      configured: isValidVapidPublicKey(getVapidPublicKey()),
      iosNeedsStandalone: isIosDevice() && !isIosStandalone(),
    };
  }
  return {
    platform,
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    configured: false,
    iosNeedsStandalone: false,
  };
}

export async function showTestNotification(): Promise<void> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') {
    throw new Error('Izin notifikasi belum aktif.');
  }
  const registration = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  await registration.showNotification('MeelieFont', {
    body: 'Notifikasi uji berhasil. Update aplikasi akan muncul di sini.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/settings' },
  });
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Langganan notifikasi tidak memiliki endpoint atau kunci.');
  }
  return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}
