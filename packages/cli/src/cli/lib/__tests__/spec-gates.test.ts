import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESLint, type Linter } from "eslint";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import {
  type JourneyRow,
  SPEC_SUFFIX,
  TO_TEST_MARKER,
  journeyNumbersIn,
  nonSpecNamesIn,
  readJourneyRows,
  readSpecNames,
  specsNamedBy,
  unlocatedSpecsIn,
} from "./helpers/journey-page.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const E2E_ROOT = path.join(CLI_ROOT, "e2e");
const E2E_CONFIG_PATH = path.join(E2E_ROOT, "vitest.config.ts");
const USER_JOURNEYS_PATH = path.join(CLI_ROOT, ".ai-docs", "standards", "e2e", "user-journeys.md");

/** Every spec file the E2E tree holds, whichever suffix it carries. */
const EVERY_E2E_SPEC = "e2e/**/*.test.ts";

/**
 * Every name the From-scratch column carries that no spec answers to, each with the reason it is
 * not one.
 *
 * Stated rather than tolerated. The column names helpers and code symbols alongside specs, and
 * those are legitimate — what is not is a gate deciding that for itself. A reader that quietly
 * dropped whatever it could not resolve is exactly what left six entries unjudged on a page whose
 * whole job is to say what has been proved, so a new name lands here with its reason or it fails.
 */
const RECOGNISED_NON_SPEC_NAMES = [
  // Journey 1: the fixture helper that drives the global eject install for ~30 lifecycle specs. It
  // is the seed those specs share, not a spec of its own, and it has no opening state to read.
  "fixtures/dual-scope-helpers.initGlobalWithEject",
  // Journey 17: the vitest guard the blocked plugin leg is skipped by, named to say why that leg
  // does not run. A code symbol, so there is no file for it to resolve to.
  "skipIf",
];

/**
 * Every spec the `e2e` project collects that no journey names — the page's opening requirement
 * read in the direction nothing else reads it.
 *
 * `user-journeys.md` opens by requiring every spec it collects to belong to a journey, and the
 * three gates above hold it to that from the ROW end: the specs a row names are from scratch, are
 * named with their directory, and are specs at all. All three walk row -> spec, so the page cannot
 * see what it OMITS — and a spec belonging to no row is invisible in exactly the way a row naming
 * no spec is not. It has already cost something: five corrupt-config specs belonged to no journey,
 * which is how a ruling landed on the second reader of `.claude-src/config.ts` with no row whose
 * surfaces anyone re-judged
 * (`agent-findings/2026-08-21-five-specs-covered-a-behaviour-the-coverage-matrix-had-no-row-for.md`).
 *
 * **This is a backlog, not a verdict.** It rosters the population as it stood when the gate landed,
 * because a gate that opens by demanding a hundred and fifty rows is deleted the first time it is
 * inconvenient — the site checker and the from-scratch gate above both introduced themselves this
 * way. What it buys immediately is the NEXT spec: a file added without a journey fails here, and a
 * spec that gains a row has to leave this list in the same commit, so the number can only fall.
 *
 * Re-derive rather than trusting the length of this array — the gate itself prints the difference,
 * and this is the population it is measured against:
 *
 *     find e2e -name '*.e2e.test.ts' | wc -l
 */
