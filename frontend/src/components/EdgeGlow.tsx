/**
 * EchoVision — Premium Ambient Edge Glow
 *
 * A very soft, ambient light that hugs the screen edges and breathes.
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

interface EdgeGlowProps {
  active: boolean;
}

export function EdgeGlow({ active }: EdgeGlowProps): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [active]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { opacity: opacityAnim, transform: [{ scale }] },
      ]}
    >
      <View style={[styles.ambientBorder, { borderColor: "#8A2BE2" }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 0,
  },
  ambientBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 40,
    borderRadius: 60,
    opacity: 0.15,
    filter: "blur(20px)",
  },
});
