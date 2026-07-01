/**
 * EchoVision — Centralized Theme Context & Hook
 *
 * Architecture:
 *   1. ThemeProvider wraps the entire app and manages theme state.
 *   2. User preference ('light' | 'dark' | 'system') is persisted in AsyncStorage.
 *   3. When 'system' is selected, the resolved theme follows the device's
 *      native color scheme via React Native's useColorScheme() hook.
 *   4. useAppTheme() custom hook provides typed access to the active colors
 *      and the setter function to change theme mode.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DarkColors,
  LightColors,
  THEME_STORAGE_KEY,
  type ThemeColors,
  type ThemeMode,
} from "../constants/Colors";

export type TextSize = "small" | "medium" | "large";
export const TEXT_SIZE_KEY = "@echovision_text_size";

// ═══════════════════════════════════════════════════════════════════════════
// Theme Definitions
// ═══════════════════════════════════════════════════════════════════════════

const lightTheme: ThemeColors = LightColors;
const darkTheme: ThemeColors = DarkColors;

// ═══════════════════════════════════════════════════════════════════════════
// Context Type Definition
// ═══════════════════════════════════════════════════════════════════════════

interface ThemeContextValue {
  /** The user's selected preference: 'light', 'dark', or 'system' */
  themeMode: ThemeMode;

  /** The resolved/active color palette based on themeMode + system setting */
  colors: ThemeColors;

  /** Whether the currently active theme is dark */
  isDark: boolean;

  /** Update the theme preference and persist to AsyncStorage */
  setThemeMode: (mode: ThemeMode) => void;

  /** The user's selected text size */
  textSize: TextSize;

  /** The font scale multiplier (1.0, 1.2, 1.4) */
  fontScale: number;

  /** Update text size preference */
  setTextSize: (size: TextSize) => void;

  /** Whether the theme has finished loading from AsyncStorage */
  isThemeLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════════════════
// Theme Provider
// ═══════════════════════════════════════════════════════════════════════════

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [textSize, setTextSizeState] = useState<TextSize>("medium");
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);

  // ── Load persisted theme on mount ────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const loadPersistedTheme = async (): Promise<void> => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (isMounted && stored && isValidThemeMode(stored)) {
          setThemeModeState(stored as ThemeMode);
        }
        
        const storedSize = await AsyncStorage.getItem(TEXT_SIZE_KEY);
        if (isMounted && storedSize && ["small", "medium", "large"].includes(storedSize)) {
          setTextSizeState(storedSize as TextSize);
        }
      } catch (error) {
        console.warn("[ThemeProvider] Failed to load persisted theme:", error);
      } finally {
        if (isMounted) {
          setIsThemeLoaded(true);
        }
      }
    };

    loadPersistedTheme();

    return () => {
      isMounted = false;
    };
  }, []);

  // ── Persist theme changes ────────────────────────────────────────────
  const setThemeMode = useCallback((mode: ThemeMode): void => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch((error) => {
      console.warn("[ThemeProvider] Failed to persist theme:", error);
    });
  }, []);

  const setTextSize = useCallback((size: TextSize): void => {
    setTextSizeState(size);
    AsyncStorage.setItem(TEXT_SIZE_KEY, size).catch((error) => {
      console.warn("[ThemeProvider] Failed to persist text size:", error);
    });
  }, []);

  // ── Resolve active color palette ─────────────────────────────────────
  const resolvedColors = useMemo((): { colors: ThemeColors; isDark: boolean } => {
    let isDark: boolean;

    switch (themeMode) {
      case "dark":
        isDark = true;
        break;
      case "light":
        isDark = false;
        break;
      case "system":
      default:
        // When 'system' is selected, follow the device's native preference.
        // Default to dark if the system scheme is not available.
        isDark = systemColorScheme !== "light";
        break;
    }

    return {
      colors: isDark ? DarkColors : LightColors,
      isDark,
    };
  }, [themeMode, systemColorScheme]);

  // ── Memoized context value ───────────────────────────────────────────
  const contextValue = useMemo<ThemeContextValue>(() => {
    const fontScale = textSize === "large" ? 1.4 : textSize === "small" ? 0.9 : 1.0;
    return {
      themeMode,
      colors: resolvedColors.colors,
      isDark: resolvedColors.isDark,
      setThemeMode,
      textSize,
      fontScale,
      setTextSize,
      isThemeLoaded,
    };
  }, [themeMode, resolvedColors, setThemeMode, textSize, setTextSize, isThemeLoaded]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Custom Hook
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Access the current theme colors and mode from any component.
 *
 * @example
 * ```tsx
 * const { colors, isDark, setThemeMode } = useAppTheme();
 *
 * return (
 *   <View style={{ backgroundColor: colors.background }}>
 *     <Text style={{ color: colors.text }}>Hello</Text>
 *   </View>
 * );
 * ```
 */
export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error(
      "useAppTheme must be used within a <ThemeProvider>. " +
      "Wrap your app root with <ThemeProvider> in App.tsx.",
    );
  }
  return context;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function isValidThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}
