import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { agentFieldsReadBy } from "./helpers/template-field-reads.js";
import type { AgentConfig } from "../../types/index.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const SHIPPED_TEMPLATES = "src/agents/_templates/**/*.liquid";

/**
 * `Required<AgentConfig>` makes `tsc` hold this roster to the type both ways; only keys are read.
 */
const EVERY_AGENT_CONFIG_FIELD: Required<AgentConfig> = {
  name: "web-developer",
  title: "Web Developer",
  description: "Builds web interfaces",
  model: "opus",
  codexModel: "gpt-5.6-terra",
  effort: "high",
  tools: [],
  disallowedTools: [],
  permissionMode: "default",
  isolation: "worktree",
  hooks: {},
  experimental: { cacheTtl: "1h" },
  outputFormat: "markdown",
  path: "developer/web-developer",
  sourceRoot: "/src",
  agentBaseDir: "src/agents",
  domain: "web",
  custom: false,
  skills: [],
};

async function shippedTemplates(): Promise<Array<{ file: string; source: string }>> {
  const files = await fg(SHIPPED_TEMPLATES, { cwd: CLI_ROOT });
  return Promise.all(
    files.sort().map(async (file) => ({
      file,
      source: await readFile(path.join(CLI_ROOT, file), "utf8"),
    })),
  );
}

/**
 * `tsc`, ESLint and the engine (`strictVariables: false`) all ignore a template asking for a field
 * the model lacks. A subset check: most of `AgentConfig` is not frontmatter.
 */
describe("the shipped agent templates read fields the model carries", () => {
  it("asks for no field AgentConfig does not have", async () => {
    const templates = await shippedTemplates();
    const modelFields = Object.keys(EVERY_AGENT_CONFIG_FIELD);

    const unknown = templates.flatMap(({ file, source }) =>
      agentFieldsReadBy(source)
        .filter((field) => !modelFields.includes(field))
        .map((field) => `${file}: agent.${field}`),
    );

    expect(
      unknown,
      "a template asks the model for a field it does not carry — with strictVariables:false that renders as nothing at all, and the compiled sub-agent loses it silently",
    ).toStrictEqual([]);
  });

  /** Subject guard: an empty glob or reader would otherwise pass the subset check. */
  it("reads the fields the frontmatter block is built from", async () => {
    const templates = await shippedTemplates();
    const readEverywhere = new Set(templates.flatMap(({ source }) => agentFieldsReadBy(source)));

    expect([...readEverywhere].sort()).toStrictEqual([
      "description",
      "disallowedTools",
      "effort",
      "experimental",
      "hooks",
      "isolation",
      "model",
      "name",
      "permissionMode",
      "title",
      "tools",
    ]);
  });
});
