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

import { STANDARD_FILES } from "../src/cli/consts.js";
import { renderAgentYaml } from "../src/cli/lib/__tests__/content-generators.js";
import { AGENT_DEFS } from "../src/cli/lib/__tests__/mock-data/mock-agents.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { AGENT_NAMES } from "../src/cli/types/agents.js";

import { check, generate } from "./generate-matrix-package.js";

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

const DEVELOPER_FLAVOR = "developer";
const TESTER_FLAVOR = "tester";

/** Spot-checks against the real `src/agents/meta/agent-summoner/metadata.yaml`. */
const AGENT_SUMMONER_ENTRY = [
  '  "agent-summoner": {',
  '    "id": "agent-summoner",',
  '    "title": "Agent Summoner Agent",',
  '    "description": "Expert in creating agents and skills - understands agent architecture deeply - invoke when you need to create, improve, or analyze agents/skills",',
  '    "model": "opus",',
  '    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],',
  '    "flavor": "meta",',
  '    "path": "meta/agent-summoner",',
  "  },",
].join("\n");

/** Spot-checks against the real `src/agents/planning/pm/metadata.yaml`. */
const PM_ENTRY = [
  '  "pm": {',
  '    "id": "pm",',
  '    "title": "PM and Architect Agent",',
  '    "description": "Creates implementation specs for any feature - frontend, backend, CLI, and AI alike - by researching the codebase\'s real patterns and naming the ones to follow, with fenced scope and verifiable success criteria; domain planning frameworks arrive via meta-planning skills - invoke BEFORE a developer for any new feature",',
  '    "model": "opus",',
  '    "tools": ["Read","Write","Edit","Grep","Glob","Bash"],',
  '    "flavor": "planning",',
  '    "path": "planning/pm",',
  "  },",
].join("\n");

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

type FixtureAgent = (typeof AGENT_DEFS)[keyof typeof AGENT_DEFS];

function writeFixtureAgent(cliRoot: string, flavor: string, agent: FixtureAgent): void {
  const agentDir = path.join(cliRoot, CLI_AGENTS_DIR, flavor, agent.name);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
    renderAgentYaml(agent.name, agent.description, { title: agent.title, tools: agent.tools }),
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

// -- Check mode --------------------------------------------------------------

describe("check mode", () => {
  it("reports no drift against the committed matrix package", () => {
    expect(check({ matrixRoot: MATRIX_ROOT })).toStrictEqual({ clean: true, drifted: [] });
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
