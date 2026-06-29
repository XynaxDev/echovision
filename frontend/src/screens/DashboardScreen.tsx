import React, { useRef, useState, useEffect, useCallback } from "react";
import { triggerHaptic } from "../utils/haptics";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Dimensions,
  Image,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Camera } from "expo-camera";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../components/AppText";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import auth from "@react-native-firebase/auth";
import { Video, ResizeMode } from "expo-av";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { EdgeGlow } from "../components/EdgeGlow";
import { GridPattern } from "../components/GridPattern";
import { CustomOrb } from "../components/CustomOrb";
import { SolidQuads, Gradients } from "../constants/Colors";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

const { width } = Dimensions.get("window");
const CARD_SIZE = Math.floor((width - 48) / 2);

const useDoubleTap = (delay = 300) => {
  const lastTapRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = (onSingleTap: () => void, onDoubleTap: () => void) => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < delay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastTapRef.current = null;
      triggerHaptic("heavy");
      onDoubleTap();
    } else {
      lastTapRef.current = now;
      triggerHaptic("light");
      timerRef.current = setTimeout(() => {
        onSingleTap();
        lastTapRef.current = null;
        timerRef.current = null;
      }, delay);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return handleTap;
};

interface QuadrantItem {
  id: string;
  iconName: React.ComponentProps<typeof Feather>["name"];
  screen: keyof RootStackParamList | string;
  titleKey: string;
  subtitleKey: string;
  color: string;
}

const QUADRANTS: QuadrantItem[] = [
  { id: "scanner", iconName: "camera", screen: "SceneScanner", titleKey: "scene_scanner", subtitleKey: "scan_subtitle", color: SolidQuads.scanner },
  { id: "text-reader", iconName: "book-open", screen: "TextReader", titleKey: "text_reader", subtitleKey: "reader_subtitle", color: SolidQuads.textReader },
  { id: "sos", iconName: "phone-call", screen: "SOSConfirmation", titleKey: "sos", subtitleKey: "sos_subtitle", color: SolidQuads.sos },
  { id: "settings", iconName: "settings", screen: "Settings", titleKey: "settings", subtitleKey: "settings_subtitle", color: SolidQuads.settings },
];

