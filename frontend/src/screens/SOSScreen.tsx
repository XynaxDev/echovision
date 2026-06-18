/**
 * EchoVision — Emergency SOS Screen
 *
 * Pipeline:
 *   1. User performs a 3-second continuous long-press on the SOS button
 *   2. On verification, the app pulls live GPS coordinates via expo-location
 *   3. Coordinates are mapped to a Google Maps URL
 *   4. An SMS is prepared with the location link via expo-sms
 *   5. The native phone dialer is invoked for emergency calling
 */

import React, { useCallback, useState, useEffect } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import * as SMS from "expo-sms";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as IntentLauncher from "expo-intent-launcher";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import { SOSButton } from "../components/SOSButton";
import type { RootStackParamList } from "../navigation/AppNavigator";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Props = NativeStackScreenProps<RootStackParamList, "SOS">;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function SOSScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("911");

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("@emergency_contact").then((number) => {
        if (number) setEmergencyContact(number);
      });
    }, [])
  );

  const handleSOSActivate = useCallback(async (): Promise<void> => {
    setIsProcessing(true);
    setStatusMessage("Getting your location...");

    try {
      // Step 1: Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Required",
          "EchoVision needs your location to share it with emergency contacts. Please enable location access in Settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        setIsProcessing(false);
        setStatusMessage("");
        return;
      }

      // Step 2: Get current GPS coordinates
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      // Step 3: Create Google Maps URL
      const mapsUrl = `https://maps.google.com/maps?q=${latitude},${longitude}`;
      const smsMessage =
        `🆘 EMERGENCY SOS — EchoVision\n\n` +
        `I need immediate help!\n\n` +
        `📍 My Location:\n${mapsUrl}\n\n` +
        `Sent via EchoVision Accessibility App`;

      // Step 4: Send SMS with location
      setStatusMessage("Preparing emergency SMS...");

      const smsAvailable = await SMS.isAvailableAsync();
      if (smsAvailable) {
        await SMS.sendSMSAsync([emergencyContact], smsMessage);
      } else {
        Alert.alert(
          "SMS Not Available",
          "SMS is not available on this device. Your location has been copied.",
        );
      }

      // Step 5: Open phone dialer with emergency number
      setStatusMessage("Placing emergency call...");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      if (Platform.OS === "android") {
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.CALL", {
            data: `tel:${emergencyContact}`,
          });
        } catch (e) {
          console.error("Failed to execute ACTION_CALL", e);
          const dialerUrl = `tel:${emergencyContact}`;
          const canDial = await Linking.canOpenURL(dialerUrl);
          if (canDial) await Linking.openURL(dialerUrl);
        }
      } else {
        const dialerUrl = `tel:${emergencyContact}`;
        const canDial = await Linking.canOpenURL(dialerUrl);
        if (canDial) {
          await Linking.openURL(dialerUrl);
        } else {
          Alert.alert(
            "Dialer Unavailable",
            `Could not open phone dialer. Please call ${emergencyContact} manually.`,
          );
        }
      }

      setStatusMessage("Emergency actions completed");
    } catch (error) {
      console.error("SOS activation failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatusMessage("SOS failed — please call emergency services manually");

      Alert.alert(
        "SOS Error",
        `Something went wrong. Please call ${emergencyContact} directly.`,
        [
          {
            text: `Call ${emergencyContact}`,
            onPress: () => Linking.openURL(`tel:${emergencyContact}`),
          },
          { text: "OK", style: "cancel" },
        ],
      );
    } finally {
      setIsProcessing(false);
    }
  }, [emergencyContact]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Warning */}
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerIcon}>
          <Feather name="alert-triangle" size={32} color={colors.warning} />
        </View>
        <Text style={[styles.headerText, { color: colors.text }]}>
          Emergency Mode
        </Text>
        <Text style={[styles.headerSubtext, { color: colors.textSecondary }]}>
          This will share your GPS location via SMS and open the emergency dialer.
        </Text>
      </View>

      {/* Status Message */}
      {statusMessage ? (
        <View style={[styles.statusBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statusText, { color: colors.warning }]}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      {/* SOS Button — Full Screen */}
      <SOSButton
        onActivate={handleSOSActivate}
        isProcessing={isProcessing}
      />

      {/* Quick Call Button */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Linking.openURL(`tel:${emergencyContact}`);
        }}
        style={[styles.quickCallButton, { backgroundColor: colors.card, borderColor: colors.danger }]}
        accessibilityLabel="Quick call emergency services"
        accessibilityHint={`Double tap to immediately call ${emergencyContact}`}
        accessibilityRole="button"
      >
        <View style={styles.quickCallIcon}>
          <Feather name="phone-call" size={20} color={colors.danger} />
        </View>
        <Text style={[styles.quickCallText, { color: colors.danger }]}>
          Quick Call {emergencyContact}
        </Text>
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
    padding: 16,
  },
  header: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  headerIcon: {
    marginBottom: 8,
  },
  headerText: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  headerSubtext: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  statusBar: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  quickCallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    gap: 10,
    marginTop: 12,
  },
  quickCallIcon: {
  },
  quickCallText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
