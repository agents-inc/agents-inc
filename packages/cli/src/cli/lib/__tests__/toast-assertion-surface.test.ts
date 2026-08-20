import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { firstElement } from "./helpers/element-at.js";
import { toastProximityIn } from "./helpers/toast-proximity.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const E2E_ROOT = path.join(CLI_ROOT, "e2e");
const E2E_CONSTANTS = path.join(E2E_ROOT, "pages", "constants.ts");

/** The whole E2E tree — a page object or an assertion module can hold the shape as easily as a spec. */
const EVERY_E2E_SOURCE = "**/*.ts";

/**
 * The `STEP_TEXT` keys that name a TOAST, and so the ones a processed-buffer read must not sit
 * beside. Every other `STEP_TEXT` entry names a screen sentinel that stays painted, which is
 * exactly what `getScreen()` is for — so this cannot be "any STEP_TEXT reference", and a roster is
 * what makes the check discriminating rather than a ban on reading the screen.
 *
 * Hand-named, which is the one thing about this gate that does not self-maintain: a new toast
 * constant is invisible here until someone adds it. The presence check below is what stops the
 * roster from silently emptying instead — a renamed key fails rather than matching nothing.
 */
const STEP_TEXT_NAMESPACE = "STEP_TEXT";
const TOAST_KEYS = ["GLOBAL_AGENTS_BLOCKED", "GLOBAL_SKILLS_BLOCKED"];
const TOAST_CONSTANTS = TOAST_KEYS.map((key) => `${STEP_TEXT_NAMESPACE}.${key}`);

/**
 * The shape this gate refuses, kept as a fixture rather than performed once. A scan that reports
 * nothing across a clean tree is indistinguishable from one that cannot report — and this one has
 * been clean since the day the last site was converted, which is precisely when an unattended
 * check stops being evidence.
 */
const OPEN_LOOP_SITE = [
  "await agents.toggleAgent(E2E_AGENT_DISPLAY['web-developer']);",
  "const output = agents.getOutput();",
  `expect(output).toContain(${firstElement(TOAST_CONSTANTS)});`,
].join("\n");

/** Each E2E source paired with its text. */
async function e2eSources(): Promise<{ file: string; source: string }[]> {
  const files = await fg(EVERY_E2E_SOURCE, { cwd: E2E_ROOT });
  return Promise.all(
    files.sort().map(async (file) => ({
      file,
      source: await readFile(path.join(E2E_ROOT, file), "utf8"),
    })),
  );
}

describe("a toast is never asserted on the processed buffer", () => {
  it("names toast constants e2e/pages/constants.ts still declares", async () => {
    const constants = await readFile(E2E_CONSTANTS, "utf8");
    const gone = TOAST_KEYS.filter((key) => !constants.includes(`${key}:`));

    expect(
      gone,
      "a toast constant this roster names no longer exists, so the scan below matches nothing for it",
    ).toStrictEqual([]);
  });

  it("reports the shape when it is present", () => {
    expect(
      toastProximityIn(OPEN_LOOP_SITE, TOAST_CONSTANTS),
      "the scan cannot see the shape it exists to refuse, so its silence over the tree says nothing",
    ).toStrictEqual([{ line: 2, read: "getOutput()", toast: firstElement(TOAST_CONSTANTS) }]);
  });

  it("finds it nowhere in the E2E tree", async () => {
    const sites = (await e2eSources()).flatMap(({ file, source }) =>
      toastProximityIn(source, TOAST_CONSTANTS).map(
        (hit) => `${file}:${hit.line} reads ${hit.read} beside ${hit.toast}`,
      ),
    );

    expect(
      sites,
      "a toast lives in a row Ink rewrites in place, so this read passes or fails on a race — press through the *Awaiting step method instead, which anchors on raw output before the keystroke",
    ).toStrictEqual([]);
  });
});
