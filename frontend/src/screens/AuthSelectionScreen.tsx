/**
 * EchoVision — Auth Selection Screen (Get Started)
 *
 * Shows login options: Google and Phone.
 */

import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Feather, FontAwesome } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Toast from "react-native-toast-message";
import * as Haptics from "expo-haptics";

import { useAppTheme } from "../context/ThemeContext";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AuthSelection">;

export function AuthSelectionScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();

  const handlePhoneLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Onboarding");
  };

  const handleGoogleLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Toast.show({
      type: "info",
      text1: "Coming Soon",
      text2: "Google Sign-In will be available soon!",
      position: "bottom",
      bottomOffset: 80,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable 
          style={styles.backButton}
          onPress={() => Platform.OS === 'android' ? null : navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Get Started</Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { 
              backgroundColor: "#1A73E8", // Google Blue
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1 
            }
          ]}
          onPress={handleGoogleLogin}
        >
          <FontAwesome name="google" size={24} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { 
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              opacity: pressed ? 0.8 : 1 
            }
          ]}
          onPress={handlePhoneLogin}
        >
          <Feather name="phone" size={24} color={colors.text} style={styles.buttonIcon} />
          <Text style={[styles.buttonText, { color: colors.text }]}>Continue with Phone</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Platform.OS === "ios" ? 40 : 20,
    marginBottom: 40,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "600",
  },
  spacer: {
    flex: 1,
  },
  buttonContainer: {
    gap: 16,
    paddingBottom: 40,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    justifyContent: "center",
  },
  buttonIcon: {
    position: "absolute",
    left: 24,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
});
