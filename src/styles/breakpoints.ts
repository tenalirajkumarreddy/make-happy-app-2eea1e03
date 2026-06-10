/**
 * Source of truth for responsive breakpoints and design tokens.
 * Keep in sync with tailwind.config.ts and use-mobile.tsx.
 */

// ── Screen breakpoints (px) — matches Tailwind defaults + custom xs ──
// Base (no prefix) covers 0–479px; xs handles 480–639px.
export const BREAKPOINTS = {
  xs: 480,     // Small phones / phablets
  sm: 640,     // Large phones / small tablets
  md: 768,     // Tablets / landscape phones
  lg: 1024,    // Desktops / laptops
  xl: 1280,    // Large desktops
  '2xl': 1536, // Extra-large screens
} as const;

// JS mobile detection threshold (max-width below md)
export const MOBILE_BREAKPOINT = BREAKPOINTS.md;

// ── Android device profiles (for Capacitor APK testing) ──
export const ANDROID_DEVICES = {
  phoneSmall:  { width: 360, height: 640,  name: 'Small phone' },
  phoneMedium: { width: 390, height: 844,  name: 'Medium phone' },
  phoneLarge:  { width: 412, height: 915,  name: 'Large phone' },
  tabletSmall: { width: 600, height: 960,  name: 'Small tablet' },
  tabletLarge: { width: 820, height: 1180, name: 'Large tablet' },
} as const;

// Android system UI insets (status bar + nav bar, in px)
export const ANDROID_INSETS = {
  statusBar: 24,   // Typical status bar
  navBar:    48,   // Typical 3-button nav
  gestureBar: 32,  // Gesture hint area
} as const;

// ── Container query thresholds (for @container rules) ──
export const CONTAINER_BREAKPOINTS = {
  panelSm: 400,
  panelMd: 600,
  panelLg: 800,
} as const;

// ── Viewport JS helpers ──
export function viewportIsAtLeast(bp: keyof typeof BREAKPOINTS): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS[bp];
}

export function viewportIsAtMost(bp: keyof typeof BREAKPOINTS): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < BREAKPOINTS[bp];
}

export function viewportBetween(min: keyof typeof BREAKPOINTS, max: keyof typeof BREAKPOINTS): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  return w >= BREAKPOINTS[min] && w < BREAKPOINTS[max];
}

// Returns a matchMedia string for CSS-based responsive checks in JS
export function mqMin(bp: keyof typeof BREAKPOINTS): string {
  return `(min-width: ${BREAKPOINTS[bp]}px)`;
}

export function mqMax(bp: keyof typeof BREAKPOINTS): string {
  return `(max-width: ${BREAKPOINTS[bp] - 1}px)`;
}

// ── Common grid configurations ──
export const GRID_CONFIGS = {
  cardGrid: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  statGrid: 'grid-cols-2 md:grid-cols-4',
  twoCol:   'grid-cols-1 md:grid-cols-2',
  threeCol: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  fiveCol:  'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
} as const;

// ── Spacing tokens ──
export const SPACING = {
  page:      'p-4 sm:p-6',
  card:      'p-4',
  section:   'space-y-6',
  cardGap:   'gap-4',
  headerGap: 'gap-2',
} as const;

// ── Card styles ──
export const CARD_STYLES = {
  clickable:      'group rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer',
  headerGradient: 'bg-gradient-to-br from-primary/10 to-primary/5',
  inactive:       'opacity-60',
  selected:       'ring-2 ring-primary',
} as const;

// ── Touch target minimum (WCAG) ──
export const TOUCH_TARGET_MIN = 44;

// ── Animation durations ──
export const ANIMATIONS = {
  fast:   'duration-150',
  normal: 'duration-200',
  slow:   'duration-300',
} as const;

// ── Entity color schemes ──
export const ENTITY_COLORS = {
  customer:  { gradient: 'from-primary/10 to-primary/5',      icon: 'text-primary' },
  store:     { gradient: 'from-blue-500/10 to-blue-500/5',    icon: 'text-blue-600' },
  product:   { gradient: 'from-primary/10 to-primary/5',      icon: 'text-primary' },
  vendor:    { gradient: 'from-purple-500/10 to-purple-500/5',icon: 'text-purple-600' },
  inventory: { gradient: 'from-emerald-500/10 to-emerald-500/5', icon: 'text-emerald-600' },
  expense:   { gradient: 'from-red-500/10 to-red-500/5',      icon: 'text-red-600' },
  order:     { gradient: 'from-amber-500/10 to-amber-500/5',  icon: 'text-amber-600' },
  route:     { gradient: 'from-cyan-500/10 to-cyan-500/5',    icon: 'text-cyan-600' },
} as const;

// ── Status color mappings ──
export const STATUS_COLORS = {
  active:   { bg: 'bg-success/10', text: 'text-success' },
  inactive: { bg: 'bg-muted',      text: 'text-muted-foreground' },
  pending:  { bg: 'bg-warning/10', text: 'text-warning' },
  verified: { bg: 'bg-info/10',    text: 'text-info' },
  error:    { bg: 'bg-destructive/10', text: 'text-destructive' },
  success:  { bg: 'bg-success/10', text: 'text-success' },
} as const;
