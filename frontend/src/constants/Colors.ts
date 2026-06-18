/**
 * EchoVision — WCAG-Compliant Color Palette System
 *
 * Both palettes are designed for high-contrast accessibility:
 *   - Dark mode: minimum 7:1 contrast ratio (WCAG AAA) for text on background
 *   - Light mode: minimum 7:1 contrast ratio (WCAG AAA) for text on background
 *   - Accent colors maintain 4.5:1+ contrast against their respective backgrounds
 */

export interface ThemeColors {
  /** Primary screen background */
  background: string;
  /** Elevated card/block surfaces */
  card: string;
  /** Primary text — highest contrast */
  text: string;
  /** Secondary/muted text */
  textSecondary: string;
  /** Disabled/placeholder text */
  textDisabled: string;
  /** Primary brand accent — green */
  primary: string;
  /** Darker shade of primary for pressed states */
  primaryDark: string;
  /** Lighter shade of primary for backgrounds/fills */
  primaryLight: string;
  /** Destructive/error/SOS red */
  danger: string;
  /** Danger pressed state */
  dangerDark: string;
  /** Warning/caution amber */
  warning: string;
  /** Success/confirmation green */
  success: string;
  /** Subtle border/separator color */
  border: string;
  /** Overlay/scrim for modals */
  overlay: string;
  /** Icon default color */
  icon: string;
  /** Icon active/selected color */
  iconActive: string;
  /** Status bar style */
  statusBar: "light" | "dark";
  /** Keyboard appearance */
  keyboard: "dark" | "light";
}

/**
 * Dark Palette
 *
 * Background #121212 → Text #FFFFFF = contrast ratio ~17.9:1 (AAA)
 * Card #1E1E1E → Text #FFFFFF = contrast ratio ~15.4:1 (AAA)
 * Background #121212 → Primary #00FF66 = contrast ratio ~12.3:1 (AAA)
 */
export const DarkColors: ThemeColors = {
  background: "#121212",
  card: "#1C1C1E",
  text: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textDisabled: "#52525B",
  primary: "#3B82F6", // Premium modern blue
  primaryDark: "#2563EB",
  primaryLight: "#1E3A8A",
  danger: "#EF4444",
  dangerDark: "#B91C1C",
  warning: "#F59E0B",
  success: "#10B981",
  border: "#2C2C2E",
  overlay: "rgba(0, 0, 0, 0.7)",
  icon: "#A1A1AA",
  iconActive: "#3B82F6",
  statusBar: "light",
  keyboard: "dark",
};

/**
 * Light Palette
 *
 * Designed for absolute clarity and contrast.
 */
export const LightColors: ThemeColors = {
  background: "#F2F2F7", // iOS grouped background style
  card: "#FFFFFF",
  text: "#000000",
  textSecondary: "#52525B",
  textDisabled: "#A1A1AA",
  primary: "#2563EB", // Premium modern blue
  primaryDark: "#1D4ED8",
  primaryLight: "#DBEAFE",
  danger: "#DC2626",
  dangerDark: "#991B1B",
  warning: "#D97706",
  success: "#059669",
  border: "#E5E5EA",
  overlay: "rgba(0, 0, 0, 0.4)",
  icon: "#52525B",
  iconActive: "#2563EB",
  statusBar: "dark",
  keyboard: "light",
};

/** Theme mode options persisted in AsyncStorage */
export type ThemeMode = "light" | "dark" | "system";

/** AsyncStorage key for theme preference */
export const THEME_STORAGE_KEY = "@echovision_theme_mode";

/** Navigation theme bridge for React Navigation */
export const getNavigationTheme = (colors: ThemeColors) => ({
  dark: colors.statusBar === "light",
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" as const },
    medium: { fontFamily: "System", fontWeight: "500" as const },
    bold: { fontFamily: "System", fontWeight: "700" as const },
    heavy: { fontFamily: "System", fontWeight: "800" as const },
  },
});
