/**
 * EchoVision — Onboarding Permissions Screen
 *
 * Requests all necessary permissions transparently upfront.
 */

import React, { useState } from "react";
import { triggerHaptic } from "../utils/haptics";
import { View, StyleSheet, Pressable, ScrollView, Platform, Image } from "react-native";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import { AppText } from "../components/AppText";
import { GridPattern } from "../components/GridPattern";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const { colors, isDark } = useAppTheme();
  const [isRequesting, setIsRequesting] = useState(false);

  const requestPermissions = async () => {
    setIsRequesting(true);
    triggerHaptic("medium");

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
      triggerHaptic("success");
      navigation.replace("Auth");
    } catch (e) {
      console.error("Permission request failed", e);
      setIsRequesting(false);
      Speech.speak("Permission request failed. Please try again.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GridPattern color={colors.textSecondary} opacity={isDark ? 0.08 : 0.05} spacing={24} />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.topRow}>
            <Pressable 
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={28} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Image 
              source={require("../../assets/echovisionapplogo_cropped.png")} 
              style={{ width: 60, height: 60, marginBottom: 8 }} 
              resizeMode="contain"
            />
            <AppText style={{ color: colors.text, fontSize: 22, fontFamily: "Inter_900Black" }}>EchoVision</AppText>
          </View>
          <AppText style={[styles.title, { color: colors.text }]}>Permissions Required</AppText>
          <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>
            To provide you with a fully accessible experience, EchoVision needs access to the following hardware on your device:
          </AppText>
        </View>

        <View style={styles.permissionList}>
          <PermissionItem
            icon="camera"
            title="Camera"
            description="Used to scan your surroundings, read text, and identify objects."
            colors={colors}
            isDark={isDark}
            iconBg={isDark ? "rgba(60, 174, 139, 0.15)" : "#EBF6F3"}
            iconColor="#3CAE8B"
          />
          <PermissionItem
            icon="mic"
            title="Microphone"
            description="Used for voice commands to navigate the app completely hands-free."
            colors={colors}
            isDark={isDark}
            iconBg={isDark ? "rgba(1, 113, 223, 0.15)" : "#E6F0FC"}
            iconColor="#0171DF"
          />
          <PermissionItem
            icon="map-pin"
            title="Location"
            description="Used to send your precise GPS coordinates in an emergency."
            colors={colors}
            isDark={isDark}
            iconBg={isDark ? "rgba(255, 209, 64, 0.15)" : "#FFFBEA"}
            iconColor={isDark ? "#FFD140" : "#C09000"}
          />
          <PermissionItem
            icon="phone-call"
            title="Phone Calls"
            description="Used to immediately dial your emergency contact when SOS is triggered."
            colors={colors}
            isDark={isDark}
            iconBg={isDark ? "rgba(239, 68, 68, 0.15)" : "#FCECEB"}
            iconColor="#EF4444"
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
          <AppText style={styles.buttonText}>{isRequesting ? "Requesting..." : "Grant Permissions"}</AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PermissionItem({ icon, title, description, colors, isDark, iconBg, iconColor }: any) {
  return (
    <View style={[
      styles.itemContainer, 
      { 
        backgroundColor: colors.card, 
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(18, 22, 96, 0.05)",
      }
    ]}>
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.textContainer}>
        <AppText style={[styles.itemTitle, { color: colors.text }]}>{title}</AppText>
        <AppText style={[styles.itemDescription, { color: colors.textSecondary }]}>{description}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { alignItems: "center", marginBottom: 32, marginTop: Platform.OS === "ios" ? 40 : 20 },
  topRow: { width: "100%", flexDirection: "row", marginBottom: 20 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { fontSize: 26, fontFamily: "Inter_800ExtraBold", marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 22 },
  permissionList: { gap: 14 },
  itemContainer: { 
    flexDirection: "row", 
    padding: 16, 
    borderRadius: 20, 
    borderWidth: 1.5, 
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginRight: 16 },
  textContainer: { flex: 1 },
  itemTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 4 },
  itemDescription: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  button: { 
    paddingVertical: 16, 
    borderRadius: 28, 
    alignItems: "center",
    elevation: 4,
    shadowColor: "#0171DF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" }
});
