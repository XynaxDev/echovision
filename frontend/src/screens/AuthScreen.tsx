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
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
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
  const { colors } = useAppTheme();
  
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLoading(true);

    try {
      // 1. Verify locally with Firebase SDK
      await confirm.confirm(otp);
      
      // 2. Relay the secure session to our FastAPI Backend Database Gate
      // The backend gets the JWT via `api.ts` interceptor and registers the user.
      await verifyPhoneAuth(name.trim(), `+91${phone}`);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
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
    Haptics.selectionAsync();
    setStep("details");
    setOtp("");
    setConfirm(null);
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoIcon}>
            <Feather name="eye" size={64} color={colors.primary} />
          </View>
          <Text style={[styles.appName, { color: colors.primary }]}>EchoVision</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>Accessibility for Everyone</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          
          {/* ─────────────────────────────────────────────────────────── */}
          {/* DETAILS MODE (Name + Phone) */}
          {/* ─────────────────────────────────────────────────────────── */}
          {step === "details" ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Welcome</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Enter your details to register or login instantly.
              </Text>

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
                <Text style={[styles.countryCode, { color: colors.textSecondary }]}>+91</Text>
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
                <Text style={[styles.buttonText, { color: colors.background }]}>
                  {isLoading ? "Sending..." : "Send Verification Code"}
                </Text>
              </Pressable>
            </>
          ) : (
            /* ─────────────────────────────────────────────────────────── */
            /* OTP MODE */
            /* ─────────────────────────────────────────────────────────── */
            <>
              <Pressable
                onPress={handleBack}
                style={styles.backButton}
                accessibilityLabel="Go back to details"
                accessibilityRole="button"
              >
                <Text style={[styles.backText, { color: colors.primary }]}>← Change Details</Text>
              </Pressable>

              <Text style={[styles.cardTitle, { color: colors.text }]}>Verify Phone</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Enter the 6-digit code sent to +91 {phone}
              </Text>

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
                <Text style={[styles.buttonText, { color: colors.background }]}>
                  {isLoading ? "Verifying..." : "Verify & Continue"}
                </Text>
              </Pressable>
            </>
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
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoIcon: {
    marginBottom: 12,
  },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "400",
    marginTop: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: "600",
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    letterSpacing: 1,
  },
  otpInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 64,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 12,
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
