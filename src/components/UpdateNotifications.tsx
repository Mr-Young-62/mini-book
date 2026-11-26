import React, { useEffect, useRef } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { enableAndroidNotifications, isAndroidPlatform } from '../services/pushService';

interface UpdateNotificationsProps {
  onUpdateSignal?: () => void;
}

export const UpdateNotifications: React.FC<UpdateNotificationsProps> = ({ onUpdateSignal }) => {
  const onUpdateSignalRef = useRef(onUpdateSignal);

  useEffect(() => {
    onUpdateSignalRef.current = onUpdateSignal;
  }, [onUpdateSignal]);

  useEffect(() => {
    if (!isAndroidPlatform()) return;

    let active = true;
    const listeners: PluginListenerHandle[] = [];
    const signal = () => onUpdateSignalRef.current?.();

    const initializePushNotifications = async () => {
      try {
        const receivedListener = await FirebaseMessaging.addListener('notificationReceived', signal);
        const actionListener = await FirebaseMessaging.addListener('notificationActionPerformed', signal);
        if (!active) {
          void receivedListener.remove();
          void actionListener.remove();
          return;
        }
        listeners.push(receivedListener, actionListener);

        await enableAndroidNotifications();
        if (!active) return;
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

  return null;
};
