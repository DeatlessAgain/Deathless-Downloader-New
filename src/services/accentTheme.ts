export type AccentColor = 'emerald' | 'violet' | 'orange' | 'cyan' | 'rose' | 'blue';

export interface AccentThemeConfig {
  id: AccentColor;
  name: string;
  hex: string;
  darkHex: string;
  colorHex: string;
  bg: string;
  bgHover: string;
  bgSubtle: string;
  text: string;
  textLight: string;
  textDark: string;
  border: string;
  borderSubtle: string;
  ring: string;
  gradient: string;
  badge: string;
  glow: string;
  accentCheck: string;
}

export const ACCENT_THEMES: Record<AccentColor, AccentThemeConfig> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    hex: '#10b981',
    darkHex: '#059669',
    colorHex: '#10b981',
    bg: 'bg-emerald-600',
    bgHover: 'hover:bg-emerald-500',
    bgSubtle: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    textLight: 'text-emerald-600',
    textDark: 'text-emerald-400',
    border: 'border-emerald-500',
    borderSubtle: 'border-emerald-500/30',
    ring: 'focus:ring-emerald-500 focus:border-emerald-500',
    gradient: 'from-emerald-600 to-teal-600',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    glow: 'shadow-emerald-500/20',
    accentCheck: 'accent-emerald-600 text-emerald-600 focus:ring-emerald-500',
  },
  violet: {
    id: 'violet',
    name: 'Violet',
    hex: '#8b5cf6',
    darkHex: '#7c3aed',
    colorHex: '#8b5cf6',
    bg: 'bg-violet-600',
    bgHover: 'hover:bg-violet-500',
    bgSubtle: 'bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    textLight: 'text-violet-600',
    textDark: 'text-violet-400',
    border: 'border-violet-500',
    borderSubtle: 'border-violet-500/30',
    ring: 'focus:ring-violet-500 focus:border-violet-500',
    gradient: 'from-violet-600 to-purple-600',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20',
    glow: 'shadow-violet-500/20',
    accentCheck: 'accent-violet-600 text-violet-600 focus:ring-violet-500',
  },
  orange: {
    id: 'orange',
    name: 'Orange',
    hex: '#f97316',
    darkHex: '#ea580c',
    colorHex: '#f97316',
    bg: 'bg-orange-600',
    bgHover: 'hover:bg-orange-500',
    bgSubtle: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    textLight: 'text-orange-600',
    textDark: 'text-orange-400',
    border: 'border-orange-500',
    borderSubtle: 'border-orange-500/30',
    ring: 'focus:ring-orange-500 focus:border-orange-500',
    gradient: 'from-orange-600 to-amber-600',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
    glow: 'shadow-orange-500/20',
    accentCheck: 'accent-orange-600 text-orange-600 focus:ring-orange-500',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan',
    hex: '#06b6d4',
    darkHex: '#0891b2',
    colorHex: '#06b6d4',
    bg: 'bg-cyan-600',
    bgHover: 'hover:bg-cyan-500',
    bgSubtle: 'bg-cyan-500/10',
    text: 'text-cyan-600 dark:text-cyan-400',
    textLight: 'text-cyan-600',
    textDark: 'text-cyan-400',
    border: 'border-cyan-500',
    borderSubtle: 'border-cyan-500/30',
    ring: 'focus:ring-cyan-500 focus:border-cyan-500',
    gradient: 'from-cyan-600 to-indigo-600',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
    glow: 'shadow-cyan-500/20',
    accentCheck: 'accent-cyan-600 text-cyan-600 focus:ring-cyan-500',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    hex: '#f43f5e',
    darkHex: '#e11d48',
    colorHex: '#f43f5e',
    bg: 'bg-rose-600',
    bgHover: 'hover:bg-rose-500',
    bgSubtle: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    textLight: 'text-rose-600',
    textDark: 'text-rose-400',
    border: 'border-rose-500',
    borderSubtle: 'border-rose-500/30',
    ring: 'focus:ring-rose-500 focus:border-rose-500',
    gradient: 'from-rose-600 to-pink-600',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
    glow: 'shadow-rose-500/20',
    accentCheck: 'accent-rose-600 text-rose-600 focus:ring-rose-500',
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    hex: '#3b82f6',
    darkHex: '#2563eb',
    colorHex: '#3b82f6',
    bg: 'bg-blue-600',
    bgHover: 'hover:bg-blue-500',
    bgSubtle: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    textLight: 'text-blue-600',
    textDark: 'text-blue-400',
    border: 'border-blue-500',
    borderSubtle: 'border-blue-500/30',
    ring: 'focus:ring-blue-500 focus:border-blue-500',
    gradient: 'from-blue-600 to-indigo-600',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    glow: 'shadow-blue-500/20',
    accentCheck: 'accent-blue-600 text-blue-600 focus:ring-blue-500',
  },
};

export interface AccentOptionItem {
  id: AccentColor;
  name: string;
  colorHex: string;
  theme: AccentThemeConfig;
}

export const ACCENT_COLOR_OPTIONS: AccentOptionItem[] = [
  { id: 'emerald', name: 'Emerald', colorHex: '#10b981', theme: ACCENT_THEMES.emerald },
  { id: 'violet', name: 'Violet', colorHex: '#8b5cf6', theme: ACCENT_THEMES.violet },
  { id: 'orange', name: 'Orange', colorHex: '#f97316', theme: ACCENT_THEMES.orange },
  { id: 'cyan', name: 'Cyan', colorHex: '#06b6d4', theme: ACCENT_THEMES.cyan },
  { id: 'rose', name: 'Rose', colorHex: '#f43f5e', theme: ACCENT_THEMES.rose },
  { id: 'blue', name: 'Blue', colorHex: '#3b82f6', theme: ACCENT_THEMES.blue },
];

export function getAccentTheme(color?: string): AccentThemeConfig {
  if (color && (color as AccentColor) in ACCENT_THEMES) {
    return ACCENT_THEMES[color as AccentColor];
  }
  return ACCENT_THEMES.cyan;
}

export function applyAccentToDocument(accent?: string): void {
  const theme = getAccentTheme(accent);
  const root = document.documentElement;
  root.setAttribute('data-accent', theme.id);
  root.style.setProperty('--color-accent-primary', theme.hex);
  root.style.setProperty('--color-accent-hover', theme.darkHex);
}
