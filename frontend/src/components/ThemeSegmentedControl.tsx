/**
 * EchoVision — Theme Segmented Control Component
 *
 * A custom segmented control allowing users to switch between
 * Light, Dark, and System Default theme modes. Includes haptic
 * feedback on selection and animated indicator.
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

import { useAppTheme } from "../context/ThemeContext";
import type { ThemeMode } from "../constants/Colors";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface SegmentOption {
  value: ThemeMode;
  label: string;
  icon: string;
}

const SEGMENTS: SegmentOption[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "📱" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function ThemeSegmentedControl(): React.JSX.Element {
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Animate the selected indicator position
  const selectedIndex = SEGMENTS.findIndex((s) => s.value === themeMode);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: selectedIndex,
      useNativeDriver: true,
      tension: 68,
      friction: 10,
    }).start();
  }, [selectedIndex, slideAnim]);

  const handleSelect = (mode: ThemeMode): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setThemeMode(mode);
  };

  const segmentWidth = 100; // Approximate width per segment

  return (
    <View
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityLabel="Theme mode selector"
      accessibilityHint="Select between light mode, dark mode, or system default"
      accessibilityRole="radiogroup"
    >
      {/* Animated selection indicator */}
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: colors.primary,
            width: `${100 / SEGMENTS.length}%` as unknown as number,
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, segmentWidth, segmentWidth * 2],
                }),
              },
            ],
          },
        ]}
      />

      {/* Segment buttons */}
      {SEGMENTS.map((segment) => {
        const isSelected = themeMode === segment.value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => handleSelect(segment.value)}
            style={styles.segment}
            accessibilityLabel={`${segment.label} mode`}
            accessibilityHint={`Switch to ${segment.label.toLowerCase()} mode`}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={styles.segmentIcon}>{segment.icon}</Text>
            <Text
              style={[
                styles.segmentLabel,
                {
                  color: isSelected ? colors.background : colors.text,
                  fontWeight: isSelected ? "700" : "500",
                },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    height: 56,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 15,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    gap: 6,
  },
  segmentIcon: {
    fontSize: 16,
  },
  segmentLabel: {
    fontSize: 14,
  },
});
