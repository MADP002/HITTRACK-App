// ============================================================
//  HITTRACK — Mobile theme (single source of truth for colors)
//
//  Warm palette aligned to the web app, so mobile stops looking
//  "pale" (cold pure-black/white + flat gray borders). Key names
//  match the per-screen `C` objects that already exist, so a screen
//  migrates by swapping `const C = {…}` for `import { C } from
//  '../../lib/theme'` — every existing C.red / C.bg keeps working.
//
//  All values are HEX (not rgba) so the common `C.x + '22'` alpha
//  concatenation used across screens stays valid (8-digit hex).
//  Performance note: this is colors only — zero runtime cost. Glows
//  (shadows) are applied per-component on hero cards, never list rows.
// ============================================================

export const C = {
  bg:        '#0f0d0d',  // warm near-black (was #0A0A0A cold)
  card:      '#1a1413',  // warm card surface (was #161616)
  cardAlt:   '#231b18',  // slightly lighter warm surface for layering
  border:    '#2e2a22',  // warm gold-tinted border (was #2A2A2A gray)
  borderStrong: '#46402f',
  red:       '#e84a2f',  // warm orange-red accent (was #E63946 pink-red)
  redDark:   '#c93820',
  white:     '#f0ece8',  // warm off-white text (was #FFFFFF pure)
  gray:      '#8a857d',  // warm secondary text (was #888888 cold)
  lightGray: '#b8b3ab',  // warm light gray (was #CCCCCC)
  inputBg:   '#1e1a17',  // warm input/well bg (was #1E1E1E)
  errorBg:   '#2A1215',
  green:     '#4ade80',
  gold:      '#f5c842',
  blue:      '#42a5f5',
  purple:    '#c084fc',
  orange:    '#fb923c',
};

// Reusable colored glow for HERO elements only (cards/buttons, not list rows).
// Spread into a style object: { ...glow(C.purple) }.
export const glow = (color, { opacity = 0.25, radius = 12, height = 4, elevation = 6 } = {}) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export default C;
