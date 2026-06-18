/**
 * EchoVision — Dashboard Screen
 *
 * Features:
 *   - Blazing Fast Voice: Zero-Latency Regex Parsing (bypassing LLM).
 *   - AI Bubble UI: A wildly morphing, scaling fluid blob that hides the mic when active.
 *   - Edge Glow: Soft ambient light when listening.
 */

import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { EdgeGlow } from "../components/EdgeGlow";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

const useDoubleTap = (delay = 300) => {
  const lastTapRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTap = (onSingleTap: () => void, onDoubleTap: () => void) => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < delay) {
      if (timerRef.current) clearTimeout(timerRef.current);
      lastTapRef.current = null;
      onDoubleTap();
    } else {
      lastTapRef.current = now;
      timerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        onSingleTap();
      }, delay);
    }
  };
  return handleTap;
};

interface QuadrantItem {
  id: string;
  iconName: React.ComponentProps<typeof Feather>["name"];
  screen: keyof RootStackParamList;
  titleKey: string;
  subtitleKey: string;
}

const QUADRANTS: QuadrantItem[] = [
  { id: "scanner", iconName: "camera", screen: "SceneScanner", titleKey: "scene_scanner", subtitleKey: "scan_subtitle" },
  { id: "text-reader", iconName: "book-open", screen: "TextReader", titleKey: "text_reader", subtitleKey: "reader_subtitle" },
  { id: "sos", iconName: "phone-call", screen: "SOS", titleKey: "sos", subtitleKey: "sos_subtitle" },
  { id: "settings", iconName: "settings", screen: "Settings", titleKey: "settings", subtitleKey: "settings_subtitle" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════

export function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const { language, t } = useLanguage();
  const { isVoiceActive, toggleVoice } = useVoiceContext();
  const handleTap = useDoubleTap();

  // Animations
  const navOpacity = useRef(new Animated.Value(1)).current;
  const navTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (isVoiceActive) {
      Animated.parallel([
        Animated.timing(navOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(navTranslateY, { toValue: 50, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(navOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(navTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [isVoiceActive]);

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: language === "hindi" ? "hi-IN" : "en-US", pitch: 1.0, rate: 1.0 });
  };

  const handleSOSAction = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") await Location.getCurrentPositionAsync({});
      const stored = await AsyncStorage.getItem("@sos_contacts");
      let tel = "911";
      if (stored) {
        try {
          const contacts = JSON.parse(stored);
          const primary = contacts.find((c: any) => c.isPrimary);
          if (primary && primary.number) tel = primary.number;
        } catch (e) {}
      }
      Linking.openURL(`tel:${tel}`);
    } catch (e) {}
  };

  const interactItem = (item: QuadrantItem | "SOS" | "Scanner" | "TextReader" | "Settings") => {
    let targetScreen = "Dashboard";
    let titleKey = "";
    
    if (typeof item === "string") {
      titleKey = item.toLowerCase() === "scanner" ? "scene_scanner" : item.toLowerCase() === "textreader" ? "text_reader" : item.toLowerCase();
      targetScreen = item === "Scanner" ? "SceneScanner" : item === "TextReader" ? "TextReader" : item === "SOS" ? "SOS" : "Settings";
    } else {
      titleKey = item.titleKey;
      targetScreen = item.screen;
    }

    const localizedTitle = t(titleKey);

    handleTap(
      () => { Haptics.selectionAsync(); speak(localizedTitle); },
      () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        speak(language === "hindi" ? `${localizedTitle} खोल रहे हैं` : `Opening ${localizedTitle}`);
        if (targetScreen === "SOS") handleSOSAction();
        else navigation.navigate(targetScreen as any);
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <EdgeGlow active={isVoiceActive} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={[styles.appName, { color: colors.text }]}>EchoVision</Text>
          <Pressable onPress={() => { Haptics.selectionAsync(); speak(language === "hindi" ? "सहायता" : "Help"); }}>
            <Feather name="help-circle" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.gridArea}>
          <View style={styles.grid}>
            {QUADRANTS.map((item) => {
              const isSOS = item.id === "sos";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => interactItem(item)}
                  style={({ pressed }) => [
                    styles.quadrant,
                    {
                      backgroundColor: isSOS ? colors.danger : colors.card,
                      borderColor: isSOS ? colors.danger : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityLabel={t(item.titleKey)}
                  accessibilityRole="button"
                >
                  <Feather
                    name={item.iconName}
                    size={38}
                    color={isSOS ? "#FFFFFF" : colors.text}
                    style={styles.quadrantIconStyle}
                  />
                  <Text style={[styles.quadrantTitle, { color: isSOS ? "#FFFFFF" : colors.text }]}>{t(item.titleKey)}</Text>
                  <Text style={[styles.quadrantSubtitle, { color: isSOS ? "rgba(255,255,255,0.8)" : colors.textSecondary }]}>{t(item.subtitleKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
      <View style={styles.navContainer} pointerEvents="box-none">
        <Animated.View style={[
          styles.pillNavbar, 
          { backgroundColor: colors.card, borderColor: colors.border, opacity: navOpacity, transform: [{ translateY: navTranslateY }] }
        ]}>
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem("Scanner")}>
            <Feather name="camera" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem("TextReader")}>
            <Feather name="book-open" size={22} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.navCenterPlaceholder}>
            {!isVoiceActive && (
              <Pressable 
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); toggleVoice(); }} 
                style={[styles.inlineMicHitbox, { backgroundColor: colors.primary }]}
              >
                <Feather name="mic" size={26} color="#FFFFFF" />
              </Pressable>
            )}
          </View>

          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem("SOS")}>
            <Feather name="phone-call" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem("Settings")}>
            <Feather name="settings" size={22} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, paddingTop: Platform.OS === "android" ? 48 : 12, paddingBottom: 8 },
  appName: { fontFamily: "Inter", fontSize: 24, fontWeight: "900", letterSpacing: 0.5 },
  gridArea: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  quadrant: { width: "48%", aspectRatio: 0.95, borderRadius: 20, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 16, marginBottom: 14, justifyContent: "center", alignItems: "center", elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  quadrantIconStyle: { marginBottom: 12 },
  quadrantTitle: { fontFamily: "Nunito_700Bold", fontSize: 15, textAlign: "center", marginBottom: 4 },
  quadrantSubtitle: { fontFamily: "Nunito_500Medium", fontSize: 11, textAlign: "center" },

  navContainer: { position: "absolute", bottom: Platform.OS === "ios" ? 32 : 24, left: 20, right: 20, alignItems: "center" },
  pillNavbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", height: 68, borderRadius: 34, paddingHorizontal: 16, borderWidth: 1, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
  navItem: { alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 22 },
  navCenterPlaceholder: { width: 72, alignItems: "center", justifyContent: "center" },
  
  inlineMicHitbox: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
});
