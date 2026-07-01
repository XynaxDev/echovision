/**
 * EchoVision — App Navigator
 *
 * React Navigation native stack configuration with all application screens.
 * Header styling adapts to the active theme automatically.
 *
 * Route order:
 *   Welcome → Auth → Dashboard → (feature screens)
 */

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { ActivityIndicator, View } from "react-native";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import * as Location from "expo-location";

import { useAppTheme } from "../context/ThemeContext";
import { AuthSelectionScreen } from "../screens/AuthSelectionScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { VoiceAssistantScreen } from "../screens/VoiceAssistantScreen";
import { SceneScannerScreen } from "../screens/SceneScannerScreen";
import { TextReaderScreen } from "../screens/TextReaderScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SOSConfirmationScreen } from "../screens/SOSConfirmationScreen";
import { LegalViewerScreen } from "../screens/LegalViewerScreen";

// ═══════════════════════════════════════════════════════════════════════════
// Route Param List
// ═══════════════════════════════════════════════════════════════════════════

export type RootStackParamList = {
  AuthSelection: undefined;
  Onboarding: undefined;
  Auth: undefined;
  Dashboard: undefined;
  VoiceAssistant: undefined;
  SceneScanner: undefined;
  TextReader: undefined;
  SOSConfirmation: { source: "voice" | "manual" };
  Settings: undefined;
  LegalViewer: { title: string; content: string };
};

// ═══════════════════════════════════════════════════════════════════════════
// Stack Navigator
// ═══════════════════════════════════════════════════════════════════════════

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.JSX.Element {
  const { colors, isDark } = useAppTheme();
  const [initializing, setInitializing] = React.useState(true);
  const [user, setUser] = React.useState<FirebaseAuthTypes.User | null>(null);

  const [hasPermissions, setHasPermissions] = React.useState(true);

  React.useEffect(() => {
    const checkInit = async (userState: FirebaseAuthTypes.User | null) => {
      try {
        const cam = await Camera.getCameraPermissionsAsync();
        const mic = await Audio.getPermissionsAsync();
        const loc = await Location.getForegroundPermissionsAsync();
        
        if (cam.status !== 'granted' || mic.status !== 'granted' || loc.status !== 'granted') {
          setHasPermissions(false);
        } else {
          setHasPermissions(true);
        }
      } catch (e) {
        setHasPermissions(false);
      }
      setUser(userState);
      if (initializing) setInitializing(false);
    };

    const subscriber = auth().onAuthStateChanged((userState) => {
      checkInit(userState);
    });
    return subscriber; // unsubscribe on unmount
  }, [initializing]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={!user ? "AuthSelection" : !hasPermissions ? "Onboarding" : "Dashboard"}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 18,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
        animation: "slide_from_right",
        statusBarStyle: isDark ? "light" : "dark",
        statusBarBackgroundColor: colors.background,
      }}
    >
      <Stack.Screen
        name="AuthSelection"
        component={AuthSelectionScreen}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="VoiceAssistant"
        component={VoiceAssistantScreen}
        options={{
          title: "Voice Assistant",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="SceneScanner"
        component={SceneScannerScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TextReader"
        component={TextReaderScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SOSConfirmation"
        component={SOSConfirmationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LegalViewer"
        component={LegalViewerScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params.title,
        })}
      />
    </Stack.Navigator>
  );
}
