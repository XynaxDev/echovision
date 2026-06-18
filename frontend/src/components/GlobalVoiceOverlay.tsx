/**
 * EchoVision — Global Voice Overlay (Gemini Style)
 *
 * A premium sliding pill overlay with liquid gradient animations.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAppTheme } from "../context/ThemeContext";
import { useVoiceContext } from "../context/VoiceContext";
import { EdgeGlow } from "./EdgeGlow";

const { width } = Dimensions.get("window");

export function GlobalVoiceOverlay(): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const { isVoiceActive, toggleVoice } = useVoiceContext();

  const slideAnim = useRef(new Animated.Value(150)).current; // Start off-screen
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleXAnim = useRef(new Animated.Value(1)).current;

  // Blob Animations
  const blobX1 = useRef(new Animated.Value(-40)).current;
  const blobX2 = useRef(new Animated.Value(40)).current;
  const blobScale1 = useRef(new Animated.Value(1)).current;
  const blobScale2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isVoiceActive) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleXAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
      ]).start();

      // Fluid Gradient Animations inside the pill
      Animated.loop(
        Animated.sequence([
          Animated.timing(blobX1, { toValue: 20, duration: 2000, useNativeDriver: true }),
          Animated.timing(blobX1, { toValue: -40, duration: 2500, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(blobX2, { toValue: -20, duration: 2200, useNativeDriver: true }),
          Animated.timing(blobX2, { toValue: 40, duration: 1800, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(blobScale1, { toValue: 1.4, duration: 1500, useNativeDriver: true }),
          Animated.timing(blobScale1, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(blobScale2, { toValue: 1.5, duration: 1800, useNativeDriver: true }),
          Animated.timing(blobScale2, { toValue: 1, duration: 1800, useNativeDriver: true }),
        ])
      ).start();

    } else {
      Animated.parallel([
        Animated.timing(scaleXAnim, {
          toValue: 0.4,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 200,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      blobX1.stopAnimation(); blobX2.stopAnimation();
      blobScale1.stopAnimation(); blobScale2.stopAnimation();
    }
  }, [isVoiceActive]);

  return (
    <Animated.View
      pointerEvents={isVoiceActive ? "box-none" : "none"}
      style={[
        styles.overlayContainer,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <EdgeGlow active={isVoiceActive} />

      <Animated.View style={{ transform: [{ scaleX: scaleXAnim }, { translateY: slideAnim }] }}>
        <Pressable 
          style={styles.pillContainer} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleVoice();
          }}
        >
        {/* Animated Gradient Orbs inside Pill (Overflow Hidden) */}
        <Animated.View
          style={[
            styles.gradientBlob,
            { backgroundColor: "#00E5FF", transform: [{ translateX: blobX1 }, { scale: blobScale1 }] }, // Cyan
          ]}
        />
        <Animated.View
          style={[
            styles.gradientBlob,
            { backgroundColor: "#FF007F", left: 80, transform: [{ translateX: blobX2 }, { scale: blobScale2 }] }, // Deep Pink
          ]}
        />
        <Animated.View
          style={[
            styles.gradientBlob,
            { backgroundColor: "#8A2BE2", left: 160, opacity: 0.8 }, // Blue Violet
          ]}
        />
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 40,
    zIndex: 99999, // Ensure it floats above absolutely everything
  },
  edgeGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderWidth: 6,
    borderColor: "rgba(0, 229, 255, 0.4)", // Cyan edge glow
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  pillContainer: {
    width: width * 0.6,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#18181B",
    overflow: "hidden", // Crucial for Gemini style mask
    justifyContent: "center",
    alignItems: "center",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  gradientBlob: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    filter: "blur(18px)", // Smooths the circles into a liquid gradient
    opacity: 0.95,
  },
});
