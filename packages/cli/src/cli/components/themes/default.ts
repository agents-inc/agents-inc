import { extendTheme, defaultTheme } from "@inkjs/ui";
import { CLI_COLORS } from "../../consts.js";

/** Variant → color mapping shared by StatusMessage, Alert, and Badge; unknown variants fall back per-site. */
const VARIANT_COLORS: Partial<Record<string, string>> = {
  error: CLI_COLORS.ERROR,
  warning: CLI_COLORS.WARNING,
  success: CLI_COLORS.SUCCESS,
  info: CLI_COLORS.INFO,
};

/**
 * @inkjs/ui types the props it hands a style function as `any`, so reading
 * `variant` off them is an unchecked access at four call sites. Taking it as
 * `unknown` here is the boundary: the value is only ever a lookup key, and a
 * variant the map does not name falls back to what the call site passes.
 */
const variantColor = (variant: unknown, fallback: string): string =>
  VARIANT_COLORS[String(variant)] ?? fallback;

/**
 * CLI theme matching existing picocolors styling
 *
 * Color scheme:
 * - Cyan: Focus/primary (headings, prompts, selected items)
 * - Green: Success states
 * - Red: Errors
 * - Yellow: Warnings
 * - Blue: Info messages
 */
export const cliTheme = extendTheme(defaultTheme, {
  components: {
    Spinner: {
      styles: {
        frame: () => ({ color: CLI_COLORS.PRIMARY }),
        label: () => ({ color: CLI_COLORS.NEUTRAL }),
      },
    },
    Select: {
      styles: {
        focusIndicator: () => ({ color: CLI_COLORS.FOCUS }),
        label: ({ isFocused }) => ({
          color: isFocused ? CLI_COLORS.FOCUS : undefined,
        }),
      },
    },
    MultiSelect: {
      styles: {
        focusIndicator: () => ({ color: CLI_COLORS.FOCUS }),
        label: ({ isFocused, isSelected }) => ({
          color: isFocused ? CLI_COLORS.FOCUS : isSelected ? CLI_COLORS.SUCCESS : undefined,
        }),
        checkboxChecked: () => ({ color: CLI_COLORS.SUCCESS }),
      },
    },
    StatusMessage: {
      styles: {
        container: ({ variant }) => ({
          borderStyle: "round",
          borderColor: variantColor(variant, CLI_COLORS.INFO),
        }),
      },
    },
    Alert: {
      styles: {
        container: ({ variant }) => ({
          borderColor: variantColor(variant, CLI_COLORS.INFO),
        }),
        icon: ({ variant }) => ({
          color: variantColor(variant, CLI_COLORS.INFO),
        }),
      },
    },
    TextInput: {
      styles: {
        container: ({ isFocused }) => ({
          borderColor: isFocused ? CLI_COLORS.FOCUS : CLI_COLORS.NEUTRAL,
        }),
        cursor: () => ({ color: CLI_COLORS.PRIMARY }),
      },
    },
    ConfirmInput: {
      styles: {
        highlightedChoice: () => ({ color: CLI_COLORS.PRIMARY }),
      },
    },
    Badge: {
      styles: {
        container: ({ variant }) => ({
          color: variantColor(variant, CLI_COLORS.PRIMARY),
        }),
      },
    },
  },
});
