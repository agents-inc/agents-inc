/**
 * Centralized hotkey registry for wizard components.
 *
 * Every character-based hotkey and its display label lives here so that
 * changing a binding updates the key check, the footer hint, and the
 * info panel in one place.
 */

// ---------------------------------------------------------------------------
// Global hotkeys (active across multiple wizard steps)
// ---------------------------------------------------------------------------

export const HOTKEY_INFO = { key: "i", label: "I" } as const;
export const HOTKEY_ACCEPT_DEFAULTS = { key: "a", label: "A" } as const;
// HOTKEY_SCOPE and HOTKEY_SETTINGS deliberately share "s" — they are context-gated
// (scope acts on the build/agents grids, settings on the settings step; never both active).
export const HOTKEY_SCOPE = { key: "s", label: "S" } as const;
export const HOTKEY_SETTINGS = { key: "s", label: "S" } as const;

// ---------------------------------------------------------------------------
// Build step hotkeys
// ---------------------------------------------------------------------------

export const HOTKEY_TOGGLE_LABELS = { key: "d", label: "D" } as const;
export const HOTKEY_FILTER_INCOMPATIBLE = { key: "f", label: "F" } as const;

// ---------------------------------------------------------------------------
// Sources step hotkeys (customize view)
// ---------------------------------------------------------------------------

export const HOTKEY_SET_ALL_LOCAL = { key: "l", label: "L" } as const;
export const HOTKEY_SET_ALL_PLUGIN = { key: "p", label: "P" } as const;

// ---------------------------------------------------------------------------
// Settings step hotkeys
// ---------------------------------------------------------------------------

export const HOTKEY_ADD_SOURCE = { key: "a", label: "A" } as const;

// ---------------------------------------------------------------------------
// Common key labels (for structural keys handled via Ink key objects)
// ---------------------------------------------------------------------------

/** The spacebar input character (Ink delivers a literal space for the space key). */
export const KEY_SPACE = " ";

export const KEY_LABEL_ENTER = "ENTER" as const;
export const KEY_LABEL_ESC = "ESC" as const;
export const KEY_LABEL_SPACE = "SPACE" as const;
export const KEY_LABEL_DEL = "DEL" as const;
export const KEY_LABEL_ARROWS_VERT = "\u2191/\u2193" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case-insensitive check for a character hotkey. */
export function isHotkey(input: string, hotkey: { key: string }): boolean {
  return input.toLowerCase() === hotkey.key.toLowerCase();
}
