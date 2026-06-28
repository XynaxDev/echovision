/**
 * EchoVision — Object Finder Screen
 *
 * Uses the device camera and Gemini Vision to locate specific objects
 * in the user's environment based on their spoken request.
 */

import React, { useState } from "react";
import { triggerHaptic } from "../utils/haptics";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useAppTheme } from "../context/ThemeContext";

export function ObjectFinderScreen(): React.JSX.Element {
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.text }]}>
          We need your permission to show the camera
        </Text>
        <Pressable
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>
            Grant Permission
          </Text>
        </Pressable>
      </View>
    );
  }

  const toggleScanning = () => {
    triggerHaptic("medium");
    setIsScanning(!isScanning);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CameraView style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.targetBox} />
          <Pressable
            style={({ pressed }) => [
              styles.scanButton,
              {
                backgroundColor: isScanning ? colors.danger : colors.primary,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
            onPress={toggleScanning}
            accessibilityLabel={isScanning ? "Stop object finder" : "Start object finder"}
            accessibilityRole="button"
          >
            <Text style={[styles.scanButtonText, { color: colors.background }]}>
              {isScanning ? "Scanning..." : "Start Object Finder"}
            </Text>
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 30,
  },
  targetBox: {
    width: 250,
    height: 250,
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderStyle: "dashed",
    borderRadius: 20,
    marginTop: "20%",
  },
  scanButton: {
    width: "100%",
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanButtonText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 1,
  },
  message: {
    textAlign: "center",
    paddingBottom: 20,
    fontSize: 16,
    paddingHorizontal: 30,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 30,
    alignItems: "center",
  },
  buttonText: {
    fontWeight: "bold",
    fontSize: 16,
  },
});
