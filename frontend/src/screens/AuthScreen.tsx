/**
 * EchoVision — Authentication Screen
 *
 * 100% Passwordless Phone OTP Authentication using Firebase native sandbox.
 * High-contrast UI adapted for accessibility.
 *
 * Flow:
 *   1. User enters Name and Phone Number (+91 default).
 *   2. Firebase Auth handles SMS delivery and session internally.
 *   3. User enters 6-digit OTP.
 *   4. Client verifies OTP locally.
 *   5. Client securely relays session ID + Name to FastAPI backend gate.
 */

import React, { useCallback, useRef, useState } from "react";
import { triggerHaptic } from "../utils/haptics";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Image,
} from "react-native";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import { AppText } from "../components/AppText";
import { GridPattern } from "../components/GridPattern";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { verifyPhoneAuth } from "../services/api";
import { Feather } from "@expo/vector-icons";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

type AuthStep = "details" | "otp";

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function AuthScreen({ navigation }: Props): React.JSX.Element {
  const { colors, isDark } = useAppTheme();
  
  const [step, setStep] = useState<AuthStep>("details");
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  // Firebase confirmation object
  const [confirm, setConfirm] = useState<FirebaseAuthTypes.ConfirmationResult | null>(null);

  const otpInputRef = useRef<TextInput>(null);

  // ── Step 1: Request OTP ──────────────────────────────────────────────
  const handleSendOTP = useCallback(async (): Promise<void> => {
    if (name.trim().length < 2) {
      Alert.alert("Invalid Name", "Please enter your full name.");
      return;
    }
    if (phone.length < 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit phone number.");
      return;
    }

    triggerHaptic("heavy");
    setIsLoading(true);

    try {
      // Natively trigger Firebase Phone Auth
      const confirmation = await auth().signInWithPhoneNumber(`+91${phone}`);
      setConfirm(confirmation);
      setStep("otp");
      
      // Auto-focus OTP input after a brief delay
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch (error: any) {
      console.error("Phone Auth Error:", error);
      Alert.alert("Authentication Error", error.message || "Failed to send verification code.");
    } finally {
      setIsLoading(false);
    }
  }, [name, phone]);

  // ── Step 2: Verify OTP & DB Gate ──────────────────────────────────────
  const handleVerifyOTP = useCallback(async (): Promise<void> => {
    if (otp.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit verification code.");
      return;
    }

    if (!confirm) {
      Alert.alert("Error", "Session expired. Please request a new code.");
      setStep("details");
      return;
    }

    triggerHaptic("heavy");
    setIsLoading(true);

    try {
      // 1. Verify locally with Firebase SDK
      await confirm.confirm(otp);
      
      if (auth().currentUser) {
          await auth().currentUser?.updateProfile({ displayName: name.trim() });
      }
      
      // 2. Relay the secure session to our FastAPI Backend Database Gate
      // The backend gets the JWT via `api.ts` interceptor and registers the user.
      await verifyPhoneAuth(name.trim(), `+91${phone}`);

      // Check permissions
      const cam = await Camera.getCameraPermissionsAsync();
      const mic = await Audio.getPermissionsAsync();
      const loc = await Location.getForegroundPermissionsAsync();
      
      triggerHaptic("success");
      if (cam.status !== 'granted' || mic.status !== 'granted' || loc.status !== 'granted') {
        navigation.reset({ index: 0, routes: [{ name: "Onboarding" }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
      }
    } catch (error: any) {
      console.error("OTP Verification Error:", error);
      // Clean up Firebase Auth if backend verification fails
      if (auth().currentUser) {
        await auth().signOut();
      }
      Alert.alert("Verification Failed", error.message || "The code you entered is incorrect or the server rejected the session.");
    } finally {
      setIsLoading(false);
    }
  }, [otp, confirm, name, phone, navigation]);

  // ── Back Navigation ──────────────────────────────────────────────────
  const handleBack = useCallback((): void => {
    triggerHaptic("light");
    setStep("details");
    setOtp("");
    setConfirm(null);
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <GridPattern color={colors.textSecondary} opacity={isDark ? 0.08 : 0.05} spacing={24} />
      
      {/* Top Back Button */}
      <Pressable 
        style={styles.topBackButton} 
        onPress={() => step === "otp" ? setStep("details") : navigation.goBack()}
      >
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoIcon}>
            <Image 
              source={require("../../assets/echovisionapplogo_cropped.png")} 
              style={{ width: 60, height: 60 }} 
              resizeMode="contain"
            />
          </View>
          <AppText style={[styles.appName, { color: colors.text }]}>EchoVision</AppText>
          <AppText style={[styles.tagline, { color: colors.textSecondary }]}>Accessibility for Everyone</AppText>
        </View>

        {/* Card */}
        <View style={[
          styles.card, 
          { 
            backgroundColor: colors.card, 
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(18, 22, 96, 0.06)",
          }
        ]}>
          
          {/* ─────────────────────────────────────────────────────────── */}
          {/* DETAILS MODE (Name + Phone) */}
          {/* ─────────────────────────────────────────────────────────── */}
          {step === "details" ? (
            <>
              <AppText style={[styles.cardTitle, { color: colors.text }]}>Welcome</AppText>
              <AppText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Enter your details to register or login instantly.
              </AppText>

              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="Full Name"
                placeholderTextColor={colors.textDisabled}
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
                accessibilityLabel="Full name input"
              />

              <View style={[styles.phoneInputRow, { borderColor: colors.border }]}>
                <AppText style={[styles.countryCode, { color: colors.textSecondary }]}>+91</AppText>
                <TextInput
                  style={[styles.phoneInput, { color: colors.text }]}
                  placeholder="Phone Number"
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                  accessibilityLabel="Phone number input"
                />
              </View>

              <Pressable
                onPress={handleSendOTP}
                disabled={isLoading || name.length < 2 || phone.length < 10}
                style={[
                  styles.button,
                  {
                    backgroundColor: name.length >= 2 && phone.length >= 10 ? colors.primary : colors.textDisabled,
                    opacity: isLoading ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel="Send Verification Code button"
                accessibilityRole="button"
              >
                <AppText style={[styles.buttonText, { color: "#FFF" }]}>
                  {isLoading ? "Sending..." : "Send Verification Code"}
                </AppText>
              </Pressable>
            </>
          ) : (
            /* ─────────────────────────────────────────────────────────── */
            /* OTP MODE */
            /* ─────────────────────────────────────────────────────────── */
            <View style={{ paddingTop: 16 }}>
              <View style={styles.otpHeaderRow}>
                <View style={styles.otpHeaderTitles}>
                  <AppText style={[styles.cardTitle, { color: colors.text, marginBottom: 4 }]}>Verify Phone</AppText>
                  <AppText style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Code sent to +91 {phone}
                  </AppText>
                </View>
              </View>

              <TextInput
                ref={otpInputRef}
                style={[styles.otpInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="000000"
                placeholderTextColor={colors.textDisabled}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                textContentType="oneTimeCode"
                accessibilityLabel="OTP verification code input"
              />

              <Pressable
                onPress={handleVerifyOTP}
                disabled={isLoading || otp.length !== 6}
                style={[
                  styles.button,
                  { backgroundColor: otp.length === 6 ? colors.primary : colors.textDisabled, opacity: isLoading ? 0.7 : 1 },
                ]}
                accessibilityLabel="Verify and Continue button"
                accessibilityRole="button"
              >
                <AppText style={[styles.buttonText, { color: "#FFF" }]}>
                  {isLoading ? "Verifying..." : "Verify Code"}
                </AppText>
              </Pressable>
            </View>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  topBackButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoIcon: {
    marginBottom: 12,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_900Black",
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 24,
    paddingBottom: 32,
    marginBottom: 24,
    width: "100%",
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 16,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 24,
  },
  countryCode: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
  },
  otpInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 64,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 12,
    textAlign: "center",
    marginBottom: 24,
  },
  otpHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  otpHeaderTitles: {
    flex: 1,
  },
  button: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
    marginLeft: -4,
  },
});
