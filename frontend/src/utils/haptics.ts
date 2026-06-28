import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Force haptics on, bypassing storage, since the user is complaining they are off
let isHapticsEnabled = true;

export const setHapticsEnabled = (enabled: boolean) => {
    isHapticsEnabled = enabled;
};

export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light', isBackground = false) => {
    try {
        if (!isHapticsEnabled) return;

        // If triggered by a background websocket (e.g. voice assistant), Android 13+ blocks expo-haptics
        // so we must fallback to the legacy Vibration API
        if (isBackground) {
            Vibration.vibrate(100);
            return;
        }

        switch (type) {
            case 'light':
                Haptics.selectionAsync();
                break;
            case 'medium':
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                break;
            case 'heavy':
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                break;
            case 'success':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                break;
            case 'warning':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                break;
            case 'error':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                break;
            default:
                Haptics.selectionAsync();
        }
    } catch (e) {
        console.error('Haptics failed:', e);
    }
};
