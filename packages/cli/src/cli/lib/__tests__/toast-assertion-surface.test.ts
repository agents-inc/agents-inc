import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { beforeAll, describe, expect, it } from "vitest";

import { firstElement } from "./helpers/element-at.js";
import { toastKeysIn, type SourceModule } from "./helpers/painted-toasts.js";
import { toastProximityIn } from "./helpers/toast-proximity.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const E2E_ROOT = path.join(CLI_ROOT, "e2e");
const E2E_CONSTANTS = "e2e/pages/constants.ts";

/** The whole E2E tree — a page object or an assertion module can hold the shape as easily as a spec. */
const EVERY_E2E_SOURCE = ["**/*.ts"];

/** The E2E tree holds no generated or vendored source, so nothing under it is excluded. */
const NOTHING_EXCLUDED: string[] = [];

/** The shipped CLI, which is everything that can paint a toast. */
const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/** The sentinel object the E2E tree reaches every screen and every toast through. */
const STEP_TEXT_NAMESPACE = "STEP_TEXT";

/**
 * Toast expressions that resolve to no fixed string, each standing as the reason rather than as
 * a gap.
 *
 * The roster below is derived by matching a sentinel's message against what the product paints,
 * so a toast composed at its call site is one the roster is simply short by — and a short roster
 * reads exactly like a complete one. A new entry here is a new blind spot, and it arrives with
 * the reason it cannot be read rather than silently.
 */
const COMPOSED_AT_THE_CALL_SITE = [
  // The selection-validation refusal, whose sentence is built by `matrix-resolver.ts` around the
  // category and skill it is about.
  "src/cli/components/wizard/step-build.tsx: validation.message",
  // The setter itself, which is the plumbing rather than a toast: every message here reaches the
  // row through it, and its parameter names all of them and none of them.
  "src/cli/stores/wizard-store.ts: message",
  // The count of skills a source could not place, which is a number away from being a string.
  "src/cli/stores/wizard-store.ts: skillsLeftOutToast(warnings.length)",
];

/** Each file matching `patterns` under `root`, paired with its text, in path order. */
async function modulesUnder(
  patterns: string[],
  root: string,
  ignore: string[],
): Promise<SourceModule[]> {
  const files = (await fg(patterns, { cwd: root, ignore })).sort();

  return Promise.all(
    files.map(async (file) => ({ file, source: await readFile(path.join(root, file), "utf8") })),
  );
}

/**
 * A toast is never asserted on the processed buffer.
 *
 * **The roster of toasts is derived rather than remembered, and that is what makes this a gate.**
 * It was hand-written, its own docblock admitted it "does not self-maintain", and it had already
 * lost two members by the time anyone checked — one of them the toast its own subject had most
 * recently produced. `toastKeysIn` asks the store instead: a sentinel names a toast when its
 * message is one the product paints into the toast row, so a sentinel added tomorrow for a toast
 * the store already paints is covered on its first day.
 *
 * The roster cannot be "any `STEP_TEXT` reference" — every other member names a screen sentinel
 * that stays painted, which is exactly what `getScreen()` is for.
 */
describe("a toast is never asserted on the processed buffer", () => {
  let toastConstants: string[];
  let unresolved: string[];
  let e2eSources: SourceModule[];

  beforeAll(async () => {
    const product = await modulesUnder(PRODUCT_SOURCES, CLI_ROOT, NOT_PRODUCT);
    const sentinels = {
      file: E2E_CONSTANTS,
      source: await readFile(path.join(CLI_ROOT, E2E_CONSTANTS), "utf8"),
    };

    const derived = toastKeysIn(sentinels, STEP_TEXT_NAMESPACE, product);
    toastConstants = derived.keys.map((key) => `${STEP_TEXT_NAMESPACE}.${key}`);
    unresolved = derived.unresolved;
    e2eSources = await modulesUnder(EVERY_E2E_SOURCE, E2E_ROOT, NOTHING_EXCLUDED);
  });

  it("names every sentinel whose message the product paints as a toast", () => {
    // Subject guard: an empty roster leaves the scan below matching nothing, and a clean report
    // over a needle that never occurs says nothing at all about the tree.
    expect(
      toastConstants,
      `no ${STEP_TEXT_NAMESPACE} member holds a message the store paints — the derivation has stopped reading one of its two sides`,
    ).not.toStrictEqual([]);

    const referenced = toastConstants.filter((constant) =>
      e2eSources.some(({ source }) => source.includes(constant)),
    );

    expect(
      referenced,
      "no rostered toast constant is named anywhere in the E2E tree, so the scan below has no subject",
    ).not.toStrictEqual([]);
  });

  it("reads every message the store paints, or says which it cannot", () => {
    expect(
      unresolved,
      "a toast this derivation cannot resolve to a string is one the roster may be short by — give it a constant the store names, or add it above with the reason it cannot have one",
    ).toStrictEqual(COMPOSED_AT_THE_CALL_SITE);
  });

  it("reports the shape when it is present", () => {
    // The shape this gate refuses, kept as a fixture rather than performed once. A scan that
    // reports nothing across a clean tree is indistinguishable from one that cannot report — and
    // this one has been clean since the day the last site was converted, which is precisely when
    // an unattended check stops being evidence.
    const openLoopSite = [
      "await agents.toggleAgent(E2E_AGENT_DISPLAY['web-developer']);",
      "const output = agents.getOutput();",
      `expect(output).toContain(${firstElement(toastConstants)});`,
    ].join("\n");

    expect(
      toastProximityIn(openLoopSite, toastConstants),
      "the scan cannot see the shape it exists to refuse, so its silence over the tree says nothing",
    ).toStrictEqual([{ line: 2, read: "getOutput()", toast: firstElement(toastConstants) }]);
  });

  it("finds it nowhere in the E2E tree", () => {
    const sites = e2eSources.flatMap(({ file, source }) =>
      toastProximityIn(source, toastConstants).map(
        (hit) => `${file}:${hit.line} reads ${hit.read} beside ${hit.toast}`,
      ),
    );

    expect(
      sites,
      "a toast lives in a row Ink rewrites in place, so this read passes or fails on a race — press through the *Awaiting step method instead, which anchors on raw output before the keystroke",
    ).toStrictEqual([]);
  });
});
