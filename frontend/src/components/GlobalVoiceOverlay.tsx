/**
 * EchoVision — Global Voice Overlay (Gemini Style)
 *
 * A premium sliding pill overlay with liquid gradient animations and glassmorphic blur.
 */

import React, { useEffect, useRef } from "react";
import { triggerHaptic } from "../utils/haptics";
import { Animated, Dimensions, Pressable, StyleSheet, View, Platform, Easing } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { useAppTheme } from "../context/ThemeContext";
import { useVoiceContext } from "../context/VoiceContext";
import { EdgeGlow } from "./EdgeGlow";

const { width } = Dimensions.get("window");

export function GlobalVoiceOverlay(): React.JSX.Element | null {
  const { colors, isDark } = useAppTheme();
  const { isVoiceActive, activePage, toggleVoice } = useVoiceContext();

  const showPill = isVoiceActive && activePage !== "Scene Scanner" && activePage !== "Text Reader" && activePage !== "SOSConfirmation";

  const slideAnim = useRef(new Animated.Value(150)).current; // Start off-screen
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleXAnim = useRef(new Animated.Value(1)).current;
  const widthAnim = useRef(new Animated.Value(64)).current; // Start as circle

  // Blob Animations
  const blobX1 = useRef(new Animated.Value(-40)).current;
  const blobX2 = useRef(new Animated.Value(40)).current;
  const blobScale1 = useRef(new Animated.Value(1)).current;
  const blobScale2 = useRef(new Animated.Value(1)).current;

  const blobY1 = useRef(new Animated.Value(-10)).current;
  const blobY2 = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (showPill) {
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
        Animated.spring(widthAnim, {
          toValue: width * 0.48,
          useNativeDriver: false,
          tension: 60,
          friction: 8,
        }),
      ]).start();

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
        Animated.timing(widthAnim, {
          toValue: 64,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showPill]);

  // Run blob animations continuously in the background to prevent glitchy resets
  useEffect(() => {
    const createLoop = (val: Animated.Value, to1: number, to2: number, to3: number, dur1: number, dur2: number, dur3: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: to1, duration: dur1, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: to2, duration: dur2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: to3, duration: dur3, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    };

    // Wavy horizontal sweeps mimicking sound waves
    createLoop(blobX1, 70, -60, 0, 1200, 1400, 1300);
    createLoop(blobX2, -70, 60, 0, 1300, 1200, 1400);
    
    // Rapid vertical bouncing (wavy effect)
    createLoop(blobY1, 40, -40, 0, 800, 900, 850);
    createLoop(blobY2, -40, 40, 0, 900, 850, 950);
    
    // Gentle pulsating scales (no crazy heartbeat)
    Animated.loop(
      Animated.sequence([
        Animated.timing(blobScale1, { toValue: 1.4, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blobScale1, { toValue: 1.0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blobScale2, { toValue: 1.5, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blobScale2, { toValue: 1.1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View
      pointerEvents={isVoiceActive ? "box-none" : "none"}
      style={styles.overlayContainer}
    >
      <EdgeGlow active={isVoiceActive} />
      <Animated.View 
        pointerEvents={showPill ? "auto" : "none"}
        style={{ opacity: fadeAnim, transform: [{ scaleX: scaleXAnim }, { translateY: slideAnim }] }}
      >
        <Pressable 
          style={styles.pillTouch}
          onPress={() => {
            triggerHaptic("light");
            toggleVoice();
          }}
        >
          <Animated.View
            style={[
              styles.pillContainer, 
              {
                width: widthAnim,
                backgroundColor: isDark ? "#18181B" : "#FFFFFF",
                borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.12)",
                shadowColor: "#00E5FF", // Neon Cyan glow
              }
            ]} 
          >
            <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject}>
              {/* Animated Gradient Orbs inside Pill (Overflow Hidden) */}
              <Animated.View style={[styles.gradientBlob, { left: 10, transform: [{ translateX: blobX1 }, { translateY: blobY1 }, { scale: blobScale1 }] }]}>
                <LinearGradient colors={["rgba(0,229,255,0.9)", "rgba(0,229,255,0)"]} start={{x:0.5, y:0.5}} end={{x:1, y:1}} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
              
              <Animated.View style={[styles.gradientBlob, { left: 60, transform: [{ translateX: blobX2 }, { translateY: blobY2 }, { scale: blobScale2 }] }]}>
                <LinearGradient colors={["rgba(230,240,255,0.95)", "rgba(230,240,255,0)"]} start={{x:0.5, y:0.5}} end={{x:0, y:0}} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
              
              <Animated.View style={[styles.gradientBlob, { left: 110, transform: [{ translateX: blobX1 }, { translateY: blobY2 }, { scale: blobScale2 }] }]}>
                <LinearGradient colors={["rgba(255,0,127,0.85)", "rgba(255,0,127,0)"]} start={{x:0.5, y:0.5}} end={{x:1, y:0}} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
              
              {/* Highlight Sweep */}
              <Animated.View style={[styles.gradientBlob, { left: 80, transform: [{ translateX: blobX2 }, { translateY: blobY1 }, { scale: blobScale1 }] }]}>
                <LinearGradient colors={["rgba(138,43,226,0.9)", "rgba(138,43,226,0)"]} start={{x:0.5, y:0.5}} end={{x:0, y:1}} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
            </BlurView>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 28 : 20, // Match center alignment of bottom navbar
    zIndex: 99999, // Ensure it floats above absolutely everything
  },
  pillTouch: {
    padding: 8, // Increase touch target size
  },
  pillContainer: {
    height: 64,
    borderRadius: 32,
    overflow: "hidden", // Crucial for Gemini style mask
    justifyContent: "center",
    alignItems: "center",
    elevation: 20,
    shadowColor: "#00E5FF", // Vibrant glowing cyan shadow to match theme
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    borderWidth: 1.5,
  },
  gradientBlob: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    filter: "blur(28px)", // Heavy blur for seamless liquid plasma effect
    opacity: 1, 
  },
});
