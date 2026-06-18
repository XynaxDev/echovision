/**
 * EchoVision — Emergency SOS Button Component
 *
 * A full-screen emergency button that requires a continuous 3-second
 * long-press to activate. Features a circular progress indicator
 * that fills during the hold, and triggers heavy haptic feedback
 * throughout the interaction.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { useAppTheme } from "../context/ThemeContext";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface SOSButtonProps {
  /** Called when the 3-second long-press is verified */
  onActivate: () => void;
  /** Whether the SOS action is currently being processed */
  isProcessing?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const HOLD_DURATION_MS = 3000;
const HAPTIC_INTERVAL_MS = 300;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function SOSButton({
  onActivate,
  isProcessing = false,
}: SOSButtonProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef<number>(0);

  const cleanup = useCallback((): void => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    if (hapticTimer.current) {
      clearInterval(hapticTimer.current);
      hapticTimer.current = null;
    }
  }, []);

  const handlePressIn = useCallback((): void => {
    if (isProcessing) return;

    setIsHolding(true);
    startTime.current = Date.now();

    // Initial heavy haptic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Start progress animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      useNativeDriver: false,
    }).start();

    // Update progress state for text display
    holdTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const currentProgress = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setProgress(currentProgress);

      if (currentProgress >= 1) {
        cleanup();
        setIsHolding(false);
        setProgress(0);
        progressAnim.setValue(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onActivate();
      }
    }, 50);

    // Continuous haptic feedback during hold
    hapticTimer.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, HAPTIC_INTERVAL_MS);
  }, [isProcessing, onActivate, cleanup, progressAnim]);

  const handlePressOut = useCallback((): void => {
    cleanup();
    setIsHolding(false);
    setProgress(0);
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
  }, [cleanup, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const remainingSeconds = Math.ceil(
    (HOLD_DURATION_MS - progress * HOLD_DURATION_MS) / 1000,
  );

  return (
    <View style={styles.container}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isProcessing}
        style={[
          styles.button,
          {
            backgroundColor: isProcessing
              ? colors.textDisabled
              : colors.danger,
            opacity: isProcessing ? 0.6 : 1,
          },
        ]}
        accessibilityLabel="Emergency SOS button"
        accessibilityHint="Press and hold for 3 seconds to trigger emergency SOS. This will share your location via SMS and open the phone dialer."
        accessibilityRole="button"
      >
        {/* Progress fill overlay */}
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressWidth,
              backgroundColor: colors.dangerDark,
            },
          ]}
        />

        {/* Content overlay */}
        <View style={styles.content}>
          <View style={styles.sosIcon}>
            <Feather name="alert-triangle" size={72} color="#FFFFFF" />
          </View>
          <Text style={styles.sosTitle}>EMERGENCY SOS</Text>
          {isProcessing ? (
            <Text style={styles.sosSubtitle}>Processing...</Text>
          ) : isHolding ? (
            <Text style={styles.sosSubtitle}>
              Hold for {remainingSeconds}s...
            </Text>
          ) : (
            <Text style={styles.sosSubtitle}>
              Press and hold for 3 seconds
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  button: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    elevation: 12,
    shadowColor: "#FF0000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  sosIcon: {
    marginBottom: 16,
  },
  sosTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
    marginBottom: 12,
  },
  sosSubtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
  },
});
