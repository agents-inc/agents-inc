import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESLint, type Linter } from "eslint";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

/** A floor, not a census: a glob matching nothing would report a clean roster. */
const SPECS_THE_TREE_HOLDS = 300;

/** Stated, not read from `todo/`, which does not ship: a derived roster would be blind there. */
const TRACKER_ID_PREFIXES = ["cli", "d", "p4", "skills"] as const;

/** Anchored at hyphens, so `dual-scope` or `cli-runner` (no number) are left alone. */
const TRACKER_ID_RUN = new RegExp(`(^|-)(${TRACKER_ID_PREFIXES.join("|")})-?\\d+(-|$)`);

function specStem(specPath: string): string {
  return path.basename(specPath).replace(/\.(?:e2e\.|smoke\.)?test\.tsx?$/, "");
}

function namesATask(specPath: string): boolean {
  return TRACKER_ID_RUN.test(specStem(specPath));
}

/** The leave-alone half is the subject guard: an always-`false` recogniser passes the roster. */
const NAMES_A_TASK = [
  "src/cli/stores/d227-same-scope-tombstone-duplicate.test.ts",
  "src/cli/lib/cli-551-filenames.test.ts",
  "e2e/lifecycle/p4-17-multiple-items.e2e.test.ts",
  "e2e/commands/skills-01-adapters.e2e.test.ts",
  "src/cli/lib/d-62-meta-skills.test.ts",
];

const NAMES_A_BEHAVIOUR = [
  "e2e/lifecycle/dual-scope.e2e.test.ts",
  "e2e/interactive/default-sandbox-runs-project-scope.e2e.test.ts",
  "src/cli/lib/__tests__/e2e-runner-environment.test.ts",
  "src/cli/lib/__tests__/helpers/cli-runner.test.ts",
  "e2e/lifecycle/scenario-c-init-registers-project.e2e.test.ts",
  "e2e/smoke/home-isolation.smoke.test.ts",
  "src/cli/components/common/summary-panel.test.tsx",
];

/** No ESLint rule sees the path it lints as text, so task IDs in filenames need this gate. */
describe("no spec is named after the task that produced it", () => {
  it("reports a task ID in a filename and leaves a behaviour name alone", () => {
    expect(NAMES_A_TASK.filter((name) => !namesATask(name))).toStrictEqual([]);
    expect(
      NAMES_A_BEHAVIOUR.filter(namesATask),
      "a behaviour name condemned as a task ID — the recogniser is reaching past the run it is anchored to",
    ).toStrictEqual([]);
  });

  it("holds every spec in the package against it", async () => {
    const specs = await fg(EVERY_SPEC, { cwd: CLI_ROOT });
    expect(
      specs.length,
      "the glob matched almost nothing — a roster built from it is clean because it is empty",
    ).toBeGreaterThan(SPECS_THE_TREE_HOLDS);

    expect(
      specs.filter(namesATask).sort(),
      "a spec filename names a task rather than the behaviour it pins — rename it for the behaviour, the way its own `describe` already does",
    ).toStrictEqual([]);
  });
});

const PREFIX_ALTERNATION = TRACKER_ID_PREFIXES.join("|");

/**
 * A tracker ID as prose writes it, as an ESLint selector `value` regex: two digits at least (one
 * digit names a phase label), never a year (`skills-2026` is a plan date), case-insensitive with
 * the hyphen optional.
 */
const TRACKER_ID_IN_PROSE = `\\b(?!(?:${PREFIX_ALTERNATION})-?(?:19|20)\\d{2}\\b)(?:${PREFIX_ALTERNATION})-?\\d{2,4}\\b`;

/** Four shapes: the lint config's `[callee.name=…]` reaches only a bare identifier. */
const TITLE_CALL = [
  // it("…") / describe("…") / test("…")
  "CallExpression[callee.name=/^(?:describe|it|test)$/]",
  // it.skip("…") / it.only("…") / describe.skipIf(…) with the title in the same call
  "CallExpression[callee.object.name=/^(?:describe|it|test)$/]",
  // it.each([…])("…") / describe.skipIf(…)("…") — the title is the SECOND call's first argument
  "CallExpression[callee.callee.object.name=/^(?:describe|it|test)$/]",
  // it.each`…`("…") — the same, with the table written as a tagged template
  "CallExpression[callee.tag.object.name=/^(?:describe|it|test)$/]",
].join(", ");

const TITLE_MESSAGE =
  "A task ID does not belong in a test title — describe the behaviour instead. IDs go in file-level JSDoc only.";

/** A `Literal` is the quoted form; a `TemplateElement` the backticked one. */
const TITLE_NAMES_A_TASK = [
  {
    selector: `:matches(${TITLE_CALL}) > Literal[value=/${TRACKER_ID_IN_PROSE}/i]`,
    message: TITLE_MESSAGE,
  },
  {
    selector: `:matches(${TITLE_CALL}) > TemplateLiteral TemplateElement[value.raw=/${TRACKER_ID_IN_PROSE}/i]`,
    message: TITLE_MESSAGE,
  },
];

/**
 * Reached by path: `packages/eslint-config` is plain `.js` with no types. Needed only for its
 * parser, since this package does not declare `@typescript-eslint/parser`.
 */
const SHARED_BASE_CONFIG_PATH = path.resolve(CLI_ROOT, "../eslint-config/base.js");

