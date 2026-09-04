/**
 * Contract for `scripts/generate-matrix-package.ts` — the CLI-side generator that owns every
 * generated file in `packages/matrix`: `src/vendor/**` and `src/generated/agents.ts`.
 *
 * The acceptance criterion is byte-identity. The writer moves out of
 * `packages/matrix/scripts/generate-from-cli.mjs`; the emitted bytes must not change.
 * Design record: `todo/plans/D-239-web-ui-shared-matrix-package.md`.
 *
 * Testability is part of the contract: roots are parameters, and importing the module must not
 * write anything — the failure mode `scripts/generate-json-schemas.ts` is stuck with.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import { STANDARD_FILES } from "../src/cli/consts.js";
import { bytewise } from "../src/cli/utils/string.js";
import { renderAgentYaml } from "../src/cli/lib/__tests__/content-generators.js";
import { AGENT_DEFS } from "../src/cli/lib/__tests__/mock-data/mock-agents.js";
import { SKILLS } from "../src/cli/lib/__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { AGENT_NAMES } from "../src/cli/types/agents.js";

import { BUILT_IN_MATRIX } from "../src/cli/types/generated/matrix.js";

import { check, generate, matrixShapeIssues } from "./generate-matrix-package.js";

import type { GeneratedAgentDefinition } from "@workspace/matrix";
import type { AgentName, AgentYamlConfig } from "../src/cli/types/index.js";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const MATRIX_ROOT = path.resolve(CLI_ROOT, "../matrix");
const MATRIX_SRC = path.join(MATRIX_ROOT, "src");
const VENDOR_DIR = path.join(MATRIX_SRC, "vendor");

/** Emitted paths are relative to the matrix package root, POSIX-separated. */
const VENDOR_PREFIX = "src/vendor/";
const AGENTS_FILE = "src/generated/agents.ts";
const CLI_TYPES_DIR = "src/cli/types";
const CLI_AGENTS_DIR = "src/agents";

const DRIFTED_FILE = "src/vendor/matrix.ts";
const DRIFTED_CONTENT = "// hand-edited after generation\n";

/** The vendored copy of `src/cli/types/config.ts`, relative to `VENDOR_DIR`. */
const VENDORED_CONFIG_FILE = "config.ts";

const DEVELOPER_FLAVOR = "developer";
const TESTER_FLAVOR = "tester";
const META_FLAVOR = "meta";
const PLANNING_FLAVOR = "planning";
const REVIEWER_FLAVOR = "reviewer";

/**
 * The two agents the entry spot-checks are written against, typed so that retiring one is a
 * compile error here rather than a `toContain` left searching for a string nothing emits.
 */
const AGENT_SUMMONER: AgentName = "agent-summoner";
const PM: AgentName = "pm";

/**
 * One emitted `AGENT_DEFINITIONS` entry, with every value READ from the agent's own
 * `metadata.yaml`. Only `flavor` and `path` are stated, because those two are derived from the
 * directory rather than declared in the file — which is what {@link PM_ENTRY}'s test exists to pin.
 *
 * **Read rather than pasted, and that is the whole point of this function.** The values were
 * pasted until `agent-summoner`'s description lost its trailing clause, at which point this spec
 * asserted a sentence no file in the repository contained. Prose in a source file is not the
 * subject here — the FIELD ROSTER is, which is why the seven fields are spelled out one per line
 * rather than looped over — so a second copy of that prose bought nothing and rotted on the first
 * wording change.
 *
 * **What reading the values still buys, and what a keys-only assertion would give up, is
 * PROVENANCE**: a generator carrying the right seven keys with a value of its own invention would
 * satisfy any roster check and fail here. Byte-identity against `packages/matrix` cannot make that
 * catch, because regenerating rewrites the committed file and moves both sides of that comparison
 * together.
 *
 * The line format is shared with `serializeAgentDefinition` deliberately and is not what is being
 * tested — the ENCODING is byte-identity's subject, and this function's is which fields carry
 * which source values.
 *
 * The outer key is the DIRECTORY name while `"id"` is read from the file, so the two disagreeing
 * fails too — which is what the pasted form asserted by spelling one literal twice.
 */
