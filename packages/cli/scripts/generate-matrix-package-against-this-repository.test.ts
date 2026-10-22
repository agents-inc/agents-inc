import { cpSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { STANDARD_FILES } from "../src/cli/consts.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { AGENT_NAMES } from "../src/cli/types/agents.js";

import { check, generate } from "./generate-matrix-package.js";

import type { AgentName, AgentYamlConfig } from "../src/cli/types/index.js";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const MATRIX_ROOT = path.resolve(CLI_ROOT, "../matrix");
const MATRIX_SRC = path.join(MATRIX_ROOT, "src");
const VENDOR_DIR = path.join(MATRIX_SRC, "vendor");

const VENDOR_PREFIX = "src/vendor/";
const AGENTS_FILE = "src/generated/agents.ts";
const CLI_AGENTS_DIR = "src/agents";

const DRIFTED_FILE = "src/vendor/matrix.ts";
const DRIFTED_CONTENT = "// hand-edited after generation\n";

const META_FLAVOR = "meta";
const PLANNING_FLAVOR = "planning";

/** Typed so retiring either agent is a compile error here. */
const AGENT_SUMMONER: AgentName = "agent-summoner";
const PM: AgentName = "pm";

/**
 * The expected entry, with values read from the agent's own metadata.yaml so the test pins
 * provenance rather than pasted prose. Fields are spelled out so the roster is what is tested.
 */
function agentDefinitionEntry(flavor: string, agent: AgentName): string {
  const metadataPath = path.join(
    CLI_ROOT,
    CLI_AGENTS_DIR,
    flavor,
    agent,
    STANDARD_FILES.AGENT_METADATA_YAML,
  );

  // Parse boundary: the CLI's own metadata.yaml. A missing field renders `undefined` and fails.
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

const AGENT_SUMMONER_ENTRY = agentDefinitionEntry(META_FLAVOR, AGENT_SUMMONER);

const PM_ENTRY = agentDefinitionEntry(PLANNING_FLAVOR, PM);

const listFilesRecursive = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();

const readEmitted = (root: string, relativePaths: string[]): Record<string, string> =>
  Object.fromEntries(
    relativePaths.map((rel) => [rel, readFileSync(path.join(root, rel), "utf-8")]),
  );

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
