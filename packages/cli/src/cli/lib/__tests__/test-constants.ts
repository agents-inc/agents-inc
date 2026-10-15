// Keyboard escape sequences
export const ARROW_UP = "\x1B[A";
export const ARROW_DOWN = "\x1B[B";
export const ENTER = "\r";
export const CTRL_C = "\x03";
export const BACKSPACE = "\x7F";
export const KEY_Y = "y";
export const KEY_N = "n";

// Timing constants (ms)
export const INPUT_DELAY_MS = 50;
export const RENDER_DELAY_MS = 100;
export const CONFIRM_INPUT_DELAY_MS = 100;
export const OPERATION_DELAY_MS = 150;

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The canonical public source URL used across arrange-side test setup. */
export const TEST_SOURCE_URL = "github:agents-inc/skills";

/**
 * A marketplace that is NOT the default public one.
 *
 * The identity every spec about scoping needs: the built-in catalogue stands in
 * for `TEST_SOURCE_URL` alone, so a stack id that resolves there must not
 * resolve here. One definition because several suites ask the same question.
 */
export const TEST_CUSTOM_SOURCE_URL = "github:acme/skills";