function agentDefinitionEntry(flavor: string, agent: AgentName): string {
  const metadataPath = path.join(
    CLI_ROOT,
    CLI_AGENTS_DIR,
    flavor,
    agent,
    STANDARD_FILES.AGENT_METADATA_YAML,
  );

  // Parse boundary: the CLI's own metadata.yaml, shaped by src/schemas/agent.schema.json.
  // `Required` names the five fields these spot-checks read out of it; a source missing one
  // renders `undefined` into the expectation, which fails loudly rather than quietly matching.
  const source = parseYaml(readFileSync(metadataPath, "utf-8")) as Required<
    Pick<AgentYamlConfig, "id" | "title" | "description" | "model" | "tools">
  >;

  return [
    `  ${JSON.stringify(agent)}: {`,
    `    "id": ${JSON.stringify(source.id)},`,
    `    "title": ${JSON.stringify(source.title)},`,
    `    "description": ${JSON.stringify(source.description)},`,
    `    "model": ${JSON.stringify(source.model)},`,
    `    "tools": ${JSON.stringify(source.tools)},`,
    `    "flavor": ${JSON.stringify(flavor)},`,
    `    "path": ${JSON.stringify(`${flavor}/${agent}`)},`,
    "  },",
  ].join("\n");
}

/** Spot-checks against the real `src/agents/meta/agent-summoner/metadata.yaml`. */
const AGENT_SUMMONER_ENTRY = agentDefinitionEntry(META_FLAVOR, AGENT_SUMMONER);

/** Spot-checks against the real `src/agents/planning/pm/metadata.yaml`. */
const PM_ENTRY = agentDefinitionEntry(PLANNING_FLAVOR, PM);

const listFilesRecursive = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();

const modifiedAt = (filePath: string): bigint => statSync(filePath, { bigint: true }).mtimeNs;

const readEmitted = (root: string, relativePaths: string[]): Record<string, string> =>
  Object.fromEntries(
    relativePaths.map((rel) => [rel, readFileSync(path.join(root, rel), "utf-8")]),
  );

const fixtureTypeSource = (relativePath: string): string => `// fixture stub for ${relativePath}\n`;

/**
 * `name` is widened off `AGENT_DEFS`: it is written straight into the fixture's metadata.yaml as
 * `id` and read back unvalidated, so a fixture may carry an id the current AgentName union does
 * not hold — which is what lets this suite state an ordering the eighteen ids shipped today
 * cannot, none of them making a collation and its code units disagree.
 */
type FixtureAgent = Omit<(typeof AGENT_DEFS)[keyof typeof AGENT_DEFS], "name"> & { name: string };

/**
 * The fields every emitted entry carries however the agent was authored — the four `AGENT_DEFS`
 * supplies and the two the generator derives from the directory. Everything else is forwarded
 * through a conditional spread, and {@link CONDITIONAL_METADATA} is the roster of those.
 */
type UnconditionalAgentField = "id" | "title" | "description" | "tools" | "flavor" | "path";

/** The rest: every field an entry carries only because the `metadata.yaml` declared it. */
type ConditionalAgentMetadata = Required<Omit<GeneratedAgentDefinition, UnconditionalAgentField>>;

/**
 * Every field `toAgentDefinition` forwards only when the agent's `metadata.yaml` declares it,
 * with a value for each.
 *
 * **No shipped agent declares six of the seven** — `model` is the exception — so every other
 * spread is unentered while the generator runs against the real tree:
 *
 * ```
 * for k in effort disallowedTools permissionMode isolation experimental outputFormat; do \
 *   printf '%s %s\n' "$k" "$(grep -l "^$k:" $(find src/agents -name metadata.yaml) | wc -l)"; done
 * ```
 *
 * Deleting one of those spreads therefore leaves `packages/matrix/src/generated/agents.ts`
 * byte-identical, so neither the byte comparison against the committed file nor the two
 * spot-check entries above — which read only the five fields every agent declares — can see it.
 * This constant is what gives the mapping a subject, and the fixture agent below is authored to
 * declare all seven at once.
 *
 * `Required<Omit<…>>` is the binding rather than decoration: a field added to the emitted
 * `GeneratedAgentDefinition` and not given a value here stops compiling at this literal, which is
 * the only thing that stops the next conditional mapping arriving unexercised the same way. The
 * type is imported from `packages/matrix` because that is the copy this generator emits and every
 * consumer reads.
 *
 * `model` is `haiku` rather than the `opus` all eighteen shipped agents carry, so the assertion
 * over it cannot pass on a value the fixture and a hardcoded default happen to share.
 */
const CONDITIONAL_METADATA: ConditionalAgentMetadata = {
  model: "haiku",
  effort: "xhigh",
  disallowedTools: ["Bash"],
  permissionMode: "plan",
  isolation: "worktree",
  experimental: { cacheTtl: "1h" },
  outputFormat: "markdown",
};

