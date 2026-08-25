/**
 * Contract for `painted-toasts.ts` — the reader that decides which sentinel constants name a
 * TOAST rather than a screen the wizard leaves painted.
 *
 * The distinction is the product's, not the sentinel file's: a toast is whatever reaches the
 * store field the toast row is drawn from, and the sentinel constants beside it are ordinary
 * strings that say nothing about themselves. So the reader answers by following the product,
 * and the fixtures below are the four ways a toast reaches that field — a literal at the call,
 * a constant member, a value it cannot resolve, and a `null` that clears the row.
 */
import { describe, expect, it } from "vitest";

import { paintedToastsIn, toastKeysIn } from "./painted-toasts.js";

const SENTINELS = "STEP_TEXT";
const SENTINEL_FILE = "e2e/pages/constants.ts";
const STORE = "src/cli/stores/wizard-store.ts";
const COMPONENT = "src/cli/components/wizard/wizard.tsx";

/** How the store paints most of them: a constant member assigned to the field. */
const STORE_SOURCE = [
  `const TOAST_MESSAGES = {`,
  `  GLOBAL_SKILLS_LOCKED: "Global skills cannot be changed from project scope",`,
  `  ALREADY_EJECTED_AT_GLOBAL: "Already exists as ejected skill at global scope",`,
  `} as const;`,
  ``,
  `export const store = {`,
  `  toggle: () => ({ toastMessage: TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED }),`,
  `  eject: () => ({ toastMessage: TOAST_MESSAGES.ALREADY_EJECTED_AT_GLOBAL }),`,
  `  clear: () => ({ toastMessage: null }),`,
  `};`,
  ``,
].join("\n");

/** The other way, one component away: a literal handed straight to the setter. */
const COMPONENT_SOURCE = [
  `export function useScopeToggle(actions: { setToastMessage: (m: string) => void }) {`,
  `  actions.setToastMessage("Scope toggle unavailable in global context");`,
  `}`,
  ``,
].join("\n");

/** A toast composed at the call site, which no reader of source text can resolve to a string. */
const DYNAMIC_SOURCE = [
  `export function report(setToastMessage: (m: string) => void, count: number) {`,
  `  setToastMessage(skillsLeftOutToast(count));`,
  `}`,
  ``,
].join("\n");

/**
 * The sentinel file's own shape: a toast, a second toast reached through a different key name,
 * and screen sentinels around them. `SCOPE` is the case that decides whether this reader can be
 * built at all — it is a substring of the scope-toggle toast, so a reader matching on
 * containment calls a step heading a toast.
 */
const SENTINEL_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  STACK: "Choose a stack",`,
  `  SCOPE: "Scope",`,
  `  ALREADY_EJECTED_AT_GLOBAL: "Already exists as ejected skill at global scope",`,
  `  GLOBAL_SKILLS_BLOCKED: "Global skills cannot be changed from project scope",`,
  `  SCOPE_TOGGLE_BLOCKED: "Scope toggle unavailable in global context",`,
  `} as const;`,
  ``,
].join("\n");

const PRODUCT = [
  { file: STORE, source: STORE_SOURCE },
  { file: COMPONENT, source: COMPONENT_SOURCE },
];

describe("the messages the product paints as a toast", () => {
  it("resolves a constant member assigned to the field", () => {
    expect(paintedToastsIn([{ file: STORE, source: STORE_SOURCE }]).messages).toStrictEqual([
      "Global skills cannot be changed from project scope",
      "Already exists as ejected skill at global scope",
    ]);
  });

  it("resolves a literal handed to the setter", () => {
    expect(paintedToastsIn([{ file: COMPONENT, source: COMPONENT_SOURCE }]).messages).toStrictEqual(
      ["Scope toggle unavailable in global context"],
    );
  });

  it("reads a cleared row as no message rather than as one it cannot see", () => {
    expect(paintedToastsIn([{ file: STORE, source: STORE_SOURCE }]).unresolved).toStrictEqual([]);
  });

  it("reports a toast composed at the call site rather than dropping it", () => {
    const { messages, unresolved } = paintedToastsIn([{ file: STORE, source: DYNAMIC_SOURCE }]);

    expect(messages).toStrictEqual([]);
    expect(
      unresolved,
      "a toast this reader cannot resolve is one the roster below would be short by, and silence about it reads exactly like a clean scan",
    ).toStrictEqual([`${STORE}: skillsLeftOutToast(count)`]);
  });
});

describe("the sentinel constants that name a toast", () => {
  it("names the sentinels whose message the product paints", () => {
    expect(
      toastKeysIn({ file: SENTINEL_FILE, source: SENTINEL_SOURCE }, SENTINELS, PRODUCT).keys,
      "a sentinel naming a toast is one no processed-buffer read may sit beside, and the roster is what keeps that from becoming a ban on reading the screen",
    ).toStrictEqual(["ALREADY_EJECTED_AT_GLOBAL", "GLOBAL_SKILLS_BLOCKED", "SCOPE_TOGGLE_BLOCKED"]);
  });

  it("leaves a sentinel that is merely a fragment of a toast alone", () => {
    const { keys } = toastKeysIn(
      { file: SENTINEL_FILE, source: SENTINEL_SOURCE },
      SENTINELS,
      PRODUCT,
    );

    expect(
      keys,
      "SCOPE is a substring of the scope-toggle toast, so a reader matching on containment calls a step heading a toast and bans reading the screen for it",
    ).not.toContain("SCOPE");
  });

  it("answers nothing for a sentinel constant that is not there", () => {
    expect(
      toastKeysIn(
        { file: SENTINEL_FILE, source: `export const OTHER = { A: "a" };` },
        SENTINELS,
        PRODUCT,
      ).keys,
      "a renamed sentinel constant must leave the roster empty, which the caller's own guard turns into a red",
    ).toStrictEqual([]);
  });
});
