import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ESLint, type Linter } from "eslint";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every spec the package holds, whichever of the three suites collects it. */
const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

/**
 * A floor under the scan, not a census. A glob that matched nothing would report a clean
 * roster for a tree full of specs, and every judgement below would hold for that reason.
 */
const SPECS_THE_TREE_HOLDS = 300;

/**
 * The prefixes a task ID in this repository is written with — `todo/`'s six trackers use
 * `CLI-`, `D-`, `P4-` and `SKILLS-`.
 *
 * STATED rather than read out of the trackers. `todo/` sits above this package and does not
 * ship with it, so a gate that derived the roster from there would be green in a published
 * checkout for the reason that it could not see anything. The cost of stating it is that a
 * seventh tracker's prefix has to be added here; the cost of deriving it is a gate that stops
 * working where nobody is watching.
 */
const TRACKER_ID_PREFIXES = ["cli", "d", "p4", "skills"] as const;

/**
 * A whole hyphen-delimited run naming a tracker ID — `d227`, `d-227`, `cli-551`, `p4-17`.
 *
 * Anchored at both ends of the run so a word that merely opens with a prefix letter is left
 * alone: `dual-scope`, `default-sandbox` and `cli-runner` all start with one and none of them
 * is followed by a number, which is the whole of what makes a name a ticket rather than a
 * description.
 */
const TRACKER_ID_RUN = new RegExp(`(^|-)(${TRACKER_ID_PREFIXES.join("|")})-?\\d+(-|$)`);

/** A spec's basename with the suffix its suite collects it by removed. */
function specStem(specPath: string): string {
  return path.basename(specPath).replace(/\.(?:e2e\.|smoke\.)?test\.tsx?$/, "");
}

function namesATask(specPath: string): boolean {
  return TRACKER_ID_RUN.test(specStem(specPath));
}

/**
 * Filenames the recogniser must condemn, and filenames it must leave alone. The second half is
 * the subject guard for the first: a recogniser that answered `false` to everything would
 * satisfy the roster assertion below without reading a name, and only the discriminating cases
 * tell that apart from a recogniser that works.
 */
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
  "src/cli/components/wizard/source-grid.test.tsx",
];

/**
 * Task IDs are already banned from a `describe`, an `it` and an assertion message — but each of
 * those is a string an ESLint selector can reach, and a FILENAME is not: no rule in
 * `eslint.config.js` sees the path it is linting as text to match, so the one place the ban was
 * unenforceable is the one place it was broken. `d227-same-scope-tombstone-duplicate.test.ts`
 * carried D-227 in its name for a month while every `describe` inside it said what it pins.
 *
 * A name rots the same way wherever it is written. The ID looks authoritative and stops meaning
 * anything the day the task closes, and a reader who wants to know what the file covers has to
 * open it.
 */
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

/** The prefix alternation both title patterns below are written from. */
const PREFIX_ALTERNATION = TRACKER_ID_PREFIXES.join("|");

/**
 * A tracker ID as PROSE writes it, as the `value` regex of an ESLint selector.
 *
 * `TRACKER_ID_RUN` above cannot stand in for it. That one is anchored to HYPHENS because a
 * filename has nothing else to end a run on; a title is a sentence, where a bracketed run and
 * a run followed by a word both close on something else. Three further decisions, each measured
 * against this tree on 2026-08-21:
 *
 * TWO DIGITS at least, not one. `{1,4}` condemns the `D-1` … `D-7` E2E PHASE LABELS, which
 * `todo/cli.md` rules need no rename, and `agent-recompiler.test.ts`'s
 * `(D7 cross-scope safety)` with them — a run of specs' body lines moves by sixty between the
 * two readings. A one-digit run names a phase far more often than a ticket, so it is the reading
 * that manufactures work rather than finding it.
 *
 * NOT A YEAR. `custom-skills-2026-08-06-investigation` is a plan name this repository writes,
 * and it reads as `skills-2026` to the run — so a title naming that plan would be condemned for
 * saying when it was written. The lookahead withdraws the year shape behind the same prefixes
 * and nothing else.
 *
 * CASE-INSENSITIVE, hyphen optional. `d227` is how the one filename this repository actually
 * broke the ban with was written.
 */
const TRACKER_ID_IN_PROSE = `\\b(?!(?:${PREFIX_ALTERNATION})-?(?:19|20)\\d{2}\\b)(?:${PREFIX_ALTERNATION})-?\\d{2,4}\\b`;