const SPECS_BELONGING_TO_NO_JOURNEY: readonly string[] = [
  "commands/build-agent-plugins",
  "commands/compile",
  "commands/compile-edge-cases",
  "commands/compile-global-scope-hint",
  "commands/compile-incomplete-skill-metadata",
  "commands/compile-malformed-skill-metadata",
  "commands/compile-no-skills-refusal",
  "commands/compile-prunes-stale-agents",
  "commands/compile-scope-filtering",
  "commands/compile-warns-scope-dropped-stack-pair",
  "commands/doctor-content",
  "commands/dual-scope",
  "commands/edit-refuses-unusable-local-skill-metadata",
  "commands/eject",
  "commands/eject-default-source-skill-absent",
  "commands/eject-home-config-pair",
  "commands/eject-preserves-exclusive-stack",
  "commands/handed-out-invocations",
  "commands/list",
  "commands/local-skill-invalid-metadata-yaml",
  "commands/plugin-build-versioning",
  "commands/plugin-uninstall-core",
  "commands/plugin-uninstall-edge-cases",
  "commands/relationships",
  "commands/source-flag-is-init-only",
  "commands/uninstall",
  "commands/uninstall-global-propagation",
  "commands/uninstall-manifest-removal",
  "commands/uninstall-marker-sweep",
  "commands/uninstall-preservation",
  "integration/custom-agents",
  "integration/eject-compile",
  "integration/eject-integration",
  "interactive/build-step-category-ordering",
  "interactive/build-step-focus-walk-cost",
  "interactive/build-step-space-confirmation",
  "interactive/confirm-step-info-panel-parity",
  "interactive/confirm-step-mode-change-indicator",
  "interactive/default-sandbox-runs-project-scope",
  "interactive/edit-custom-skill",
  "interactive/edit-eject-migration-reports-copies",
  "interactive/edit-migration-eject-to-plugin-no-marketplace",
  "interactive/edit-plugin-hard-error",
  "interactive/edit-skill-accumulation",
  "interactive/edit-unresolvable-entry-removal-reasons",
  "interactive/edit-wizard-added-skill-source-marker",
  "interactive/edit-wizard-completion",
  "interactive/edit-wizard-detection",
  "interactive/edit-wizard-dual-scope-added-marker",
  "interactive/edit-wizard-dual-scope-collapse-removal-row",
  "interactive/edit-wizard-dual-scope-indicator",
  "interactive/edit-wizard-excluded-skills",
  "interactive/edit-wizard-global-scope-pending-removal-row",
  "interactive/edit-wizard-launch",
  "interactive/edit-wizard-local",
  "interactive/edit-wizard-pending-removal-row",
  "interactive/edit-wizard-plugin-migration",
  "interactive/edit-wizard-plugin-operations",
  "interactive/edit-wizard-unique-skill-guard",
  "interactive/info-panel-scope-toggle-diff",
  "interactive/init-plugin-config-marketplace-source",
  "interactive/init-project-skill-reaching-no-agent",
  "interactive/init-wizard-default-source",
  "interactive/init-wizard-exclusive-compat",
  "interactive/init-wizard-existing",
  "interactive/init-wizard-flags",
  "interactive/init-wizard-interactions",
  "interactive/init-wizard-navigation",
  "interactive/init-wizard-plugin",
  "interactive/init-wizard-scope-split",
  "interactive/init-wizard-scratch",
  "interactive/init-wizard-sources-added-markers",
  "interactive/init-wizard-stack-agents",
  "interactive/init-wizard-stack-banner",
  "interactive/init-wizard-ui",
  "interactive/init-wizard-unreachable-source",
  "interactive/init-wizard-validation-warning",
  "interactive/refusal-lands-before-the-spinner",
  "interactive/scenario-c-init-registers-project",
  "interactive/search-static",
  "interactive/sources-focused-row-marker-spacing",
  "interactive/sources-grid-scope-row-headers",
  "interactive/sources-inert-row-selection-check",
  "interactive/sources-overflow-pending-removal",
  "interactive/uninstall",
  "interactive/wizard-overflow-affordance",
  "interactive/wizard-terminal-resize-guard",
  "lifecycle/agent-scope-toggle-keeps-curation",
  "lifecycle/cancelled-init-blank-global-config",
  "lifecycle/compile-after-scope-change",
  "lifecycle/compile-at-home-propagates-global-hand-edit",
  "lifecycle/config-scope-integrity",
  "lifecycle/cross-scope-lifecycle",
  "lifecycle/doctor-dual-scope",
  "lifecycle/doctor-global-scope-blind-spots",
  "lifecycle/dual-scope-collapse-live-selection",
  "lifecycle/dual-scope-edit-display",
  "lifecycle/dual-scope-edit-integrity",
  "lifecycle/dual-scope-edit-mixed-sources",
  "lifecycle/dual-scope-edit-scope-changes",
  "lifecycle/dual-scope-edit-source-changes",
  "lifecycle/dual-scope-mixed-source-compiled-ref",
  "lifecycle/dual-scope-s-round-trip-space-inert",
  "lifecycle/edit-add-local-skills",
  "lifecycle/edit-deselect-reselect-discards-source-scope",
  "lifecycle/edit-global-fallback",
  "lifecycle/edit-global-propagation-stale-stack-ref",
  "lifecycle/edit-global-remove-dual-scope-partial",
  "lifecycle/edit-plugin-banner-parity",
  "lifecycle/edit-project-scope-last-skill-stack-cleanup",
  "lifecycle/edit-remove-skill-stack-surgical",
  "lifecycle/eject-migration-failure-hard-error",
  "lifecycle/eject-skill-directory-cleanup",
  "lifecycle/empty-scope-dirs-removed",
  "lifecycle/exclusion-lifecycle",
  "lifecycle/global-agent-propagation-type-consistency",
  "lifecycle/global-agent-toggle-guard",
  "lifecycle/global-blank-config-overinstalls-agents",
  "lifecycle/global-fan-out-re-emit-is-byte-stable",
  "lifecycle/global-install-masks-project-owned-exclusive-category",
  "lifecycle/global-install-tombstones-project-owned",
  "lifecycle/global-scope-install-reporting",
  "lifecycle/global-skill-toggle-guard",
  "lifecycle/init-dashboard-edit-plugin-install",
  "lifecycle/init-edit-error-guards",
  "lifecycle/init-global-preselection-confirm",
  "lifecycle/init-plugin-marketplace-fail",
  "lifecycle/init-then-edit-merge",
  "lifecycle/local-lifecycle",
  "lifecycle/plugin-install-failure-hard-error",
  "lifecycle/plugin-lifecycle",
  "lifecycle/plugin-scope-lifecycle",
  "lifecycle/preloaded-preservation",
  "lifecycle/project-config-name-under-global-install",
  "lifecycle/project-edit-global-source-switch-divergence",
  "lifecycle/project-init-global-config-marketplace",
  "lifecycle/project-only-deselect-integrity",
  "lifecycle/project-scope-new-domain-config-types",
  "lifecycle/re-edit-cycles",
  "lifecycle/recompile-summary-honesty",
  "lifecycle/scenario-b-edit-home-preserves-projects",
  "lifecycle/scope-aware-local-copy",
  "lifecycle/scope-change-deselect-integrity",
  "lifecycle/scope-toggle-agent-content",
  "lifecycle/scope-toggle-config-snapshot",
  "lifecycle/scope-toggle-roundtrip",
  "lifecycle/selected-agent-name-excluded",
  "lifecycle/unified-config-view",
  "lifecycle/uninstall-reinit-lifecycle",
];

