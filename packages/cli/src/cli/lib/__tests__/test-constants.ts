export const ARROW_UP = "\x1B[A";
export const ARROW_DOWN = "\x1B[B";
export const ENTER = "\r";
export const CTRL_C = "\x03";
export const KEY_Y = "y";
export const KEY_N = "n";

export const INPUT_DELAY_MS = 50;
export const RENDER_DELAY_MS = 100;
export const CONFIRM_INPUT_DELAY_MS = 100;

/** The terminal a spec's piped stdout is sized by: what a headless run measures. */
export const SPEC_TERMINAL_COLUMNS = 80;
export const SPEC_TERMINAL_ROWS = 24;

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const TEST_SOURCE_URL = "github:agents-inc/skills";

/** Non-default marketplace: a stack id the built-in catalogue resolves must not resolve here. */
export const TEST_CUSTOM_SOURCE_URL = "github:acme/skills";