function writeFixtureAgent(
  cliRoot: string,
  flavor: string,
  agent: FixtureAgent,
  conditional?: ConditionalAgentMetadata,
): void {
  const agentDir = path.join(cliRoot, CLI_AGENTS_DIR, flavor, agent.name);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
    renderAgentYaml(agent.name, agent.description, {
      title: agent.title,
      tools: agent.tools,
      ...conditional,
    }),
  );
}

function writeFixtureTypes(cliRoot: string, relativePaths: string[]): void {
  for (const relativePath of relativePaths) {
    const target = path.join(cliRoot, CLI_TYPES_DIR, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, fixtureTypeSource(relativePath));
  }
}

// -- Module shape ------------------------------------------------------------

describe("generate-matrix-package module", () => {
  it("exports generate and check, and importing it writes nothing", async () => {
    const committedFiles = listFilesRecursive(MATRIX_SRC).map((rel) => path.join(MATRIX_SRC, rel));
    const modifiedBefore = committedFiles.map(modifiedAt);

    vi.resetModules();
    const reimported = await import("./generate-matrix-package.js");

    expect(typeof reimported.generate).toBe("function");
    expect(typeof reimported.check).toBe("function");
    expect(
      committedFiles.map(modifiedAt),
      "importing the generator must not touch any file in packages/matrix",
    ).toStrictEqual(modifiedBefore);
  });
});

// -- Generating against the repository ---------------------------------------

describe("generating against the repository", () => {
  let outputRoot: string;
  let written: string[];
  let agentsContent: string;

  beforeAll(async () => {
    outputRoot = await createTempDir("matrix-generate-");
    written = generate({ matrixRoot: outputRoot }).written;
    agentsContent = readFileSync(path.join(outputRoot, AGENTS_FILE), "utf-8");
  });

  afterAll(async () => {
    await cleanupTempDir(outputRoot);
  });

  it("emits exactly the vendor file set committed to packages/matrix", () => {
    expect(written.filter((rel) => rel.startsWith(VENDOR_PREFIX)).sort()).toStrictEqual(
      listFilesRecursive(VENDOR_DIR).map((rel) => `${VENDOR_PREFIX}${rel}`),
    );
  });

  it("emits the generated agent definitions file", () => {
    expect(written).toContain(AGENTS_FILE);
  });

  it("carries one AGENT_DEFINITIONS entry per generated agent name", () => {
    for (const name of AGENT_NAMES) {
      expect(agentsContent, `AGENT_DEFINITIONS must carry an entry for ${name}`).toContain(
        `\n  "${name}": {\n`,
      );
    }
  });

  it("orders AGENT_DEFINITIONS entries by agent id", () => {
    const positions = AGENT_NAMES.map((name) => agentsContent.indexOf(`\n  "${name}": {\n`));

    expect(positions).not.toContain(-1);
    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b));
  });

  it("constrains AGENT_DEFINITIONS to the AgentName union", () => {
    expect(agentsContent).toContain(
      "} as const satisfies Record<AgentName, GeneratedAgentDefinition>",
    );
  });

  it("carries id, title, description, model, tools, flavor and path for agent-summoner", () => {
    expect(agentsContent).toContain(AGENT_SUMMONER_ENTRY);
  });

  it("derives flavor and path from the agent's directory for pm", () => {
    expect(agentsContent).toContain(PM_ENTRY);
  });

  it("reproduces every file committed to packages/matrix byte for byte", () => {
    expect(written.length).toBeGreaterThan(0);

    for (const relativePath of written) {
      expect(
        readFileSync(path.join(outputRoot, relativePath), "utf-8"),
        `${relativePath} must be identical to the file committed in packages/matrix`,
      ).toBe(readFileSync(path.join(MATRIX_ROOT, relativePath), "utf-8"));
    }
  });
});

// -- Determinism -------------------------------------------------------------

describe("regenerating into the same output root", () => {
  let outputRoot: string;

  beforeAll(async () => {
    outputRoot = await createTempDir("matrix-rerun-");
  });

  afterAll(async () => {
    await cleanupTempDir(outputRoot);
  });

  it("produces identical bytes on two consecutive runs", () => {
    const firstRun = generate({ matrixRoot: outputRoot });
    const firstBytes = readEmitted(outputRoot, firstRun.written);

    const secondRun = generate({ matrixRoot: outputRoot });

    expect(secondRun.written).toStrictEqual(firstRun.written);
    expect(readEmitted(outputRoot, secondRun.written)).toStrictEqual(firstBytes);
  });
});

