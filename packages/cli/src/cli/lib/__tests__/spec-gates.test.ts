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
import { type LintZone, flatConfigAt, lintZonesIn } from "./helpers/lint-zones.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const E2E_ROOT = path.join(CLI_ROOT, "e2e");
const E2E_CONFIG_PATH = path.join(E2E_ROOT, "vitest.config.ts");
const USER_JOURNEYS_PATH = path.join(CLI_ROOT, ".ai-docs", "standards", "e2e", "user-journeys.md");

const EVERY_E2E_SPEC = "e2e/**/*.test.ts";

/** From-scratch names that are not specs, each with its reason, so a new one cannot slip by. */
const RECOGNISED_NON_SPEC_NAMES = [
  // Journey 17: the vitest guard the blocked plugin leg is skipped by; a symbol, not a file.
  "skipIf",
];

/**
 * Specs no journey names: the spec -> row direction the row gates cannot see. A backlog that may
 * only shrink: a new spec without a journey fails, and a spec gaining a row must leave the list.
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
  "commands/init-from-mixed-scope-config-split",
  "commands/init-project-skill-reaching-no-agent",
  "commands/list",
  "commands/local-skill-invalid-metadata-yaml",
  "commands/plugin-build-versioning",
  "commands/plugin-uninstall-core",
  "commands/plugin-uninstall-edge-cases",
  "commands/relationships",
  "commands/search-static",
  "commands/source-flag-is-init-only",
  "commands/uninstall",
  "commands/uninstall-global-propagation",
  "commands/uninstall-manifest-removal",
  "commands/uninstall-marker-sweep",
  "commands/uninstall-preservation",
  "integration/custom-agents",
  "integration/eject-compile",
  "integration/eject-integration",
  "interactive/edit-eject-migration-reports-copies",
  "interactive/edit-from-plugin-migration",
  "interactive/edit-from-plugin-operations",
  "interactive/edit-migration-eject-to-plugin-no-marketplace",
  "interactive/edit-plugin-hard-error",
  "interactive/refusal-lands-before-the-spinner",
  "interactive/uninstall",
  "interactive/uninstall-below-the-minimum-terminal-size",
  "lifecycle/compile-after-scope-change",
  "lifecycle/compile-at-home-propagates-global-hand-edit",
  "lifecycle/config-scope-integrity",
  "lifecycle/doctor-dual-scope",
  "lifecycle/doctor-global-scope-blind-spots",
  "lifecycle/dual-scope-edit-integrity",
  "lifecycle/dual-scope-edit-mixed-sources",
  "lifecycle/dual-scope-mixed-source-compiled-ref",
  "lifecycle/edit-add-local-skills",
  "lifecycle/edit-from-plugin-install",
  "lifecycle/edit-global-fallback",
  "lifecycle/edit-global-propagation-stale-stack-ref",
  "lifecycle/edit-global-remove-dual-scope-partial",
  "lifecycle/edit-plugin-banner-parity",
  "lifecycle/edit-project-scope-last-skill-stack-cleanup",
  "lifecycle/edit-remove-skill-stack-surgical",
  "lifecycle/eject-migration-failure-hard-error",
  "lifecycle/empty-scope-dirs-removed",
  "lifecycle/global-agent-propagation-type-consistency",
  "lifecycle/global-blank-config-overinstalls-agents",
  "lifecycle/global-fan-out-re-emit-is-byte-stable",
  "lifecycle/global-install-masks-project-owned-exclusive-category",
  "lifecycle/global-install-tombstones-project-owned",
  "lifecycle/global-scope-install-reporting",
  "lifecycle/init-edit-error-guards",
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
  "lifecycle/scenario-c-init-registers-project",
  "lifecycle/scope-aware-local-copy",
  "lifecycle/scope-change-deselect-integrity",
  "lifecycle/scope-toggle-agent-content",
  "lifecycle/scope-toggle-config-snapshot",
  "lifecycle/scope-toggle-roundtrip",
  "lifecycle/selected-agent-name-excluded",
  "lifecycle/unified-config-view",
  "lifecycle/uninstall-reinit-lifecycle",
];

/** Calls that write the state the run reads: a spec beginning from one is a variant. */
const FIXTURE_SEED_CALLS = [
  /\bProjectBuilder\.[A-Za-z]+\s*\(/,
  /\bbuildProjectConfig\s*\(/,
  /\bwriteProjectConfig\s*\(/,
];

/**
 * Calls that drive the binary into an empty directory; one is a from-scratch leg. A closed set: a
 * new install route makes its specs read as variants until the call shape is added here.
 */
const FROM_SCRATCH_INSTALLS = [
  /\bCLI\.run\(\s*\[\s*"init"/,
  /\bnew InteractivePrompt\(\s*\[\s*"init"/,
  /\brunInitFrom[A-Za-z]*\s*\(/,
  /\binstallFromSeed\s*\(/,
  /\binstallE2EStack[A-Za-z]*\s*\(/,
  /\binstallDualScopeStack\s*\(/,
  /\bcreate[A-Za-z]*EnvFromSeed\s*\(/,
];

/**
 * Each vacuous verdict shape paired with its falsifiable twin, so only the shape is refused.
 * `no-unnecessary-condition` sees none of them: `number >= 0` is a `boolean` to the type checker.
 */
type EscapeShape = {
  name: string;
  rule: string;
  vacuous: string;
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
    // `.size` is reached by property name; no existing comparison is in the vacuous direction.
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

/** The one shape the shared base answers. */
const SELF_COMPARE_RULE = "no-self-compare";

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

function escapeShapeFor(rule: string): EscapeShape {
  const shape = ESCAPE_SHAPES.find((candidate) => candidate.rule === rule);
  if (shape === undefined) throw new Error(`no escape shape measures '${rule}'`);

  return shape;
}

/** Handed to both the zone derivation and the linter, so the two cannot read different configs. */
const ESLINT_CONFIG_PATH = path.join(CLI_ROOT, "eslint.config.js");

/** Its options do not merge across blocks. */
const ZONED_RULE = "no-restricted-syntax";

/**
 * One real file per zone that configures `no-restricted-syntax`, derived from the config: options
 * don't merge, so each zone must be linted. `lint-zones.ts` picks a file no later block also owns,
 * and only files on disk, since `lintText` needs a path the project service can resolve.
 */
const LINT_ZONES = lintZonesIn(await flatConfigAt(ESLINT_CONFIG_PATH), ZONED_RULE, CLI_ROOT);

function isMeasurable(zone: LintZone): zone is LintZone & { subject: string } {
  return zone.subject !== null;
}

/** Per type-aware pass; the timeout multiplies it by the derived pass count, with headroom. */
const LINT_PASS_BUDGET_MS = 2_500;

/** Derived from the work, so new shapes or zones grow it; a suite default would hide slow units. */
const ESCAPE_SHAPE_TIMEOUT_MS = LINT_ZONES.length * ESCAPE_SHAPES.length * 2 * LINT_PASS_BUDGET_MS;

/** Any `.ts` path: the shared-base gate replaces the config file and type-checks nothing. */
const SHARED_BASE_ZONE = "src/cli/lib/content-validator.ts";

/** By path: `packages/eslint-config` declares no TypeScript, so it ships no `.d.ts`. */
const SHARED_BASE_CONFIG_PATH = path.resolve(CLI_ROOT, "../eslint-config/base.js");

type SuiteProject = { test: { name: string; include: string[] } };

/** Loaded rather than restated, so a config that stopped matching a file is seen. */
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

/** The page and the spec list both come off disk; parsing lives in `helpers/journey-page.ts`. */
async function journeyRows(): Promise<JourneyRow[]> {
  return readJourneyRows(await readFile(USER_JOURNEYS_PATH, "utf8"), readSpecNames(E2E_ROOT));
}

/**
 * Whether the page names `spec` anywhere. Both accepted forms end at a backtick, so a family's
 * shortest name (`commands/compile`) is not claimed by `commands/compile-…`.
 */
function namedOnJourneyPage(page: string, spec: string): boolean {
  return page.includes(`\`${spec}\``) || page.includes(`${spec}${SPEC_SUFFIX}\``);
}

async function readNamedSpec(named: string): Promise<string> {
  return readFile(path.join(E2E_ROOT, `${named}${SPEC_SUFFIX}`), "utf8");
}

async function namesOnlyVariants(row: JourneyRow): Promise<boolean> {
  const sources = await Promise.all(specsNamedBy(row).map(readNamedSpec));
  return sources.every(holdsOnlyVariants);
}

/** A file that also installs from nothing is not a variant; one installing nothing is neither. */
function holdsOnlyVariants(source: string): boolean {
  if (installsNothing(source)) return false;

  const seeds = FIXTURE_SEED_CALLS.some((call) => call.test(source));
  const installsFromNothing = FROM_SCRATCH_INSTALLS.some((call) => call.test(source));
  return seeds && !installsFromNothing;
}

/** The subject is output; a file with any install leg is judged by the rules above instead. */
function installsNothing(source: string): boolean {
  return !INSTALLING_CALLS.some((call) => call.test(source));
}

/** A superset of {@link FROM_SCRATCH_INSTALLS}, kept beside it so the two cannot drift. */
const INSTALLING_CALLS = [
  ...FROM_SCRATCH_INSTALLS,
  /\bCLI\.run\(\s*\[\s*"(edit|compile|update|uninstall|eject)"/,
  /\bnew InteractivePrompt\(\s*\[\s*"edit"/,
  /\brunEditFrom\s*\(/,
  /\bapplyFromSeed\s*\(/,
  /\bapplyEditFrom\s*\(/,
];

/**
 * The repository's own config, loaded rather than restated. A parse failure (a `fatal` message
 * with null `ruleId`) throws rather than counting as a report.
 */
async function rulesReportedAgainst(
  eslint: ESLint,
  source: string,
  subject: string,
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: path.join(CLI_ROOT, subject) });
  if (result === undefined) throw new Error(`eslint returned no verdict at all for '${subject}'`);

  const unparseable = result.messages.filter((message) => message.fatal);
  if (unparseable.length > 0) {
    const reasons = unparseable.map((message) => message.message).join("; ");
    throw new Error(`the fixture did not parse as '${subject}', so it asked nothing: ${reasons}`);
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
 * Unconditional skips only: `skipIf` states a condition and `it.todo` has no body. The trailing
 * `(` keeps `describe.skipIf(` from matching.
 */
const UNCONDITIONAL_SKIP_FORMS = ["describe.skip(", "it.skip(", "test.skip("];

async function specTurnedOffInItsOwnFile(spec: string): Promise<string | null> {
  const source = await readFile(path.join(CLI_ROOT, spec), "utf8");
  return UNCONDITIONAL_SKIP_FORMS.some((form) => source.includes(form)) ? spec : null;
}

/**
 * A spec no suite collects, no script runs, or that skips itself is never run, and each alone
 * fails nothing; all three are asserted.
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
 * Every row the tables number must come out of the reader: a dropped row (e.g. an unescaped `|` in
 * a code span) is judged by no gate. Compared by members, not length.
 */
describe("the reader sees every row the journey tables number", () => {
  it("reads every numbered row, rather than dropping one whose cells came out wrong", async () => {
    const page = await readFile(USER_JOURNEYS_PATH, "utf8");
    // The reader refuses a page it parsed nothing out of: this comparison's subject guard.
    const read = (await journeyRows()).map((row) => row.number);

    expect(
      journeyNumbersIn(page),
      "a journey table numbers a row the reader cannot see, so every gate below skips it in silence — the usual cause is an unescaped '|' inside a code span, which markdown splits into an extra cell",
    ).toStrictEqual(read);
  });
});

/** A spec a journey names as its from-scratch proof must be one, not a variant. */
describe("the from-scratch classifier has a word for each shape a spec takes", () => {
  // Source fragments, not real spec files: the subject is the classifier's vocabulary.
  const SEEDS_AND_NEVER_INSTALLS = `
    await writeProjectConfig(dir, { name: "x" });
    const { stdout } = await CLI.run(["doctor"], { dir });
    expect(stdout).toContain("Checking");
  `;
  const SEEDS_THEN_INSTALLS_FROM_NOTHING = `
    await writeProjectConfig(dir, { name: "x" });
    await CLI.run(["init", "--from", id], { dir: other });
  `;
  const SEEDS_AND_EDITS_ONLY = `
    await writeProjectConfig(dir, { name: "x" });
    await CLI.run(["edit", "--from", id], { dir });
  `;

  it("does not call a spec that installs nothing a variant, however it seeded its config", () => {
    expect(holdsOnlyVariants(SEEDS_AND_NEVER_INSTALLS)).toBe(false);
  });

  it("still reads a from-scratch install beside a seeded config as from scratch", () => {
    expect(holdsOnlyVariants(SEEDS_THEN_INSTALLS_FROM_NOTHING)).toBe(false);
  });

  // The discriminating case: otherwise an always-`false` classifier would pass.
  it("still calls a spec that seeds a config and only edits it a variant", () => {
    expect(holdsOnlyVariants(SEEDS_AND_EDITS_ONLY)).toBe(true);
  });
});

describe("a journey names from-scratch specs that are from scratch", () => {
  it("marks a row TO TEST when every spec it names begins from a fixture-written config", async () => {
    const rows = await journeyRows();
    const naming = rows.filter((row) => specsNamedBy(row).length > 0);

    // Subject guard: rows naming no spec would leave the judgement below vacuous.
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

  /** A name is only proof if a run can be pointed at it. */
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

  /** Non-spec names are rostered so the next unrecognised one must be justified. */
  it("names nothing outside a spec that this gate has not been told about", async () => {
    const rows = await journeyRows();

    expect(
      nonSpecNamesIn(rows),
      "the From-scratch column names something no spec answers to — give it the spec it meant, or add it to RECOGNISED_NON_SPEC_NAMES with the reason it is not one",
    ).toStrictEqual(RECOGNISED_NON_SPEC_NAMES);
  });
});

/** Spec -> row: whether a spec is named at all, which the row gates cannot see. */
describe("every spec the e2e project collects belongs to a journey", () => {
  it("names every spec on the page, bar the backlog rostered when this gate landed", async () => {
    const page = await readFile(USER_JOURNEYS_PATH, "utf8");
    const specs = readSpecNames(E2E_ROOT);
    const claimed = specs.filter((spec) => namedOnJourneyPage(page, spec));

    // Subject guard: an unreadable page would report every spec as unclaimed.
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
 * The mutation proof for the lint rule refusing vacuous verdicts: each shape must report and each
 * discriminating twin must stay silent, in every zone.
 */
describe("a verdict that cannot fail is refused before it is trusted", () => {
  /** A zone with no file to lint reads exactly like a zone that passed. */
  it("finds a file to lint in every zone the config declares the rule for", () => {
    expect(
      LINT_ZONES.filter((zone) => !isMeasurable(zone)).map((zone) => zone.patterns),
      `eslint.config.js declares '${ZONED_RULE}' for a zone holding no file of its own, so nothing can be linted as it — narrow the block to files that exist, or delete it`,
    ).toStrictEqual([]);
  });

  it(
    "reports every escape shape, and no discriminating form, in each separately-ruled zone",
    async () => {
      const eslint = new ESLint({ cwd: CLI_ROOT, overrideConfigFile: ESLINT_CONFIG_PATH });

      for (const { patterns, subject } of LINT_ZONES.filter(isMeasurable)) {
        for (const shape of ESCAPE_SHAPES) {
          const againstVacuous = await rulesReportedAgainst(eslint, shape.vacuous, subject);
          const againstDiscriminating = await rulesReportedAgainst(
            eslint,
            shape.discriminating,
            subject,
          );

          // The positive half guards the negative: an unlinted zone would satisfy it for free.
          expect(
            againstVacuous,
            `the zone eslint.config.js declares for '${patterns}' accepts ${shape.name} — '${shape.rule}' does not reach it, measured on '${subject}'`,
          ).toContain(shape.rule);
          expect(
            againstDiscriminating,
            `the zone eslint.config.js declares for '${patterns}' reports '${shape.rule}' against ${shape.name} the code CAN falsify — the rule has outgrown the shape, measured on '${subject}'`,
          ).not.toContain(shape.rule);
        }
      }
    },
    ESCAPE_SHAPE_TIMEOUT_MS,
  );
});

/**
 * `no-self-compare` lives in the shared base so every workspace inherits it; linted with the base
 * alone, the only way to tell its rules from this package's additions.
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

/**
 * `ensureBinaryExists` is asked once per spec file from `e2e/setup.ts`'s `beforeAll`, so a spec
 * calling it is redundant and lets the per-file discipline grow back.
 */
describe("the dist door is the harness's, not each spec's", () => {
  const GUARD = "ensureBinaryExists";

  it("is registered once, for every spec file, in e2e/setup.ts", async () => {
    const setup = await readFile(path.join(E2E_ROOT, "setup.ts"), "utf8");

    expect(
      setup,
      "the door has to be somewhere, and this is the only place that covers every file",
    ).toContain("beforeAll");
    expect(setup).toContain("assertDistIsPresent");
  });

  it("is called by no spec, because calling it is now redundant", async () => {
    const specs = readSpecNames(E2E_ROOT);
    const callers = [];
    for (const spec of specs) {
      const body = await readNamedSpec(spec);
      if (body.includes(GUARD)) callers.push(spec);
    }

    expect(
      callers,
      `${GUARD} runs for every spec file from e2e/setup.ts — a spec calling it again is the per-file discipline growing back`,
    ).toStrictEqual([]);
  });

  /**
   * Only `afterAll` sees a `dist/` emptied during a spec's own `beforeAll`: a throwing `beforeAll`
   * skips every `beforeEach`, but a setup file's `afterAll` still runs and reports the real cause.
   */
  it("also stands at afterAll, the one position a throwing beforeAll cannot skip", async () => {
    const setup = await readFile(path.join(E2E_ROOT, "setup.ts"), "utf8");

    expect(
      setup,
      "a dist replacement during a spec's own beforeAll is invisible to beforeEach and afterEach, and only afterAll still runs to report it",
    ).toContain("afterAll(assertDistUnchanged)");
  });
});
