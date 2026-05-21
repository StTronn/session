import { RGBA, parseColor } from "@opentui/core";

/** A color accepted by opentui props: a CSS/hex string or an RGBA object. */
export type ColorValue = string | RGBA;

export interface TuiTheme {
  bg: ColorValue;
  text: ColorValue;
  value: ColorValue;
  muted: ColorValue;
  dim: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  warning: ColorValue;
  danger: ColorValue;
}

// ANSI 16-color palette indices. The terminal remaps these to the active
// colorscheme, so the UI adapts to whatever theme the user runs.
const ANSI = {
  white: 7,
  brightBlack: 8,
  brightRed: 9,
  cyan: 6,
  brightYellow: 11,
  brightWhite: 15,
} as const;

export function terminalTheme(): TuiTheme {
  return {
    // Transparent lets the terminal background show through.
    bg: "transparent",
    text: RGBA.defaultForeground(),
    value: RGBA.fromIndex(ANSI.brightWhite),
    muted: RGBA.fromIndex(ANSI.white),
    dim: RGBA.fromIndex(ANSI.brightBlack),
    border: RGBA.fromIndex(ANSI.brightBlack),
    accent: process.env.SESSION_TUI_ACCENT
      ? parseColor(process.env.SESSION_TUI_ACCENT)
      : RGBA.fromIndex(ANSI.cyan),
    warning: RGBA.fromIndex(ANSI.brightYellow),
    danger: RGBA.fromIndex(ANSI.brightRed),
  };
}

// Categories keep fixed hues so they stay visually distinct from each other.
export const categoryColors = [
  "#2fb9c3",
  "#7bd88f",
  "#f5b74d",
  "#d678dd",
  "#70a5ff",
  "#ff7979",
];