/**
 * Every callee shape a test title is written behind.
 *
 * Four, because `eslint.config.js` bans the first and reaches none of the others. Its selectors
 * key on `[callee.name=…]`, which matches a bare identifier only — measured 2026-08-21 through
 * `ESLint.lintText`, `it.skip(…)`, `it.each([…])(…)`, `describe.skipIf(…)(…)` and
 * ``it.each`…`(…)`` all escape it, as do the `SKILLS-` prefix, a lowercase `cli-551` and any run
 * written without its hyphen.
 */
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

/**
 * The whole of the gate: a title, in any of the four shapes, whose text names a tracker ID.
 * A `Literal` is the ordinary quoted form; a `TemplateElement` is the backticked one.
 */
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
 * The shared flat config, reached by PATH rather than by package specifier.
 *
 * `packages/eslint-config` ships plain `.js` and declares in its own manifest that it holds no
 * TypeScript, so a `.d.ts` written to make `import … from "@workspace/eslint-config/base"`
 * type-check would falsify that declaration and take two cross-workspace checks with it. It is
 * the same parse boundary `spec-gates.test.ts` crosses, for the same reason — and it is here for
 * the PARSER alone: `no-restricted-syntax` reads a syntax tree, and TypeScript has none without
 * one. `@typescript-eslint/parser` is deliberately not reached for directly; this package does
 * not declare it.
 */
const SHARED_BASE_CONFIG_PATH = path.resolve(CLI_ROOT, "../eslint-config/base.js");

/**
 * The parser the shared base resolves, taken out of it rather than inherited with it.
 *
 * This package does not declare `@typescript-eslint/parser`, so the base is where it comes from —
 * but taking the base WHOLE brought every rule in `js.configs.recommended`,
 * `tseslint.configs.recommended` and this repository's own additions, all of them computed over
 * 466 spec files and then discarded by `reportsFor`, which reads `no-restricted-syntax` alone.
 * Measured: 3,351ms whole against 1,996ms parser-only, same files, same verdict.
 */