export function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors, isDark } = useAppTheme();
  const { language, t } = useLanguage();
  const { isVoiceActive, toggleVoice, clearContextualCommands } = useVoiceContext();
  const handleTap = useDoubleTap();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const user = auth().currentUser;

  // Load avatar URI when screen is focused
  const loadAvatar = () => {
    AsyncStorage.getItem("@echovision_profile_image").then((uri) => {
      setAvatarUri(uri);
    });
  };

  useEffect(() => {
    if (isFocused) {
      loadAvatar();
    }
  }, [isFocused]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    triggerHaptic("light");
    // Reload dynamic data
    loadAvatar();
    // Simulate network delay to allow animation
    setTimeout(() => {
      setRefreshing(false);
      triggerHaptic("success");
    }, 1000);
  }, []);

  // Animations
  const navOpacity = useRef(new Animated.Value(1)).current;
  const navTranslateY = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      clearContextualCommands(); // Force context to 'Home' on dashboard focus
    }, [clearContextualCommands])
  );

  useEffect(() => {
    if (isVoiceActive) {
      Animated.parallel([
        Animated.timing(navOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(navTranslateY, { toValue: 160, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(navOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(navTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [isVoiceActive]);

  const speak = (text: string) => {
    if (isVoiceActive) return;
    Speech.stop();
    Speech.speak(text, { language: language === "hindi" ? "hi-IN" : "en-US", pitch: 1.0, rate: 1.0 });
  };

  const interactItem = (item: QuadrantItem) => {
    const localizedTitle = t(item.titleKey);
    handleTap(
      () => speak(localizedTitle),
      async () => {
        if (item.screen === "SceneScanner" || item.screen === "TextReader") {
          const { status } = await Camera.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            navigation.navigate("Onboarding" as never);
            return;
          }
        }
        
        if (item.screen === "SOSConfirmation") {
            // @ts-ignore
            navigation.navigate("SOSConfirmation", { source: "manual" });
        } else {
            // @ts-ignore
            navigation.navigate(item.screen);
        }
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GridPattern color={colors.textSecondary} opacity={isDark ? 0.15 : 0.1} spacing={20} radius={1.5} />
      <EdgeGlow active={isVoiceActive} />

      {/* Sleek Top Bar with App Name - Insets top added cleanly */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image 
            source={require("../../assets/echovisionapplogo_cropped.png")} 
            style={{ width: 44, height: 44, marginRight: 12 }} 
            resizeMode="contain"
          />
          <AppText style={[styles.appName, { color: colors.text }]}>EchoVision</AppText>
        </View>
        <Pressable 
          onPress={() => {
            triggerHaptic("light");
            navigation.navigate("Settings");
          }}
          style={[styles.profileButton, { borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)" }]}
        >
          {avatarUri && avatarUri !== "removed" ? (
            <Image source={{ uri: avatarUri }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profilePlaceholder, { backgroundColor: colors.card }]}>
              <Feather name="user" size={22} color={colors.text} />
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 2x2 Grid Area */}
        <View style={styles.gridArea}>
          <View style={styles.grid}>
            {QUADRANTS.map((item) => {
              const accentColor = item.color;
              const cardBg = colors.card;
              const subtitleColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(18, 22, 96, 0.6)";

              return (
                <Pressable
                  key={item.id}
                  onPress={() => interactItem(item)}
                  style={({ pressed }) => [
                    styles.quadrant,
                    {
                      backgroundColor: cardBg,
                      borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)",
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityLabel={t(item.titleKey)}
                  accessibilityRole="button"
                >
                  {/* Subtle Background Tint */}
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: accentColor, opacity: isDark ? 0.08 : 0.03 }]} />
                  
                  {/* Large Watermark Icon */}
                  <View style={styles.watermark}>
                    <Feather name={item.iconName} size={130} color={accentColor} />
                  </View>

                  <View style={styles.quadInner}>
                    {/* Top-left Icon Badge */}
                    <View style={[styles.iconBadge, { 
                      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                      backgroundColor: isDark ? accentColor + "20" : accentColor + "15" // Appends hex opacity (e.g., 20% opacity)
                    }]}>
                      <Feather
                         name={item.iconName}
                         size={22}
                         color={accentColor}
                      />
                    </View>
                    
                    <AppText style={[styles.quadrantTitle, { color: isDark ? "#FFFFFF" : "#1A1C2E" }]} adjustsFontSizeToFit numberOfLines={2}>
                      {t(item.titleKey).replace(" ", "\n")}
                    </AppText>
                    <AppText style={[styles.quadrantSubtitle, { color: subtitleColor }]} adjustsFontSizeToFit numberOfLines={1}>{t(item.subtitleKey)}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.navContainer, { bottom: 0 }]} pointerEvents="box-none">
        <Animated.View 
          pointerEvents={isVoiceActive ? "none" : "auto"}
          style={[
            styles.pillNavbar, 
            { 
              backgroundColor: isDark ? "#1A1C2E" : "#FFFFFF", 
              borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", 
              paddingBottom: Math.max(insets.bottom, 16),
              height: 70 + Math.max(insets.bottom, 16),
              opacity: navOpacity, 
              transform: [{ translateY: navTranslateY }] 
            }
          ]}
        >
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem(QUADRANTS[0])}>
            <Feather name="camera" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem(QUADRANTS[1])}>
            <Feather name="book-open" size={22} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.navCenterPlaceholder}>
              <Pressable 
                onPress={() => { triggerHaptic("heavy"); toggleVoice(); }} 
                style={[styles.inlineOrbContainer, { backgroundColor: colors.background }]}
              >
                {/* Another circle around the orb with glass touch finish */}
                <View style={[styles.glassyRing, { borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)" }]} />
                
                {/* The actual orb with its simple outer border */}
                <View style={[styles.orbContent, { borderColor: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)" }]}>
                  <CustomOrb size={76} />
                  <View style={styles.orbInnerGlow} />
                </View>
              </Pressable>
          </View>

          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem(QUADRANTS[2])}>
            <Feather name="phone-call" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.5 : 1 }]} onPress={() => interactItem(QUADRANTS[3])}>
            <Feather name="settings" size={22} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 24, 
    paddingBottom: 4
  },
  appName: { fontFamily: "Inter_800ExtraBold", fontSize: 22, letterSpacing: -0.1 },
  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    overflow: "hidden",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profilePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  gridArea: { flex: 1, justifyContent: "center", paddingHorizontal: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  quadrant: { 
    width: CARD_SIZE, 
    height: CARD_SIZE, // Square layout
    borderRadius: 32, 
    marginBottom: 16, 
    elevation: 4, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  watermark: {
    position: "absolute",
    right: -25,
    bottom: -25,
    opacity: 0.08,
  },
  quadInner: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: "auto", // Pushes text to the bottom
  },
  quadrantTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 22, textAlign: "left", marginBottom: 4, lineHeight: 26 },
  quadrantSubtitle: { fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "left" },
  
  navContainer: { 
    position: "absolute", 
    left: 0, 
    right: 0, 
    alignItems: "center",
    zIndex: 10,
  },
  pillNavbar: { 
    flexDirection: "row", 
    alignItems: "center", // Vertically centers items based on height (minus paddingBottom)
    justifyContent: "space-between", 
    width: "100%", 
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24, 
    borderTopWidth: 1, 
    elevation: 24, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: -4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 10,
    overflow: "visible",
  },
  navItem: { 
    alignItems: "center", 
    justifyContent: "center", 
    width: 44, 
    height: 44, 
    borderRadius: 22 
  },
  navCenterPlaceholder: { 
    width: 80, 
    height: 64,
    alignItems: "center", 
    justifyContent: "center",
    overflow: "visible",
  },
  inlineOrbContainer: { 
    position: "absolute",
    top: -36, // Lift it up slightly over the curvy top border
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: "center", 
    alignItems: "center", 
  },
  glassyRing: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1.5,
    borderColor: "rgba(192,192,192,0.8)", // Glowy steel silver border
    backgroundColor: "rgba(192,192,192,0.15)", // Silver glass touch
  },
  orbContent: {
    width: 76, // Original size of the visible colored orb
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5, // Outer border of the orb itself
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  orbInnerGlow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)", // faint glass rim
  },
});

