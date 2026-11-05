import React, { useEffect, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const updateTopic = 'meeliefont-updates';
const apkPathPattern = /^\/[a-z0-9._-]+\/MeelieFont-[^/]+\.apk$/i;

interface AppUpdate {
  version: string;
  apkUrl: string;
}

function parseUpdate(data: unknown): AppUpdate | null {
  if (!data || typeof data !== 'object') return null;

  const { version, apkUrl } = data as Record<string, unknown>;
  if (typeof version !== 'string' || typeof apkUrl !== 'string') {
    return null;
  }

  let downloadUrl: URL;
  try {
    downloadUrl = new URL(apkUrl);
  } catch {
    return null;
  }
  if (downloadUrl.protocol !== 'https:' || downloadUrl.hostname !== 'storage.googleapis.com' || !apkPathPattern.test(downloadUrl.pathname)) {
    return null;
  }

  return { version, apkUrl };
}

function openApkDownload(apkUrl: string): void {
  void Browser.open({ url: apkUrl }).catch((error: unknown) => {
    console.error('Could not open the APK download page:', error);
  });
}

export const UpdateNotifications: React.FC = () => {
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let active = true;
    const listeners: PluginListenerHandle[] = [];

    const showUpdateNotification = (data: unknown) => {
      const update = parseUpdate(data);
      if (active && update) setAvailableUpdate(update);
    };

    const handleNotificationAction = (data: unknown) => {
      const update = parseUpdate(data);
      if (!active || !update) return;
      openApkDownload(update.apkUrl);
    };

    const initializePushNotifications = async () => {
      try {
        const receivedListener = await FirebaseMessaging.addListener(
          'notificationReceived',
          (event) => showUpdateNotification(event.notification.data),
        );
        const actionListener = await FirebaseMessaging.addListener(
          'notificationActionPerformed',
          (event) => handleNotificationAction(event.notification.data),
        );
        if (!active) {
          void receivedListener.remove();
          void actionListener.remove();
          return;
        }
        listeners.push(receivedListener, actionListener);

        const permissions = await FirebaseMessaging.checkPermissions();
        const permissionState = permissions.receive === 'granted'
          ? 'granted'
          : (await FirebaseMessaging.requestPermissions()).receive;
        if (!active || permissionState !== 'granted') return;

        await FirebaseMessaging.subscribeToTopic({ topic: updateTopic });
      } catch (error) {
        if (active) console.error('Could not enable Android update notifications:', error);
      }
    };

    void initializePushNotifications();

    return () => {
      active = false;
      listeners.forEach((listener) => void listener.remove());
    };
  }, []);

  if (!availableUpdate) return null;

  return (
    <div className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-xl border border-[#D4CDC3] bg-white p-4 shadow-xl">
      <div>
        <p className="text-sm font-bold text-[#2C221E]">Pembaruan MeelieFont tersedia</p>
        <p className="text-xs text-[#7E6F64]">Versi {availableUpdate.version}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="text-xs font-medium text-[#7E6F64]"
          onClick={() => setAvailableUpdate(null)}
        >
          Nanti
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#c62828] px-3 py-2 text-xs font-semibold text-white hover:bg-[#a61f1f]"
          onClick={() => openApkDownload(availableUpdate.apkUrl)}
        >
          Unduh APK
        </button>
      </div>
    </div>
  );
};
