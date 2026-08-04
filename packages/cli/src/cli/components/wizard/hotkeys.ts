/**
 * Centralized hotkey registry for wizard components.
 *
 * Every character-based hotkey and its display label lives here so that
 * changing a binding updates the key check, the footer hint, and the
 * info panel in one place.
 */

import { FEATURE_FLAGS } from "../../lib/feature-flags.js";
import type { WizardStep } from "../../stores/wizard-store.js";

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

/**
 * Whether `HOTKEY_INFO` does anything on `step` — the single answer both the
 * key handler in `wizard.tsx` and the footer hint in `wizard-layout.tsx` read,
 * so the wizard never advertises a key it ignores.
 *
 * The confirm step is excluded because it already renders the panel the
 * overlay would show, and the overlay REPLACES the step rather than sitting
 * over it: opening it there would unmount the confirm step's `Enter` handler
 * and strand the user on a screen nothing can complete.
 */
export function isInfoPanelAvailable(step: WizardStep): boolean {
  return FEATURE_FLAGS.INFO_PANEL && step !== "confirm";
}
