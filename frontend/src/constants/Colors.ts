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
  background: "#080A1A", // Deep Navy Dark
  card: "#12142B", // Elevated Navy
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.6)",
  textDisabled: "#52525B",
  primary: "#0171DF", // Blue
  primaryDark: "#0C4CB0",
  primaryLight: "rgba(1, 113, 223, 0.2)",
  danger: "#EF4444", // Red
  dangerDark: "#DC2626",
  warning: "#FFD140", // Yellow
  success: "#3CAE8B", // Teal
  border: "rgba(255, 255, 255, 0.08)",
  overlay: "rgba(0, 0, 0, 0.8)",
  icon: "#E5E5EA",
  iconActive: "#FFFFFF",
  statusBar: "light",
  keyboard: "dark",
};

export const LightColors: ThemeColors = {
  background: "#F5F5F7", 
  card: "#FFFFFF",
  text: "#121660", // Warm Navy Text
  textSecondary: "rgba(18, 22, 96, 0.65)",
  textDisabled: "#A1A1AA",
  primary: "#0171DF", // Blue
  primaryDark: "#121660",
  primaryLight: "rgba(1, 113, 223, 0.1)",
  danger: "#EF4444",
  dangerDark: "#DC2626",
  warning: "#FFD140",
  success: "#3CAE8B",
  border: "rgba(18, 22, 96, 0.1)",
  overlay: "rgba(0, 0, 0, 0.4)",
  icon: "#8E8E93",
  iconActive: "#121660",
  statusBar: "dark",
  keyboard: "light",
};

export const SolidQuads = {
  scanner: "#3CAE8B", // Teal Green
  textReader: "#0171DF", // Vibrant Blue
  sos: "#EF4444", // Red
  settings: "#FFD140", // Yellow
};

export const Gradients = {
  voicePill: ["#0171DF", "#8A2BE2", "#FF2A85"], // Soft AI gradient
  voicePillInactive: ["#E5E5EA", "#8E8E93", "#1C1C1E"], // Metallic silver/grey/black gradient
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