/** Only the parser, not the whole base, whose other rules' results would just be discarded. */
async function sharedLanguageOptions(): Promise<NonNullable<Linter.Config["languageOptions"]>> {
  const parserBlock = (await sharedBaseConfig()).find(
    (block) => block.languageOptions?.parser != null,
  );

  // `!= null`: flat config types the slot `Parser | null | undefined`.
  if (parserBlock?.languageOptions?.parser == null) {
    throw new Error(
      `${SHARED_BASE_CONFIG_PATH} resolves no parser — the shared base has moved, and this gate ` +
        `reads a syntax tree TypeScript does not have without one`,
    );
  }

  // The whole block, so `ecmaVersion`, `sourceType` and `parserOptions` travel with the parser.
  return parserBlock.languageOptions;
}

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

/**
 * Replaces `eslint.config.js` outright, since `no-restricted-syntax` options don't merge across
 * blocks. `noInlineConfig` keeps an `eslint-disable` from switching the gate off.
 */
async function titleGateConfig(): Promise<Linter.Config[]> {
  return [
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: await sharedLanguageOptions(),
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { "no-restricted-syntax": ["error", ...TITLE_NAMES_A_TASK] },
    },
  ];
}

async function titleGate(): Promise<ESLint> {
  return new ESLint({
    cwd: CLI_ROOT,
    overrideConfigFile: true,
    overrideConfig: await titleGateConfig(),
  });
}

function reportsFor(results: readonly ESLint.LintResult[]): string[] {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "no-restricted-syntax")
      .map((message) => `${path.relative(CLI_ROOT, result.filePath)}:${message.line}`),
  );
}

async function condemns(gate: ESLint, source: string): Promise<boolean> {
  return reportsFor(await gate.lintText(source, { filePath: FIXTURE_PATH })).length > 0;
}

type Verdict = { source: string; condemned: boolean };

async function verdictsFor(gate: ESLint, sources: readonly string[]): Promise<Verdict[]> {
  return Promise.all(
    sources.map(async (source) => ({ source, condemned: await condemns(gate, source) })),
  );
}

function escapedIn(verdicts: readonly Verdict[]): string[] {
  return verdicts.filter((verdict) => !verdict.condemned).map((verdict) => verdict.source);
}

function condemnedIn(verdicts: readonly Verdict[]): string[] {
  return verdicts.filter((verdict) => verdict.condemned).map((verdict) => verdict.source);
}

/** Any spec path does: the config file is replaced and nothing is type-checked. */
const FIXTURE_PATH = "src/cli/lib/__tests__/spec-filenames.test.ts";

const TITLE_SHAPES = [
  (title: string) => `it("${title}", () => {});`,
  (title: string) => `describe.skip("${title}", () => {});`,
  (title: string) => `it.each([1])("${title} %s", () => {});`,
  (title: string) => `describe.skipIf(false)("${title}", () => {});`,
  (title: string) => `it(\`${title}\`, () => {});`,
] as const;

/** Composed, not spelled out: a new prefix arrives untouched, and the file holds no literal IDs. */
const TITLES_NAMING_A_TASK = TRACKER_ID_PREFIXES.flatMap((prefix) =>
  TITLE_SHAPES.map((write) => write(`${prefix}-227 restores the tombstone`)),
);

/**
 * Subject guard for everything above. The last entry is composed from `NAMES_A_TASK`: array members
 * are not titles, so the gate must not condemn this file's own fixtures.
 */
const TITLES_NAMING_A_BEHAVIOUR = [
  `it("reads custom-skills-2026-08-06-investigation", () => {});`,
  `it("cli-runner clears every variable it names", () => {});`,
  `it("a dual-scope round trip leaves the space bar inert", () => {});`,
  `const NAMES = ${JSON.stringify(NAMES_A_TASK)};\nNAMES;`,
];

/** One pass over every spec plus a `lintText` per fixture; generous headroom for a busy machine. */
const TITLE_GATE_TIMEOUT_MS = 60_000;

describe("no test title names the task that produced it", () => {
  it("runs the one rule it reads, rather than every rule the shared base carries", async () => {
    const config = await titleGateConfig();

    const rules = config.flatMap((block) => Object.keys(block.rules ?? {}));

    expect(
      rules,
      "the gate inherited rules it does not read — their work over every spec is computed and discarded",
    ).toStrictEqual(["no-restricted-syntax"]);
  });

  it(
    "condemns a task ID in every shape a title is written in, and leaves a behaviour name alone",
    async () => {
      const gate = await titleGate();

      expect(
        escapedIn(await verdictsFor(gate, TITLES_NAMING_A_TASK)),
        "a title naming a task escaped the gate — the selector does not reach the shape it is written in",
      ).toStrictEqual([]);

      expect(
        condemnedIn(await verdictsFor(gate, TITLES_NAMING_A_BEHAVIOUR)),
        "a behaviour name condemned as a task ID — the selector is reaching past a title, or past the run it is anchored to",
      ).toStrictEqual([]);

      const specs = await fg(EVERY_SPEC, { cwd: CLI_ROOT });
      expect(
        specs.length,
        "the glob matched almost nothing — a roster built from it is clean because it is empty",
      ).toBeGreaterThan(SPECS_THE_TREE_HOLDS);

      expect(
        reportsFor(await gate.lintFiles(EVERY_SPEC)).sort(),
        "a test title names a task rather than the behaviour it pins — describe the behaviour; the ID belongs in file-level JSDoc if anywhere",
      ).toStrictEqual([]);
    },
    TITLE_GATE_TIMEOUT_MS,
  );
});
