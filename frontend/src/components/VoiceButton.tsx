/**
 * EchoVision — Voice Assistant Button Component
 *
 * A large, persistent circular button designed for voice command activation.
 * Provides heavy haptic feedback on press and visual pulse animation
 * while recording is active.
 */

import React, { useEffect, useRef } from "react";
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

interface VoiceButtonProps {
  /** Whether the microphone is currently recording */
  isRecording: boolean;
  /** Called when the user presses the button */
  onPress: () => void;
  /** Optional size override (default: 80) */
  size?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function VoiceButton({
  isRecording,
  onPress,
  size = 80,
}: VoiceButtonProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.3,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.6);
    }
  }, [isRecording, pulseAnim, opacityAnim]);

  const handlePress = (): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onPress();
  };

  const buttonColor = isRecording ? colors.danger : colors.primary;

  return (
    <View
      style={[styles.container, { width: size * 1.6, height: size * 1.6 }]}
      accessibilityLabel={isRecording ? "Stop recording voice command" : "Start voice command"}
      accessibilityHint={
        isRecording
          ? "Double tap to stop recording your voice command"
          : "Double tap to start recording a voice command for navigation"
      }
      accessibilityRole="button"
    >
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            borderColor: buttonColor,
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />

      {/* Main button */}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: buttonColor,
            opacity: pressed ? 0.8 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}
      >
        {isRecording ? (
          <Feather name="square" size={size * 0.4} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Feather name="mic" size={size * 0.4} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 3,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
