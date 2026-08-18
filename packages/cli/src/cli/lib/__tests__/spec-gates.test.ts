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
 * A spec file no configured suite collects is a file nobody has ever run, and nothing about it
 * fails: `e2e/smoke/` sat outside every `include` for months, accumulating a fixture the Claude
 * CLI rejected and assertions that could not see it. Both halves are asserted, because either
 * alone is satisfiable by doing nothing — a config that claims a file no script hands to vitest
 * is as unrun as a file no config claims.
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
  it("reports every escape shape, and no discriminating form, in each separately-ruled zone", async () => {
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
  });
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
