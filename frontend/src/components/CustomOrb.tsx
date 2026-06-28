import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface CustomOrbProps {
  size: number;
}

export function CustomOrb({ size }: CustomOrbProps) {
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const r3 = useRef(new Animated.Value(0)).current;
  const r4 = useRef(new Animated.Value(0)).current;
  const r5 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const t1 = useRef(new Animated.Value(0)).current;
  const t2 = useRef(new Animated.Value(0)).current;
  const t3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true })
      ).start();

    const float = (v: Animated.Value, ms: number, to: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: -to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();

    // Slightly faster rotations
    spin(r1, 3500); 
    spin(r2, 4500); 
    spin(r3, 6000); 
    spin(r4, 4000); 
    
    // Larger translation amplitude for highly visible fluid movement
    float(t1, 3000, 40);
    float(t2, 4000, 50);
    float(t3, 3500, 40);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.02, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.98, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const deg = (v: Animated.Value, rev = false) =>
    v.interpolate({ inputRange: [0, 1], outputRange: rev ? ["360deg", "0deg"] : ["0deg", "360deg"] });

  const L = size * 2.2;
  const off = -L / 2 + size / 2;

  return (
    <Animated.View
      style={[styles.outer, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: pulse }] }]}
    >
      {/* Base — Deep Space Dark */}
      <LinearGradient
        colors={["#0A001A", "#05000F", "#1A0033"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Layer 1 — Bright Cyan Blob */}
      <Animated.View style={[styles.layer, { width: size * 1.8, height: size * 1.8, marginLeft: size * -0.4, marginTop: size * -0.4, transform: [{ translateX: t1 }, { translateY: t2 }, { rotate: deg(r1) }] }]}>
        <LinearGradient
          colors={["rgba(0,229,255,1)", "rgba(0,229,255,0)"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Layer 2 — Electric Pink Blob */}
      <Animated.View style={[styles.layer, { width: size * 1.8, height: size * 1.8, marginLeft: size * -0.4, marginTop: size * -0.4, transform: [{ translateX: t2 }, { translateY: t3 }, { rotate: deg(r3) }] }]}>
        <LinearGradient
          colors={["rgba(255,0,127,1)", "rgba(255,0,127,0)"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Layer 3 — Deep Violet Blob */}
      <Animated.View style={[styles.layer, { width: size * 1.8, height: size * 1.8, marginLeft: size * -0.4, marginTop: size * -0.4, transform: [{ translateX: t3 }, { translateY: t1 }, { rotate: deg(r4, true) }] }]}>
        <LinearGradient
          colors={["rgba(138,43,226,1)", "rgba(138,43,226,0)"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Layer 4 — Bright White/Blue Blob */}
      <Animated.View style={[styles.layer, { width: size * 1.8, height: size * 1.8, marginLeft: size * -0.4, marginTop: size * -0.4, transform: [{ translateX: t1 }, { translateY: t3 }, { rotate: deg(r2) }] }]}>
        <LinearGradient
          colors={["rgba(230,240,255,1)", "rgba(230,240,255,0)"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* 3D specular highlight — top right */}
      <LinearGradient
        colors={["rgba(255,255,255,0.9)", "rgba(255,255,255,0.4)", "transparent"]}
        locations={[0, 0.2, 0.5]}
        start={{ x: 0.65, y: 0.05 }}
        end={{ x: 0.3, y: 0.6 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
      />

      {/* 3D shadow — bottom left */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.15)"]}
        locations={[0.5, 1]}
        start={{ x: 0.8, y: 0.1 }}
        end={{ x: 0.1, y: 0.95 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
      />

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: "hidden",
    backgroundColor: "#16053A",
    elevation: 16,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 32,
  },
  layer: {
    position: "absolute",
    borderRadius: 999, // Ensures the layer is always a perfect circle
    filter: "blur(24px)", // Mimics the active assistant's smooth liquid plasma effect
  },
});
