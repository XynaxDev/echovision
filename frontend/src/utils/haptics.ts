import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

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
                Haptics.selectionAsync().catch(() => Vibration.vibrate(30));
                break;
            case 'medium':
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => Vibration.vibrate(50));
                break;
            case 'heavy':
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => Vibration.vibrate(100));
                break;
            case 'success':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => Vibration.vibrate(80));
                break;
            case 'warning':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => Vibration.vibrate(80));
                break;
            case 'error':
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => Vibration.vibrate(120));
                break;
            default:
                Haptics.selectionAsync().catch(() => Vibration.vibrate(30));
        }
    } catch (e) {
        // Last-resort fallback: if the entire expo-haptics module is missing/broken,
        // still provide tactile feedback through the legacy API
        try { Vibration.vibrate(50); } catch (_) {}
    }
};