// -- Parameterized input root ------------------------------------------------

describe("generating from a fixture cli root", () => {
  let fixtureCliRoot: string;
  let outputRoot: string;
  let vendoredTypeFiles: string[];
  let written: string[];

  beforeAll(async () => {
    fixtureCliRoot = await createTempDir("matrix-fixture-cli-");
    outputRoot = await createTempDir("matrix-fixture-out-");
    vendoredTypeFiles = listFilesRecursive(VENDOR_DIR);

    writeFixtureTypes(fixtureCliRoot, vendoredTypeFiles);
    writeFixtureAgent(fixtureCliRoot, DEVELOPER_FLAVOR, AGENT_DEFS.webDev);
    writeFixtureAgent(fixtureCliRoot, TESTER_FLAVOR, AGENT_DEFS.webTester);

    written = generate({ matrixRoot: outputRoot, cliRoot: fixtureCliRoot }).written;
  });

  afterAll(async () => {
    await cleanupTempDir(fixtureCliRoot);
    await cleanupTempDir(outputRoot);
  });

  it("vendors the type files from the given cli root", () => {
    expect(written.filter((rel) => rel.startsWith(VENDOR_PREFIX)).sort()).toStrictEqual(
      vendoredTypeFiles.map((rel) => `${VENDOR_PREFIX}${rel}`),
    );

    for (const relativePath of vendoredTypeFiles) {
      expect(
        readFileSync(path.join(outputRoot, VENDOR_PREFIX + relativePath), "utf-8"),
        `${relativePath} must be copied from the cli root passed in, not the real repository`,
      ).toBe(fixtureTypeSource(relativePath));
    }
  });

  it("derives agent definitions from the given cli root only", () => {
    const agentsContent = readFileSync(path.join(outputRoot, AGENTS_FILE), "utf-8");

    expect(agentsContent).toContain(`\n  "${AGENT_DEFS.webDev.name}": {\n`);
    expect(agentsContent).toContain(`    "title": ${JSON.stringify(AGENT_DEFS.webDev.title)},`);
    expect(agentsContent).toContain(`    "tools": ${JSON.stringify(AGENT_DEFS.webDev.tools)},`);
    expect(agentsContent).toContain(`    "flavor": "${DEVELOPER_FLAVOR}",`);
    expect(agentsContent).toContain(`    "path": "${DEVELOPER_FLAVOR}/${AGENT_DEFS.webDev.name}",`);
    expect(agentsContent).toContain(`\n  "${AGENT_DEFS.webTester.name}": {\n`);
    expect(agentsContent).toContain(`    "path": "${TESTER_FLAVOR}/${AGENT_DEFS.webTester.name}",`);
    expect(
      agentsContent,
      "agents outside the cli root passed in must not appear in the output",
    ).not.toContain("agent-summoner");
  });
});

// -- Conditional field mappings ----------------------------------------------

/**
 * The entry {@link CONDITIONAL_METADATA} produces, one line per field in emission order.
 *
 * Spelled out rather than looped over {@link CONDITIONAL_METADATA}, for the reason
 * {@link agentDefinitionEntry} gives: a loop would restate `serializeAgentDefinition`'s own
 * encoding, and a test that reimplements the code under test agrees with it by construction.
 * Written as one block rather than one assertion per field so the ORDER is pinned too — the
 * emitted order is `toAgentDefinition`'s literal order, and nothing else in this file can see it
 * for a field no shipped agent declares.
 */
const CONDITIONAL_METADATA_ENTRY = [
  `  ${JSON.stringify(AGENT_DEFS.reviewer.name)}: {`,
  `    "id": ${JSON.stringify(AGENT_DEFS.reviewer.name)},`,
  `    "title": ${JSON.stringify(AGENT_DEFS.reviewer.title)},`,
  `    "description": ${JSON.stringify(AGENT_DEFS.reviewer.description)},`,
  `    "model": ${JSON.stringify(CONDITIONAL_METADATA.model)},`,
  `    "effort": ${JSON.stringify(CONDITIONAL_METADATA.effort)},`,
  `    "tools": ${JSON.stringify(AGENT_DEFS.reviewer.tools)},`,
  `    "disallowedTools": ${JSON.stringify(CONDITIONAL_METADATA.disallowedTools)},`,
  `    "permissionMode": ${JSON.stringify(CONDITIONAL_METADATA.permissionMode)},`,
  `    "isolation": ${JSON.stringify(CONDITIONAL_METADATA.isolation)},`,
  `    "experimental": ${JSON.stringify(CONDITIONAL_METADATA.experimental)},`,
  `    "outputFormat": ${JSON.stringify(CONDITIONAL_METADATA.outputFormat)},`,
  `    "flavor": ${JSON.stringify(REVIEWER_FLAVOR)},`,
  `    "path": ${JSON.stringify(`${REVIEWER_FLAVOR}/${AGENT_DEFS.reviewer.name}`)},`,
  "  },",
].join("\n");

