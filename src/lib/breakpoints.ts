/**
 * Centralized breakpoint and design token definitions
 * Keep in sync with tailwind.config.ts and use-mobile.tsx
 */

// Screen breakpoints (in pixels) - matching Tailwind defaults + custom
export const BREAKPOINTS = {
  xs: 360,   // Extra small phones
  sm: 640,   // Standard mobile / small tablets
  md: 768,   // Tablets / large phones in landscape
  lg: 1024,  // Desktops / laptops
  xl: 1280,  // Large desktops
  '2xl': 1536, // Extra large screens
} as const;

// Mobile breakpoint for JS logic (matches Tailwind md)
export const MOBILE_BREAKPOINT = BREAKPOINTS.md;

// Common grid configurations for consistency
export const GRID_CONFIGS = {
  // Standard card grid (Customers, Products, Stores, Vendors)
  cardGrid: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  // Stat card grid (Dashboard summary cards)
  statGrid: 'grid-cols-2 md:grid-cols-4',
  // Two column layout
  twoCol: 'grid-cols-1 md:grid-cols-2',
  // Three column layout
  threeCol: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  // Five column (for dense data like inventory)
  fiveCol: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
} as const;

// Spacing tokens
export const SPACING = {
  page: 'p-4 sm:p-6',         // Page container padding
  card: 'p-4',                // Card content padding
  section: 'space-y-6',       // Section vertical spacing
  cardGap: 'gap-4',           // Grid gap between cards
  headerGap: 'gap-2',         // Gap in headers/actions
} as const;

// Card styles for consistency
export const CARD_STYLES = {
  // Standard clickable card
  clickable: 'group rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer',
  // Card header gradient
  headerGradient: 'bg-gradient-to-br from-primary/10 to-primary/5',
  // Disabled/inactive state
  inactive: 'opacity-60',
  // Selected state
  selected: 'ring-2 ring-primary',
} as const;

// Touch target minimum (for accessibility)
export const TOUCH_TARGET_MIN = 44; // 44px minimum for touch targets

// Animation durations
export const ANIMATIONS = {
  fast: 'duration-150',
  normal: 'duration-200',
  slow: 'duration-300',
} as const;

// Color schemes for different entity types (for card headers)
export const ENTITY_COLORS = {
  customer: { gradient: 'from-primary/10 to-primary/5', icon: 'text-primary' },
  store: { gradient: 'from-blue-500/10 to-blue-500/5', icon: 'text-blue-600' },
  product: { gradient: 'from-primary/10 to-primary/5', icon: 'text-primary' },
  vendor: { gradient: 'from-purple-500/10 to-purple-500/5', icon: 'text-purple-600' },
  inventory: { gradient: 'from-emerald-500/10 to-emerald-500/5', icon: 'text-emerald-600' },
  expense: { gradient: 'from-red-500/10 to-red-500/5', icon: 'text-red-600' },
  order: { gradient: 'from-amber-500/10 to-amber-500/5', icon: 'text-amber-600' },
  route: { gradient: 'from-cyan-500/10 to-cyan-500/5', icon: 'text-cyan-600' },
} as const;

// Status color mappings
export const STATUS_COLORS = {
  active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  inactive: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  verified: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  success: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
} as const;
