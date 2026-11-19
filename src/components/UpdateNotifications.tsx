import React, { useEffect } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const updateTopic = 'meeliefont-updates';

interface UpdateNotificationsProps {
  onUpdateSignal?: () => void;
}

export const UpdateNotifications: React.FC<UpdateNotificationsProps> = ({ onUpdateSignal }) => {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let active = true;
    const listeners: PluginListenerHandle[] = [];
    const signal = () => onUpdateSignal?.();

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
  }, [onUpdateSignal]);

  return null;
};