/**
 * Calls that WRITE the state the run then reads. `user-journeys.md` calls a spec that begins from
 * one a VARIANT: legitimate for covering a branch, never proof the journey is reachable.
 */
const FIXTURE_SEED_CALLS = [
  /\bProjectBuilder\.[A-Za-z]+\s*\(/,
  /\bbuildProjectConfig\s*\(/,
  /\bwriteProjectConfig\s*\(/,
];

/**
 * Calls that drive the real binary into a directory holding nothing — the wizard through a PTY,
 * and the two non-interactive installs. A file carrying one of these has a from-scratch leg
 * however many variant legs sit beside it, which is why the judgement below needs both lists:
 * `commands/share` seeds one of its five specs from a fixture and installs the other four
 * through `init --from`.
 *
 * A closed set, so a FOURTH way to install from nothing makes every spec using it read as a
 * variant and this gate fail. The fix is to add the call shape here, never to reword the row it
 * condemned — a row's marker follows what its specs do, not the other way round.
 */
const FROM_SCRATCH_INSTALLS = [
  /\bInitWizard\.launch[A-Za-z]*\s*\(/,
  /\bCLI\.run\(\s*\[\s*"init"/,
  /\brunInitFrom\s*\(/,
];

/**
 * Every way a verdict can be written so that nothing it measures can make it false, each paired
 * with the same verdict written so the code under it CAN. The pairing is the point: a rule that
 * condemned both halves would just be banning count comparisons, and every spec would learn to
 * write around it. The shape is what is refused, never the subject.
 *
 * `@typescript-eslint/no-unnecessary-condition` is enabled here and sees NONE of them: it judges a
 * condition against its TYPE, and `number >= 0` is a `boolean` whose value the type `number`
 * leaves open. The shape is syntactic, so the rules that close it are too.
 *
 * The first entry is the live one — the shape a hand-run verdict took on 2026-08-18
 * (`after.length >= 0 && before.length >= 0`) while reading as a check on two directory listings.
 * The rest are the same class reached from the other operand order, from a subject other than
 * `.length`, and through self-comparison.
 */
type EscapeShape = {
  /** How the shape reads, phrased to finish "this zone accepts …". */
  name: string;
  /** The rule `eslint.config.js` answers it with. */
  rule: string;
  /** A verdict written in the shape, which every zone must report against. */
  vacuous: string;
  /** The same verdict the code can falsify, which every zone must stay silent about. */
  discriminating: string;
};

const ESCAPE_SHAPES = [
  {
    name: "a length compared against zero",
    rule: "no-restricted-syntax",
    vacuous: `export function verdict(before: string[], after: string[]): boolean {
  return after.length >= 0 && before.length > 0;
}
`,
    discriminating: `export function verdict(before: string[], after: string[]): boolean {
  return after.length > 0 && before.length > 0;
}
`,
  },
  {
    name: "a zero compared against a length",
    rule: "no-restricted-syntax",
    vacuous: `export function verdict(before: string[], after: string[]): boolean {
  return 0 <= after.length && before.length > 0;
}
`,
    discriminating: `export function verdict(before: string[], after: string[]): boolean {
  return 0 < after.length && before.length > 0;
}
`,
  },
  {
    // The widening measured on 2026-08-18. A `Set`'s and a `Map`'s `size` is never negative for
    // the same reason a `length` is not, and the selector reaches it by property NAME, so a
    // domain object's own `size` field is reached too — which is where a false positive would
    // come from. Measured across every workspace before widening: twelve comparisons of a
    // `.size`, `.byteLength` or `.count` against a literal, every one of them discriminating
    // (`> 0`, `=== 0`), and none in the vacuous direction. Nothing existing is condemned, which
    // is what the widening had to show before it could be more than a guess.
    name: "a set's size compared against zero",
    rule: "no-restricted-syntax",
    vacuous: `export function verdict(seen: Set<string>): boolean {
  return seen.size >= 0;
}
`,
    discriminating: `export function verdict(seen: Set<string>): boolean {
  return seen.size > 0;
}
`,
  },
  {
    name: "a value compared against itself",
    rule: "no-self-compare",
    vacuous: `export function verdict(before: string[]): boolean {
  return before.length === before.length;
}
`,
    discriminating: `export function verdict(before: string[]): boolean {
  return before.length === 0;
}
`,
  },
] as const satisfies readonly EscapeShape[];

/** The one shape `packages/eslint-config/base.js` answers, and so the one the shared-base gate needs. */
const SELF_COMPARE_RULE = "no-self-compare";

/** The rules `packages/eslint-config/base.js` states, which every workspace extending it inherits. */
async function sharedBaseConfig(): Promise<Linter.Config[]> {
  // Parse boundary: a plain-`.js` module has no type of its own, so the shape is declared here.
  const shared = (await import(pathToFileURL(SHARED_BASE_CONFIG_PATH).href)) as {
    baseConfig?: Linter.Config[];
  };

  if (shared.baseConfig === undefined) {
    throw new Error(`${SHARED_BASE_CONFIG_PATH} exports no baseConfig — the shared base has moved`);
  }

  return shared.baseConfig;
}

/** The shape a named rule answers for — a rule with none has nothing to be proved against. */
function escapeShapeFor(rule: string): EscapeShape {
  const shape = ESCAPE_SHAPES.find((candidate) => candidate.rule === rule);
  if (shape === undefined) throw new Error(`no escape shape measures '${rule}'`);

  return shape;
}

/**
 * One real file per zone `eslint.config.js` configures `no-restricted-syntax` separately in, and
 * the reason this gate lints more than one file. That rule's options are NOT merged across config
 * blocks — the last block naming it for a file owns all of them, which the config states for
 * `no-restricted-imports` and is equally true here. So a zone that declares the rule for its own
 * reason silently drops every selector it does not restate, and a zone no block declares it for
 * has none at all. Each path must EXIST and be linted by the real config: `lintText` needs a path
 * the TypeScript project service can resolve, and an unresolvable one fails as a parse error
 * rather than as a missing rule.
 */
const LINT_ZONES = [
  // The spec zone, which declares the rule for a reason of its own (task IDs) and so keeps its
  // selectors only by restating them. `TEST_FILES` covers the WHOLE of `e2e/`, not just the
  // `*.test.ts` in it, so this one path stands for every helper, page object and assertion module
  // in the E2E tree — including `four-surfaces.ts`, where the exit-code verdict lived. The first
  // mutation run of this gate is what established that: naming a spec and an e2e helper as two
  // zones left the CLI's own sources unnamed, and every zone below was still green.
  "e2e/assertions/four-surfaces.ts",
  // An ordinary type-checked CLI source: the zone that also carries the config-gate import bans.
  "src/cli/lib/content-validator.ts",
  // The config gate, which every block above excludes — so it inherits nothing.
  "src/cli/lib/config-gate/index.ts",
];

/**
 * What one in-process ESLint pass over one fixture is allowed to take.
 *
 * Measured 2026-08-21 on an idle machine: the escape-shape gate's whole loop runs in ~2.7s across
 * `LINT_ZONES.length * ESCAPE_SHAPES.length * 2` passes, so ~110ms each — every one of them a
 * type-aware lint that resolves the fixture through the TypeScript project service. The budget is
 * ~20x that, and the headroom is the whole point: the gate passed in isolation and on a quiet
 * re-run while failing under a wave with six agents live, which reads to whoever meets it as a
 * regression the change caused rather than as a busy machine.
 */
const LINT_PASS_BUDGET_MS = 2_500;

/**
 * The timeout that gate runs under, DERIVED from the work rather than stated beside it.
 *
 * A zone or a shape added to either array above is more lint passes, and a constant written as a
 * number would go on claiming to be sized for the old loop — the failure would land on whoever
 * added it, under a name that says nothing about them. Raising the suite default instead is the
 * other wrong answer: it would hand the same headroom to every unit test in the package, where a
 * ten-second unit test IS the bug.
 */
const ESCAPE_SHAPE_TIMEOUT_MS = LINT_ZONES.length * ESCAPE_SHAPES.length * 2 * LINT_PASS_BUDGET_MS;

/**
 * The path the shared-base gate lints under. Any `.ts` path does: that gate replaces the config
 * file rather than resolving one, and the shared base is not type-checked, so nothing here has to
 * belong to a TypeScript program the way `LINT_ZONES` do.
 */
const SHARED_BASE_ZONE = "src/cli/lib/content-validator.ts";

/**
 * The shared base itself, reached by path rather than by package specifier.
 *
 * `packages/eslint-config` ships three flat configs as plain `.js` and states in its own manifest
 * that it holds no TypeScript at all — `check-shared-tsconfig.ts` reads exactly that declaration.
 * A `.d.ts` written here so `import { baseConfig } from "@workspace/eslint-config/base"` would
 * type-check turns that declaration false and takes two cross-workspace checks with it. A path
 * import is the same parse boundary `e2eProjects` below uses, for the same reason.
 */
const SHARED_BASE_CONFIG_PATH = path.resolve(CLI_ROOT, "../eslint-config/base.js");

/** One gate: a named vitest project, and the specs its `include` claims. */
type SuiteProject = { test: { name: string; include: string[] } };

/**
 * The projects `e2e/vitest.config.ts` declares, loaded rather than restated — a second copy of
 * the include globs here could not tell a config that stopped matching a file from one that
 * never did.
 */
async function e2eProjects(): Promise<SuiteProject[]> {
  // Parse boundary: vitest's own config type admits far more than the shape a gate must declare.
  const configModule = (await import(pathToFileURL(E2E_CONFIG_PATH).href)) as {
    default: { test?: { projects?: SuiteProject[] } };
  };
  const projects = configModule.default.test?.projects;
  if (!projects) {
    throw new Error("e2e/vitest.config.ts declares no projects — a gate must name what it runs");
  }
  return projects;
}

/**
 * The journey rows `user-journeys.md` carries, read against the specs the tree actually holds.
 *
 * Both halves come off disk. The page is not restated here — a second copy of the From-scratch
 * column would agree with itself whatever the page went on to say — and neither is the spec list
 * it is judged against. The reading itself lives in `helpers/journey-page.ts`, with its own tests:
 * a markdown-table parser is the kind of thing that has to be proved before it can be believed,
 * and one inlined here was trusted for months while it silently declined to judge six entries.
 */
async function journeyRows(): Promise<JourneyRow[]> {
  return readJourneyRows(await readFile(USER_JOURNEYS_PATH, "utf8"), readSpecNames(E2E_ROOT));
}

/**
 * Whether the page names `spec` anywhere on it — a From-scratch cell, a Status cell's prose, one
 * of journey 38's legs, or the withdrawn table's Specs column. All four are the page claiming the
 * spec, and a reading restricted to the From-scratch column would file the five documented
 * corrupt-config variants as belonging to nothing.
 *
 * A membership test rather than a reader: it picks nothing out of the page, which is why it does
 * not need tests of its own the way `journey-page.ts` does. Both accepted forms END at a backtick,
 * and that is the whole of the care needed — a plain substring scan reports `commands/compile`,
 * `commands/doctor` and `commands/uninstall` as claimed, on mentions of `commands/compile-…`,
 * `commands/doctor-diagnostics` and `commands/uninstall-corrupt-config`. All three are the shortest
 * name in their family, which is the shape this fails on and the shape a spec directory fills up
 * with.
 */
function namedOnJourneyPage(page: string, spec: string): boolean {
  return page.includes(`\`${spec}\``) || page.includes(`${spec}${SPEC_SUFFIX}\``);
}

/** The source of a spec the page names. The reader has already proved a file answers to it. */
async function readNamedSpec(named: string): Promise<string> {
  return readFile(path.join(E2E_ROOT, `${named}${SPEC_SUFFIX}`), "utf8");
}

/** Whether every spec this row names is a variant, which is what leaves it with no proof. */
async function namesOnlyVariants(row: JourneyRow): Promise<boolean> {
  const sources = await Promise.all(specsNamedBy(row).map(readNamedSpec));
  return sources.every(holdsOnlyVariants);
}

/**
 * Whether every leg this file holds begins from a fixture-written config. Both halves are read:
 * a file that seeds a config somewhere AND installs from nothing somewhere else still carries
 * the from-scratch proof the column claims for it.
 */
function holdsOnlyVariants(source: string): boolean {
  const seeds = FIXTURE_SEED_CALLS.some((call) => call.test(source));
  const installsFromNothing = FROM_SCRATCH_INSTALLS.some((call) => call.test(source));
  return seeds && !installsFromNothing;
}

/**
 * The rules the repository's own ESLint config reports against `source` when it is read as
 * `zone`. The config is LOADED rather than restated — a second copy of the selectors here could
 * not tell a rule that stopped matching from one that was never configured.
 *
 * A fixture that failed to parse asked nothing, so it is thrown on rather than counted: a parse
 * failure produces a `fatal` message with a null `ruleId`, and judging on "eslint said
 * something" would hold for it exactly as `exitCode !== 0` held for a narrowing probe that never
 * type-checked an assignment.
 */
async function rulesReportedAgainst(
  eslint: ESLint,
  source: string,
  zone: string,
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: path.join(CLI_ROOT, zone) });
  if (result === undefined) throw new Error(`eslint returned no verdict at all for '${zone}'`);

  const unparseable = result.messages.filter((message) => message.fatal);
  if (unparseable.length > 0) {
    const reasons = unparseable.map((message) => message.message).join("; ");
    throw new Error(`the fixture did not parse as '${zone}', so it asked nothing: ${reasons}`);
  }

  return result.messages
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

async function packageScripts(): Promise<string[]> {
  const manifest = JSON.parse(await readFile(path.join(CLI_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return Object.values(manifest.scripts);
}

/**
 * Every way a spec is turned off from inside the file rather than by a machine it cannot run on.
 *
 * `describe.skipIf(cond)` states a condition and is legitimate — most of this suite is skipped
 * without the Claude CLI, and a run says so. An UNCONDITIONAL `.skip` runs nowhere, and vitest's
 * skipped tally is already full of the conditional kind, so no number in a run tells the two
 * apart. `it.todo` is deliberately absent: it has no body, so nothing about it can be mistaken
 * for coverage, and vitest counts todos separately.
 *
 * The trailing `(` is what discriminates: `describe.skipIf(` contains `describe.skip` and must
 * not be reported.
 */
const UNCONDITIONAL_SKIP_FORMS = ["describe.skip(", "it.skip(", "test.skip("];

/** The spec's path when it is turned off in its own file, else null. */
async function specTurnedOffInItsOwnFile(spec: string): Promise<string | null> {
  const source = await readFile(path.join(CLI_ROOT, spec), "utf8");
  return UNCONDITIONAL_SKIP_FORMS.some((form) => source.includes(form)) ? spec : null;
}

/**
 * A spec file no configured suite collects is a file nobody has ever run, and nothing about it
 * fails: `e2e/smoke/` sat outside every `include` for months, accumulating a fixture the Claude
 * CLI rejected and assertions that could not see it. All three halves are asserted, because each
 * alone is satisfiable by doing nothing — a config that claims a file no script hands to vitest
 * is as unrun as a file no config claims, and a file both of them reach is as unrun as either
 * when its own `describe` is skipped.
 *
 * The third is the one that shipped a hole here. A propagation spec's only route to the defect it
 * covered was a bulk hotkey; the hotkey was withdrawn, the fixture could no longer reach the
 * defect, and the file went `describe.skip` — where it read exactly like a passing file for as
 * long as nobody opened it.
 */
describe("every spec the repository holds belongs to a gate", () => {
  it("collects every spec file under e2e/ from one of the configured projects", async () => {
    const projects = await e2eProjects();

    const claimed = await fg(
      projects.flatMap((project) => project.test.include),
      { cwd: CLI_ROOT },
    );
    const present = await fg(EVERY_E2E_SPEC, { cwd: CLI_ROOT });

    expect(claimed.sort(), "a spec no project's include claims is run by nothing").toStrictEqual(
      present.sort(),
    );
  });

  it("hands every configured project to vitest from a package script", async () => {
    const projects = await e2eProjects();
    const scripts = (await packageScripts()).join("\n");

    for (const project of projects) {
      expect(scripts, `the '${project.test.name}' project is a gate no script opens`).toContain(
        `--project ${project.test.name}`,
      );
    }
  });

  it("runs every spec it collects, rather than one being turned off in its own file", async () => {
    const specs = await fg(EVERY_E2E_SPEC, { cwd: CLI_ROOT });
    const turnedOff = await Promise.all(specs.map(specTurnedOffInItsOwnFile));

    expect(
      turnedOff.filter((spec) => spec !== null),
      "a spec skipped unconditionally is collected, counted as skipped, and proves nothing",
    ).toStrictEqual([]);
  });
});

/**
 * The precondition every gate below rests on, and the one nothing held.
 *
 * All three of them walk row → spec, so a row the reader never returned is judged by none of them —
 * and there is no red anywhere to say so, because a page whose entries are skipped reads exactly
 * like a page whose entries all passed. That is the failure `journey-page.ts` was written to end,
 * and it ended only the NAME half: a row still had to come out five cells wide, and one unescaped
 * `|` inside a code span is enough that it does not. It has already happened here — row 11 wrote
 * `GlobalAgentName | "…"` in its Status cell, markdown made six cells of it, the reader dropped it,
 * and the six specs it names were the only proof six journeys had.
 *
 * The two readings are compared by MEMBERS rather than by length, because a page that gained a row
 * while losing another is a page where nothing changed at all.
 */
describe("the reader sees every row the journey tables number", () => {
  it("reads every numbered row, rather than dropping one whose cells came out wrong", async () => {
    const page = await readFile(USER_JOURNEYS_PATH, "utf8");
    // The reader refuses a page it parsed nothing out of, which is this comparison's subject guard:
    // two empty readings would agree with each other about a page neither of them read.
    const read = (await journeyRows()).map((row) => row.number);

    expect(
      journeyNumbersIn(page),
      "a journey table numbers a row the reader cannot see, so every gate below skips it in silence — the usual cause is an unescaped '|' inside a code span, which markdown splits into an extra cell",
    ).toStrictEqual(read);
  });
});

/**
 * The third gate of the same shape. The two above prove a spec is claimed by a project and a
 * project by a script; this one proves a spec a journey names as its from-scratch proof is one.
 *
 * Nothing else can. `user-journeys.md` defines a spec that begins from a fixture-written config
 * as a VARIANT and a row with no from-scratch spec as TO TEST, and both were prose: journey 9
 * named three specs that each open with `ProjectBuilder.editable` or `buildProjectConfig` +
 * `writeProjectConfig`, and read as PARTIAL awaiting one more assertion surface — strengthening
 * any of the three would have closed nothing.
 */
describe("a journey names from-scratch specs that are from scratch", () => {
  it("marks a row TO TEST when every spec it names begins from a fixture-written config", async () => {
    const rows = await journeyRows();
    const naming = rows.filter((row) => specsNamedBy(row).length > 0);

    // The subject guard the reader cannot carry for this one: it refuses a page it failed to parse
    // at all, but a page it read whose rows name no spec would leave the judgement below vacuous.
    expect(
      naming.length,
      "no journey row names a spec — the From-scratch column has stopped being read",
    ).toBeGreaterThan(0);

    const judged = await Promise.all(
      naming.map(async (row) => ({ row, onlyVariants: await namesOnlyVariants(row) })),
    );

    const misclaimed = judged
      .filter(({ row, onlyVariants }) => onlyVariants && !row.marker.startsWith(TO_TEST_MARKER))
      .map(({ row }) => `${row.number} (${row.marker})`);

    expect(
      misclaimed,
      "a row whose every named spec begins from a fixture has no from-scratch proof, which the coverage vocabulary calls TO TEST",
    ).toStrictEqual([]);
  });

  /**
   * Half of the hole this gate carried for as long as it read the page inline. Five specs were
   * named without the directory they live in, the reader skipped whatever it could not resolve,
   * and a skipped row reads exactly like a passing one — so the page looked fully checked while
   * nothing had judged those five. A name is only proof if a run can be pointed at it.
   */
  it("names every spec with the directory it lives in", async () => {
    const rows = await journeyRows();
    const rewrites = rows
      .flatMap((row) => row.references)
      .filter((reference) => reference.kind === "unlocated-spec")
      .map((reference) => `'${reference.name}' should read '${reference.livesAt}'`);

    expect(
      unlocatedSpecsIn(rows),
      `the From-scratch column names a spec without its directory, which no run can be pointed at: ${rewrites.join("; ")}`,
    ).toStrictEqual([]);
  });

  /**
   * The other half. Not everything the column names is a spec, and the two that are not are both
   * legitimate — but a gate that decides that for itself decides it for every future entry too.
   * Naming them makes the next unrecognised one fail here and be justified, rather than dropped.
   */
  it("names nothing outside a spec that this gate has not been told about", async () => {
    const rows = await journeyRows();

    expect(
      nonSpecNamesIn(rows),
      "the From-scratch column names something no spec answers to — give it the spec it meant, or add it to RECOGNISED_NON_SPEC_NAMES with the reason it is not one",
    ).toStrictEqual(RECOGNISED_NON_SPEC_NAMES);
  });
});

/**
 * The same requirement read spec -> row, which is the direction the three gates above cannot see.
 *
 * They ask whether the specs a row NAMES are proof; this asks whether a spec is named at all. The
 * page opens on that requirement — "every spec the `e2e` project collects belongs to a journey on
 * this page" — and until now nothing held it, so the matrix could not report its own omissions.
 */
describe("every spec the e2e project collects belongs to a journey", () => {
  it("names every spec on the page, bar the backlog rostered when this gate landed", async () => {
    const page = await readFile(USER_JOURNEYS_PATH, "utf8");
    const specs = readSpecNames(E2E_ROOT);
    const claimed = specs.filter((spec) => namedOnJourneyPage(page, spec));

    // The subject guard for the roster below: a page that stopped being readable claims nothing,
    // and every spec would arrive as unclaimed — a diff of a hundred and fifty names that says
    // nothing about the one thing that actually broke.
    expect(
      claimed.length,
      "the page names no spec at all — it has been restructured out from under this gate",
    ).toBeGreaterThan(0);

    expect(
      specs.filter((spec) => !namedOnJourneyPage(page, spec)),
      "a spec belongs to no journey — give it a row, or add it to SPECS_BELONGING_TO_NO_JOURNEY, which may only shrink",
    ).toStrictEqual(SPECS_BELONGING_TO_NO_JOURNEY);
  });
});

/**
 * The fourth gate, and the one that answers for the other three. A check is trusted because it
 * has been seen to go red for the reason it names; a check nobody has watched fail is
 * indistinguishable from a check that cannot. Two live instances in two days, both caught by
 * mutation and by nothing else: a narrowing probe whose `exitCode !== 0` verdict held on a SYNTAX
 * error, and a hand-run verdict reading `after.length >= 0 && before.length >= 0`.
 *
 * Only the second is a shape a linter can see, and `eslint.config.js` now refuses it. That rule
 * reports nothing across this repository, which is the whole problem with leaving it there
 * unattended — so this gate is its mutation proof, kept rather than performed once: it feeds the
 * config the shape and requires a report, and feeds it the discriminating form and requires
 * silence.
 */
describe("a verdict that cannot fail is refused before it is trusted", () => {
  it(
    "reports every escape shape, and no discriminating form, in each separately-ruled zone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT });

      for (const zone of LINT_ZONES) {
        for (const shape of ESCAPE_SHAPES) {
          const againstVacuous = await rulesReportedAgainst(eslint, shape.vacuous, zone);
          const againstDiscriminating = await rulesReportedAgainst(
            eslint,
            shape.discriminating,
            zone,
          );

          // The positive half is the subject guard for the negative one: without it, a zone eslint
          // declined to lint at all would satisfy the negative for free.
          expect(
            againstVacuous,
            `'${zone}' accepts ${shape.name} — '${shape.rule}' does not reach this zone`,
          ).toContain(shape.rule);
          expect(
            againstDiscriminating,
            `'${zone}' reports '${shape.rule}' against ${shape.name} the code CAN falsify — the rule has outgrown the shape`,
          ).not.toContain(shape.rule);
        }
      }
    },
    ESCAPE_SHAPE_TIMEOUT_MS,
  );
});

/**
 * The fifth gate, and the one that says where the fourth's rules live. `no-self-compare` is core
 * ESLint, sits outside `js.configs.recommended`, and `x === x` is not a mistake this package has
 * any special claim on — it was enabled here alone, so every other workspace in the repository
 * accepted the shape.
 *
 * This lints with the SHARED base and nothing else, which is the only way to tell a rule the base
 * carries from one this package adds on top: the gate above runs the real config, where the two are
 * indistinguishable. A workspace that extends the base and states no rules of its own gets exactly
 * what this asserts.
 */
describe("the shared base config refuses a value compared against itself", () => {
  it("reports no-self-compare under @workspace/eslint-config/base alone", async () => {
    const eslint = new ESLint({
      cwd: CLI_ROOT,
      overrideConfigFile: true,
      overrideConfig: await sharedBaseConfig(),
    });
    const { vacuous, discriminating } = escapeShapeFor(SELF_COMPARE_RULE);

    const againstVacuous = await rulesReportedAgainst(eslint, vacuous, SHARED_BASE_ZONE);
    const againstDiscriminating = await rulesReportedAgainst(
      eslint,
      discriminating,
      SHARED_BASE_ZONE,
    );

    expect(
      againstVacuous,
      "the shared base accepts a value compared against itself, so every workspace extending it does too",
    ).toContain(SELF_COMPARE_RULE);
    expect(
      againstDiscriminating,
      `the shared base reports ${SELF_COMPARE_RULE} against a comparison the code can falsify`,
    ).not.toContain(SELF_COMPARE_RULE);
  });
});