async function sharedLanguageOptions(): Promise<NonNullable<Linter.Config["languageOptions"]>> {
  const parserBlock = (await sharedBaseConfig()).find(
    (block) => block.languageOptions?.parser != null,
  );

  // `!= null` rather than `!== undefined`: flat config types the slot `Parser | null | undefined`,
  // and a null parser is as absent as a missing one for a gate that must parse TypeScript.
  if (parserBlock?.languageOptions?.parser == null) {
    throw new Error(
      `${SHARED_BASE_CONFIG_PATH} resolves no parser — the shared base has moved, and this gate ` +
        `reads a syntax tree TypeScript does not have without one`,
    );
  }

  // The whole block rather than the parser alone, so whatever the parser needs beside itself —
  // `ecmaVersion`, `sourceType`, `parserOptions` — travels with it rather than being restated.
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
 * An ESLint that knows this one rule and nothing else about the repository.
 *
 * `overrideConfigFile: true` replaces `eslint.config.js` outright rather than adding to it,
 * deliberately: `no-restricted-syntax` takes options and so does NOT merge across config blocks
 * — the last block naming it for a file owns all of its selectors — so reaching this gate's
 * selectors in through an override would silently drop the config's own. Replacing the file
 * keeps the two rosters separate and makes this pass a statement about titles alone.
 *
 * `noInlineConfig` is what makes it a gate rather than a default: an `eslint-disable` written in
 * a spec cannot switch it off. Unused directives are not reported, because under a config this
 * narrow every directive in the tree is unused.
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

/** Where `source` is condemned, as `path:line`, and empty when it is left alone. */
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

/** What the gate answered for one fixture, paired with the fixture, so neither can be read alone. */
type Verdict = { source: string; condemned: boolean };

async function verdictsFor(gate: ESLint, sources: readonly string[]): Promise<Verdict[]> {
  return Promise.all(
    sources.map(async (source) => ({ source, condemned: await condemns(gate, source) })),
  );
}

/** The fixtures the gate left alone — what a positive roster must report as empty. */
function escapedIn(verdicts: readonly Verdict[]): string[] {
  return verdicts.filter((verdict) => !verdict.condemned).map((verdict) => verdict.source);
}

/** The fixtures the gate condemned — what a negative roster must report as empty. */
function condemnedIn(verdicts: readonly Verdict[]): string[] {
  return verdicts.filter((verdict) => verdict.condemned).map((verdict) => verdict.source);
}

/**
 * The path every fixture below is linted under. Any spec path does — this gate replaces the
 * config file rather than resolving one, and nothing in it is type-checked, so the file does not
 * have to belong to a TypeScript program the way `spec-gates.test.ts`'s zones do.
 */
const FIXTURE_PATH = "src/cli/lib/__tests__/spec-filenames.test.ts";

/** How a spec writes a title: one entry per callee shape `TITLE_CALL` claims to reach. */
const TITLE_SHAPES = [
  (title: string) => `it("${title}", () => {});`,
  (title: string) => `describe.skip("${title}", () => {});`,
  (title: string) => `it.each([1])("${title} %s", () => {});`,
  (title: string) => `describe.skipIf(false)("${title}", () => {});`,
  (title: string) => `it(\`${title}\`, () => {});`,
] as const;

/**
 * Every prefix in every shape, COMPOSED rather than spelled out.
 *
 * Two reasons, and the second is the one that decided it. A seventh tracker's prefix added to
 * `TRACKER_ID_PREFIXES` arrives here without anyone remembering to write a fixture for it. And a
 * literal tracker ID written into this file would be one more of them in the tree — this gate
 * reads TITLES and so would not see it, but the content-side sweep reads every line, and eight
 * of its census hits are already this file's own `NAMES_A_TASK` entries. A gate whose
 * fixtures are the thing it bans has to be excused by path, and a path carve-out is a hole shaped
 * exactly like the file that asked for it.
 */
const TITLES_NAMING_A_TASK = TRACKER_ID_PREFIXES.flatMap((prefix) =>
  TITLE_SHAPES.map((write) => write(`${prefix}-227 restores the tombstone`)),
);

/**
 * Sources the gate must leave alone — the subject guard for everything above. A selector that
 * condemned nothing would satisfy the tree assertion below without reading a title, and only the
 * discriminating cases tell that apart from a selector that works.
 *
 * The last is the one that settles this file's own standing: `NAMES_A_TASK` holds five
 * task-shaped strings, and they are ARRAY MEMBERS rather than titles. A gate that read one would
 * condemn its own neighbours, and the fixture is composed from that array so it cannot drift
 * from it.
 */
const TITLES_NAMING_A_BEHAVIOUR = [
  `it("reads custom-skills-2026-08-06-investigation", () => {});`,
  `it("cli-runner clears every variable it names", () => {});`,
  `it("a dual-scope round trip leaves the space bar inert", () => {});`,
  `const NAMES = ${JSON.stringify(NAMES_A_TASK)};\nNAMES;`,
];

/**
 * What this gate is allowed to take: one ESLint pass over every spec the package holds, plus one
 * `lintText` per fixture. Measured ~4s on an idle machine 2026-08-21, against a suite default of
 * 10s. The headroom is the point — six agents working at once is exactly when a 4s gate becomes
 * a 9s one, and a timeout there reads to whoever meets it as a regression the change caused
 * rather than as a busy machine.
 */
const TITLE_GATE_TIMEOUT_MS = 60_000;

/**
 * The other half of the ban, and the half that was only PARTLY enforced.
 *
 * `eslint.config.js` has long banned a task ID in a `describe`, an `it` and an assertion
 * message, and the docblock above reads that as the enforceable half. It is not: measured
 * 2026-08-21, its selectors match a BARE identifier callee only, so `it.skip`, `it.only`,
 * `it.each([…])(…)`, `describe.each(…)(…)` and the tagged-template form all escape — as do the
 * `SKILLS-` prefix, which its list omits, a lowercase `cli-551`, and any run written without its
 * hyphen. Four of the five shapes a title is written in were unreached.
 *
 * It is locked now because it is green now: no title in the package names a task under this
 * pattern today, so the gate costs one pass and forbids a class nobody has to be un-taught. A
 * ban with nothing to clean up first is the cheapest one there will ever be.
 */
describe("no test title names the task that produced it", () => {
  /**
   * The gate reads ONE rule, so it must run one rule.
   *
   * It took the shared base whole — `js.configs.recommended`, `tseslint.configs.recommended` and
   * every rule this repository adds — and then `reportsFor` discarded everything that was not
   * `no-restricted-syntax`. Every other rule's work over 466 spec files was computed and thrown
   * away: measured at **3,351ms against 1,996ms** for the same 466 files and the same verdict,
   * so two fifths of the scan answered a question nobody asked.
   *
   * The base is still where the PARSER comes from — this package does not declare
   * `@typescript-eslint/parser`, and `no-restricted-syntax` reads a syntax tree, which TypeScript
   * has none of without one. Taking the parser out of the base rather than the base whole is the
   * difference between needing it and inheriting it.
   */
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
