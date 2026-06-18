/**
 * EchoVision — Application Root
 *
 * Wraps the entire app with:
 *   1. ThemeProvider — centralized theme management with persistence
 *   2. NavigationContainer — React Navigation root with theme bridge
 *   3. GlobalGestureWrapper — two-finger long press universal shortcut
 *   4. StatusBar — adapts to current theme automatically
 *
 * Global Touch Gesture:
 *   A two-finger long press (800 ms hold) anywhere on the active viewport
 *   instantly opens VoiceAssistantScreen, acting as a universal touchless
 *   hardware shortcut so users don't have to hunt for the mic button.
 */

import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  LogBox,
} from "react-native";

LogBox.ignoreAllLogs(true);
import { Feather } from "@expo/vector-icons";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from "@expo-google-fonts/nunito";
import {
  NavigationContainer,
  type NavigationContainerRef,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import { LanguageProvider } from "./src/context/LanguageContext";
import { getNavigationTheme } from "./src/constants/Colors";
import {
  AppNavigator,
  type RootStackParamList,
} from "./src/navigation/AppNavigator";
import { VoiceProvider, useVoiceContext } from "./src/context/VoiceContext";
import { GlobalVoiceOverlay } from "./src/components/GlobalVoiceOverlay";

// ═══════════════════════════════════════════════════════════════════════════
// Global Two-Finger Long Press Gesture Wrapper
// ═══════════════════════════════════════════════════════════════════════════

/** Duration (ms) the user must hold two fingers before the gesture fires. */
const TWO_FINGER_HOLD_MS = 800;

/** Cooldown (ms) after a successful gesture to prevent rapid re-triggers. */
const GESTURE_COOLDOWN_MS = 1500;

/** Routes where the two-finger shortcut should NOT fire. */
const BLOCKED_ROUTES = new Set<string>(["Welcome", "Auth", "VoiceAssistant"]);

interface GestureWrapperProps {
  children: React.ReactNode;
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList> | null>;
}

/**
 * Transparent wrapper that listens for raw touch events to detect a
 * two-finger long press. These callbacks are passive — they do NOT
 * interfere with the responder system, so all child Pressables,
 * ScrollViews, etc. continue to work normally.
 */
function GlobalGestureWrapper({
  children,
  navigationRef,
}: GestureWrapperProps): React.JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false);

  /** Cancel the pending long-press timer. */
  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Fires for every new touch — check for 2-finger contact. */
  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      const touchCount = e.nativeEvent.touches?.length ?? 0;

      if (
        touchCount >= 2 &&
        !cooldownRef.current &&
        timerRef.current === null
      ) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;

          const nav = navigationRef.current;
          if (nav) {
            const currentRoute = nav.getCurrentRoute()?.name;
            if (!currentRoute || !BLOCKED_ROUTES.has(currentRoute)) {
              cooldownRef.current = true;
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              nav.navigate("VoiceAssistant" as never);

              // Release cooldown after a delay
              setTimeout(() => {
                cooldownRef.current = false;
              }, GESTURE_COOLDOWN_MS);
            }
          }
        }, TWO_FINGER_HOLD_MS);
      }
    },
    [navigationRef],
  );

  /** When a finger lifts, cancel if fewer than 2 remain. */
  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const remaining = e.nativeEvent.touches?.length ?? 0;
      if (remaining < 2) {
        cancelTimer();
      }
    },
    [cancelTimer],
  );

  return (
    <View
      style={gestureStyles.wrapper}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelTimer}
    >
      {children}
    </View>
  );
}

const gestureStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Inner App — Consumes Theme Context
// ═══════════════════════════════════════════════════════════════════════════

function AppInner(): React.JSX.Element {
  const { colors, isDark, isThemeLoaded } = useAppTheme();
  const { setNavigationDelegate } = useVoiceContext();
  const navigationTheme = getNavigationTheme(colors);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  React.useEffect(() => {
    setNavigationDelegate((target: any, params?: any) => {
      if (navigationRef.current?.isReady()) {
        navigationRef.current.navigate(target, params);
      }
    });
  }, [setNavigationDelegate]);

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });



  // Show a themed loading indicator while AsyncStorage and fonts load
  if (!isThemeLoaded || !fontsLoaded) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <GlobalGestureWrapper navigationRef={navigationRef}>
        <AppNavigator />
      </GlobalGestureWrapper>
      <GlobalVoiceOverlay />
    </NavigationContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// App Root — Provides Theme Context
// ═══════════════════════════════════════════════════════════════════════════

const toastConfig = {
  success: ({ text1, text2, hide }: any) => (
    <View style={styles.toastContainer}>
      <View style={[styles.toastIconBox, { backgroundColor: "rgba(34, 197, 94, 0.1)" }]}>
        <Feather name="check-circle" size={20} color="#22c55e" />
      </View>
      <View style={styles.toastTextContainer}>
        <Text style={styles.toastTitle}>{text1}</Text>
        {text2 ? <Text style={styles.toastSubtitle}>{text2}</Text> : null}
      </View>
      <Pressable onPress={hide} style={styles.toastCloseBtn}>
        <Feather name="x" size={16} color="#999" />
      </Pressable>
    </View>
  ),
  error: ({ text1, text2, hide }: any) => (
    <View style={styles.toastContainer}>
      <View style={[styles.toastIconBox, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
        <Feather name="x-circle" size={20} color="#ef4444" />
      </View>
      <View style={styles.toastTextContainer}>
        <Text style={styles.toastTitle}>{text1}</Text>
        {text2 ? <Text style={styles.toastSubtitle}>{text2}</Text> : null}
      </View>
      <Pressable onPress={hide} style={styles.toastCloseBtn}>
        <Feather name="x" size={16} color="#999" />
      </Pressable>
    </View>
  ),
  info: ({ text1, text2, hide }: any) => (
    <View style={styles.toastContainer}>
      <View style={[styles.toastIconBox, { backgroundColor: "rgba(59, 130, 246, 0.1)" }]}>
        <Feather name="info" size={20} color="#3b82f6" />
      </View>
      <View style={styles.toastTextContainer}>
        <Text style={styles.toastTitle}>{text1}</Text>
        {text2 ? <Text style={styles.toastSubtitle}>{text2}</Text> : null}
      </View>
      <Pressable onPress={hide} style={styles.toastCloseBtn}>
        <Feather name="x" size={16} color="#999" />
      </Pressable>
    </View>
  )
};

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <VoiceProvider>
            <AppInner />
            <Toast config={toastConfig} />
          </VoiceProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  toastContainer: {
    width: "90%",
    backgroundColor: "#FFF",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  toastIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  toastTextContainer: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    color: "#222",
  },
  toastSubtitle: {
    fontFamily: "Nunito_500Medium",
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  toastCloseBtn: {
    padding: 4,
    marginLeft: 8,
  },
});