describe("generating from an agent that declares every conditional field", () => {
  let fixtureCliRoot: string;
  let outputRoot: string;
  let agentsContent: string;

  beforeAll(async () => {
    fixtureCliRoot = await createTempDir("matrix-conditional-cli-");
    outputRoot = await createTempDir("matrix-conditional-out-");

    writeFixtureTypes(fixtureCliRoot, listFilesRecursive(VENDOR_DIR));
    writeFixtureAgent(fixtureCliRoot, REVIEWER_FLAVOR, AGENT_DEFS.reviewer, CONDITIONAL_METADATA);

    generate({ matrixRoot: outputRoot, cliRoot: fixtureCliRoot });
    agentsContent = readFileSync(path.join(outputRoot, AGENTS_FILE), "utf-8");
  });

  afterAll(async () => {
    await cleanupTempDir(fixtureCliRoot);
    await cleanupTempDir(outputRoot);
  });

  it("forwards every declared field, in the order the entry emits them", () => {
    expect(
      agentsContent,
      "a conditional spread stopped forwarding its field — no shipped agent declares six of these, so nothing else in this suite reads them",
    ).toContain(CONDITIONAL_METADATA_ENTRY);
  });
});

// -- Ordering ----------------------------------------------------------------

/**
 * A locale whose collation orders a pair of ordinary kebab-case ids against their code units.
 * Lithuanian places `y` immediately after `i`, so it puts `styling-agent` before `storage-agent`
 * where code units put it after — and `localeCompare` called with no locale reads the process
 * default, which Node takes from LC_ALL/LANG. So this is not a hypothetical alphabet: it is what
 * the committed file becomes when the contributor who regenerated it runs a Lithuanian desktop.
 */
const DIVERGENT_COLLATION_LOCALE = "lt";

/** The pair that locale reverses, stated in code-unit order. */
const COLLATION_DIVERGENT_AGENT_IDS = { first: "storage-agent", second: "styling-agent" } as const;

describe("ordering the emitted agent definitions", () => {
  let fixtureCliRoot: string;
  let outputRoot: string;
  let agentsContent: string;
  let collationInForce: number;

  beforeAll(async () => {
    fixtureCliRoot = await createTempDir("matrix-order-cli-");
    outputRoot = await createTempDir("matrix-order-out-");

    writeFixtureTypes(fixtureCliRoot, listFilesRecursive(VENDOR_DIR));
    writeFixtureAgent(fixtureCliRoot, DEVELOPER_FLAVOR, {
      ...AGENT_DEFS.webDev,
      name: COLLATION_DIVERGENT_AGENT_IDS.first,
    });
    writeFixtureAgent(fixtureCliRoot, DEVELOPER_FLAVOR, {
      ...AGENT_DEFS.apiDev,
      name: COLLATION_DIVERGENT_AGENT_IDS.second,
    });

    // Stands in for a machine whose default collation is Lithuanian, which is the only thing
    // `localeCompare` with no locale argument consults.
    const lithuanian = new Intl.Collator(DIVERGENT_COLLATION_LOCALE);
    const defaultCollation = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, that: string) {
        return lithuanian.compare(String(this), that);
      });

    collationInForce = Math.sign(
      COLLATION_DIVERGENT_AGENT_IDS.first.localeCompare(COLLATION_DIVERGENT_AGENT_IDS.second),
    );
    generate({ matrixRoot: outputRoot, cliRoot: fixtureCliRoot });
    defaultCollation.mockRestore();

    agentsContent = readFileSync(path.join(outputRoot, AGENTS_FILE), "utf-8");
  });

  afterAll(async () => {
    await cleanupTempDir(fixtureCliRoot);
    await cleanupTempDir(outputRoot);
  });

  it("names a pair that locale's collation orders against their code units", () => {
    const lithuanian = new Intl.Collator(DIVERGENT_COLLATION_LOCALE);
    const { first, second } = COLLATION_DIVERGENT_AGENT_IDS;

    expect(bytewise(first, second)).toBe(-1);
    expect(Math.sign(lithuanian.compare(first, second))).toBe(1);
  });

  it("emits that pair in code-unit order", () => {
    const { first, second } = COLLATION_DIVERGENT_AGENT_IDS;
    const firstAt = agentsContent.indexOf(`\n  "${first}": {\n`);
    const secondAt = agentsContent.indexOf(`\n  "${second}": {\n`);

    expect(
      collationInForce,
      "the stand-in must have answered for the process default while the generator ran, or this spec proves nothing",
    ).toBe(1);
    expect(firstAt).not.toBe(-1);
    expect(secondAt).not.toBe(-1);
    expect(
      firstAt,
      "the emission order must be the comparator's, not the collation of whichever machine ran the generator",
    ).toBeLessThan(secondAt);
  });
});

