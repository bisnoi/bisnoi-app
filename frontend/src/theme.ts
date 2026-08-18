// Design tokens — "Bisnoi" identity.
//
// Single LIGHT theme (the old Night/dark mode has been removed). The brand ACCENT
// color is admin-configurable: it's chosen ONCE at module load from localStorage so
// every module-level StyleSheet.create() and `colors.*` reference picks it up. Changing
// the accent persists the choice and reloads the page so the whole app re-themes reliably.
import { Platform } from "react-native";
import { DefaultTheme } from "@react-navigation/native";

// ---- Accent (admin-configurable brand color) ------------------------------
export const ACCENT_STORAGE_KEY = "theme_accent";
export const DEFAULT_ACCENT = "#16A34A"; // Bhojan Green

// Curated palette the admin can pick from.
export const THEME_PALETTE: { name: string; color: string }[] = [
  { name: "Bisnoi Pure Veg", color: "#1B8C3A" },
  { name: "Bhojan Green", color: "#16A34A" },
  { name: "Emerald", color: "#059669" },
  { name: "Teal", color: "#0D9488" },
  { name: "Ocean Blue", color: "#2563EB" },
  { name: "Indigo", color: "#4F46E5" },
  { name: "Royal Purple", color: "#7C3AED" },
  { name: "Magenta", color: "#DB2777" },
  { name: "Rose", color: "#E11D48" },
  { name: "Tandoori Red", color: "#E23744" },
  { name: "Spice Orange", color: "#EA580C" },
  { name: "Amber", color: "#D97706" },
  { name: "Slate", color: "#475569" },
];

// ---- Small color helpers (pure, no deps) ----------------------------------
function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("");
}
// amt < 0 → darken, amt > 0 → lighten (range -1..1)
function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amt < 0) {
    const f = 1 + amt;
    return rgbToHex(r * f, g * f, b * f);
  }
  const f = amt;
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
// Readable foreground (white on dark accents, near-black on light accents).
function onColor(hex: string): string {
  return luminance(hex) > 0.62 ? "#0B0F0C" : "#FFFFFF";
}
export function isValidHex(hex: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((hex || "").trim());
}

function readAccent(): string {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
      if (v && isValidHex(v)) return v;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT;
}

export const accent: string = readAccent();

// Dark mode has been removed — the app is always light now.
export type ColorScheme = "light";
export const colorScheme: ColorScheme = "light";
export const isDark = false;

// ---- Palette (neutral surfaces + brand accent) ----------------------------
type Palette = {
  primary: string; primaryDark: string; primarySoft: string; onPrimary: string;
  secondary: string; background: string; surface: string; surfaceAlt: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  border: string; borderStrong: string;
  success: string; successSoft: string; warning: string; warningSoft: string;
  error: string; errorSoft: string; vegGreen: string; nonVegRed: string;
  dark: string; overlay: string;
};

export const colors: Palette = {
  // Brand accent (admin-configurable) — derived shades for depth.
  primary: accent,
  primaryDark: shade(accent, -0.18),
  primarySoft: shade(accent, 0.86),
  onPrimary: onColor(accent),
  secondary: shade(accent, -0.08),

  // Neutral light surfaces (work with any accent).
  background: "#F5F7F8",
  surface: "#FFFFFF",
  surfaceAlt: "#ECEFF2",
  textPrimary: "#15191C",
  textSecondary: "#525B63",
  textMuted: "#8A929B",
  border: "#E6EAED",
  borderStrong: "#D4DADF",

  // Semantic colors stay fixed (veg = green, errors = red, etc.).
  success: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#C9821A",
  warningSoft: "#FBEBCC",
  error: "#D0021B",
  errorSoft: "#FBE0E3",
  vegGreen: "#16A34A",
  nonVegRed: "#D0021B",
  dark: "#0B0F0C",
  overlay: "rgba(0,0,0,0.4)",
};

// React Navigation theme — override RN's default `rgb(242,242,242)` background
// with `transparent` so the underlying page/screen shows through with no
// off-white strip around/behind the floating tab bar.
export const bisnoiNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
    card: "transparent",
    primary: colors.primary,
  },
};

// ---- Accent controls ------------------------------------------------------
export function getAccentColor(): string {
  return accent;
}

// Persist a new accent locally and reload so the whole app re-themes.
export function setAccentColor(next: string) {
  if (!isValidHex(next)) return;
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
}

// Sync with the admin-chosen global theme fetched from the backend on boot.
// Only reloads once when the server value differs from the cached local value.
export function applyServerTheme(serverColor?: string | null) {
  try {
    if (!serverColor || !isValidHex(serverColor)) return;
    if (Platform.OS !== "web" || typeof window === "undefined" || !window.localStorage) return;
    const current = window.localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT;
    if (current.toLowerCase() !== serverColor.toLowerCase()) {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, serverColor);
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999,
};

// RN 0.76+ supports `boxShadow` as a cross-platform style prop (web + native).
// `elevation` is kept for Android to preserve native shadow rendering.
export const shadow = {
  card: {
    boxShadow: "0px 2px 8px rgba(45, 35, 35, 0.06)",
    elevation: 2,
  },
  lifted: {
    boxShadow: "0px 6px 16px rgba(45, 35, 35, 0.12)",
    elevation: 6,
  },
};

export const font = {
  black: "800" as const,
  bold: "700" as const,
  semi: "600" as const,
  med: "500" as const,
  reg: "400" as const,
};

// Bottom tab bar — follows the admin-configurable ACCENT color (was a fixed black bar).
// Active icon/label use the readable foreground for the accent; inactive is a dimmed
// version of the same so it stays legible on both light and dark accents.
// Taller bar + explicit lineHeight prevents label clipping on web.
const _tabActiveTint = colors.onPrimary; // "#FFFFFF" on dark accents, near-black on light ones
const _tabInactiveTint = _tabActiveTint === "#FFFFFF" ? "rgba(255,255,255,0.62)" : "rgba(11,15,12,0.55)";

// Floating tab bar — detached pill sitting above content with margin on all
// sides. Uses the ACCENT color with 85% opacity (15% transparent) and fully
// rounded corners to match the reference floating design.
// Convert accent hex → rgba() so we can bake in the 85% opacity without
// affecting the icon/label colors (React Native's `opacity` prop would fade
// children too).
function _hexToRgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const _tabBg = _hexToRgba(colors.primary, 0.85); // 85% opaque, 15% transparent

export const tabBar = {
  activeTintColor: _tabActiveTint,
  inactiveTintColor: _tabInactiveTint,
  style: {
    // Floating pill — detached from edges so it looks like the reference image.
    // `position:absolute` + explicit left/right/bottom + fully rounded corners.
    // The scene background (bisnoiNavTheme.colors.background = transparent)
    // ensures NO off-white/light strip shows around or behind the pill.
    position: "absolute" as const,
    left: 16,
    right: 16,
    bottom: 12,
    marginHorizontal: 0,
    backgroundColor: _tabBg,
    opacity: 1,
    borderTopWidth: 0,
    borderTopColor: "transparent",
    borderWidth: 0,
    borderRadius: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    height: 58,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 10,
    // Soft drop shadow so the bar visibly lifts off the content behind it.
    boxShadow: "0 8px 24px rgba(11,15,12,0.22)",
    elevation: 18,
    shadowColor: "#0B0F0C",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    overflow: "hidden" as const,
  } as any,
  labelStyle: { fontSize: 11, fontWeight: "700" as const, lineHeight: 16, marginTop: 2 },
  iconStyle: { marginTop: 2 },
};
