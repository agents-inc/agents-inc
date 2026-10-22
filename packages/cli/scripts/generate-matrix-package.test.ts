import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { STANDARD_FILES } from "../src/cli/consts.js";
import { bytewise } from "../src/cli/utils/string.js";
import { renderAgentYaml } from "../src/cli/lib/__tests__/content-generators.js";
import { AGENT_DEFS } from "../src/cli/lib/__tests__/mock-data/mock-agents.js";
import { SKILLS } from "../src/cli/lib/__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { BUILT_IN_MATRIX } from "../src/cli/types/generated/matrix.js";

import { generate, matrixShapeIssues } from "./generate-matrix-package.js";

import type { GeneratedAgentDefinition } from "@workspace/matrix";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const MATRIX_ROOT = path.resolve(CLI_ROOT, "../matrix");
const MATRIX_SRC = path.join(MATRIX_ROOT, "src");
const VENDOR_DIR = path.join(MATRIX_SRC, "vendor");

const VENDOR_PREFIX = "src/vendor/";
const AGENTS_FILE = "src/generated/agents.ts";
const CLI_TYPES_DIR = "src/cli/types";
const CLI_AGENTS_DIR = "src/agents";

const DEVELOPER_FLAVOR = "developer";
const TESTER_FLAVOR = "tester";
const REVIEWER_FLAVOR = "reviewer";

const listFilesRecursive = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();

const modifiedAt = (filePath: string): bigint => statSync(filePath, { bigint: true }).mtimeNs;

const fixtureTypeSource = (relativePath: string): string => `// fixture stub for ${relativePath}\n`;

/** `name` widened to string so a fixture can carry an id outside the AgentName union. */
type FixtureAgent = Omit<(typeof AGENT_DEFS)[keyof typeof AGENT_DEFS], "name"> & { name: string };

type UnconditionalAgentField = "id" | "title" | "description" | "tools" | "flavor" | "path";

type ConditionalAgentMetadata = Required<Omit<GeneratedAgentDefinition, UnconditionalAgentField>>;

/**
 * Every field forwarded only when declared. No shipped agent declares most of them, so byte
 * comparison cannot see a dropped spread; `Required` makes a new field fail to compile here.
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

/** The entry {@link CONDITIONAL_METADATA} produces, spelled out so the field order is pinned. */
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

/** Lithuanian collates `y` right after `i`, reversing this pair against code-unit order. */
const DIVERGENT_COLLATION_LOCALE = "lt";

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

    // Simulates a machine whose default collation is Lithuanian.
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

describe("matrix shape", () => {
  it("reports the matrix shape as satisfied by the artefact about to be vendored", () => {
    expect(matrixShapeIssues(BUILT_IN_MATRIX)).toStrictEqual([]);
  });

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