// -- Vendored field names ----------------------------------------------------

/**
 * `check` above proves the vendored copy matches whatever `src/cli/types/` currently says. It
 * cannot say what that ought to be, so a rename that stops at the CLI leaves both halves
 * agreeing on the old name. These name the fields the matrix package's consumers read.
 */
describe("the vendored config types", () => {
  const vendoredConfig = readFileSync(path.join(VENDOR_DIR, VENDORED_CONFIG_FILE), "utf-8");

  it("declares a skill entry's provenance as origin", () => {
    expect(vendoredConfig).toContain("  origin: string;");
    expect(vendoredConfig).not.toContain("  source: string;");
  });

  it("declares the marketplace ref and the marketplace name on ProjectConfig", () => {
    expect(vendoredConfig).toContain("  marketplace?: string;");
    expect(vendoredConfig).toContain("  marketplaceName?: string;");
    expect(vendoredConfig).not.toContain("  source?: string;");
  });
});

// -- Check mode --------------------------------------------------------------

describe("check mode", () => {
  it("reports no drift against the committed matrix package", () => {
    expect(check({ matrixRoot: MATRIX_ROOT })).toStrictEqual({ clean: true, drifted: [] });
  });

  it("reports the matrix shape as satisfied by the artefact about to be vendored", () => {
    expect(matrixShapeIssues(BUILT_IN_MATRIX)).toStrictEqual([]);
  });

  it("reports the drifted file and leaves the tree untouched", async () => {
    const copyRoot = await createTempDir("matrix-check-");
    cpSync(MATRIX_SRC, path.join(copyRoot, "src"), { recursive: true });
    writeFileSync(path.join(copyRoot, DRIFTED_FILE), DRIFTED_CONTENT);
    const filesBefore = listFilesRecursive(copyRoot);

    const result = check({ matrixRoot: copyRoot });

    expect(result).toStrictEqual({ clean: false, drifted: [DRIFTED_FILE] });
    expect(
      readFileSync(path.join(copyRoot, DRIFTED_FILE), "utf-8"),
      "check must not rewrite the file it reports as drifted",
    ).toBe(DRIFTED_CONTENT);
    expect(listFilesRecursive(copyRoot)).toStrictEqual(filesBefore);

    await cleanupTempDir(copyRoot);
  });
});

// -- Matrix shape ------------------------------------------------------------

/**
 * Byte-comparison says the vendored copy matches `src/cli/types/generated/matrix.ts`. It cannot
 * say that file still holds a matrix — a generator change that emits a differently-shaped one
 * vendors it faithfully and turns every read model in `packages/matrix` red at import time
 * instead. `matrixShapeIssues` is what the gate asks that question with.
 */
describe("matrix shape", () => {
  it("names the path of a skill that lost its category", () => {
    const { category: _dropped, ...skillWithoutCategory } = SKILLS.react;

    const issues = matrixShapeIssues({
      ...BUILT_IN_MATRIX,
      skills: { [SKILLS.react.id]: skillWithoutCategory },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(`skills.${SKILLS.react.id}.category`);
  });

  it("names the path of a catalogue whose stacks are not a list", () => {
    const issues = matrixShapeIssues({ ...BUILT_IN_MATRIX, suggestedStacks: {} });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("suggestedStacks");
  });

  it("reports something that is not a matrix at all", () => {
    expect(matrixShapeIssues({}).length).toBeGreaterThan(0);
  });
});
