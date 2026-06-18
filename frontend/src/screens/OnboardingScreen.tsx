/**
 * EchoVision — Onboarding Permissions Screen
 *
 * Requests all necessary permissions transparently upfront.
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const [isRequesting, setIsRequesting] = useState(false);

  const requestPermissions = async () => {
    setIsRequesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Camera
      const cam = await Camera.requestCameraPermissionsAsync();
      // 2. Microphone
      const mic = await Audio.requestPermissionsAsync();
      // 3. Location
      const loc = await Location.requestForegroundPermissionsAsync();

      if (cam.status !== 'granted' || mic.status !== 'granted' || loc.status !== 'granted') {
        setIsRequesting(false);
        Speech.speak("Some permissions were denied. Please enable them in your device settings.");
        return; // Don't move onward if denied
      }

      // Proceed to Auth
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("Auth");
    } catch (e) {
      console.error("Permission request failed", e);
      setIsRequesting(false);
      Speech.speak("Permission request failed. Please try again.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.header}>
          <Feather name="shield" size={48} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Permissions Required</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            To provide you with a fully accessible experience, EchoVision needs access to the following hardware on your device:
          </Text>
        </View>

        <View style={styles.permissionList}>
          <PermissionItem
            icon="camera"
            title="Camera"
            description="Used to scan your surroundings, read text, and identify objects."
            colors={colors}
          />
          <PermissionItem
            icon="mic"
            title="Microphone"
            description="Used for voice commands to navigate the app completely hands-free."
            colors={colors}
          />
          <PermissionItem
            icon="map-pin"
            title="Location"
            description="Used to send your precise GPS coordinates in an emergency."
            colors={colors}
          />
          <PermissionItem
            icon="phone-call"
            title="Phone Calls"
            description="Used to immediately dial your emergency contact when SOS is triggered."
            colors={colors}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1, marginTop: 32 }
          ]}
          onPress={requestPermissions}
          disabled={isRequesting}
          accessibilityLabel="Grant all permissions"
          accessibilityHint="Double tap to open system permission prompts"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{isRequesting ? "Requesting..." : "Grant Permissions"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PermissionItem({ icon, title, description, colors }: any) {
  return (
    <View style={[styles.itemContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: colors.background }]}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.itemDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { alignItems: "center", marginBottom: 32, marginTop: 40 },
  title: { fontSize: 28, fontWeight: "800", marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  permissionList: { gap: 16 },
  itemContainer: { flexDirection: "row", padding: 16, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  iconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", marginRight: 16 },
  textContainer: { flex: 1 },
  itemTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  itemDescription: { fontSize: 14, lineHeight: 20 },
  button: { paddingVertical: 18, borderRadius: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" }
});
