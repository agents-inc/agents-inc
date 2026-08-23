import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { agentFieldsReadBy } from "./helpers/template-field-reads.js";
import type { AgentConfig } from "../../types/index.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Where the shipped Liquid templates live — the ones a compile renders when nothing overrides them. */
const SHIPPED_TEMPLATES = "src/agents/_templates/**/*.liquid";

/**
 * A value the COMPILER has proved carries every property of `AgentConfig`, optional ones
 * included, so `Object.keys` of it is the property roster rather than a second copy of one.
 *
 * `Required<AgentConfig>` is doing the binding, and it is the whole reason this is a gate rather
 * than a hand-maintained list: a field added to `AgentConfig` and forgotten here fails `tsc` at
 * this literal, so the roster cannot silently stop describing the type. A field REMOVED from the
 * type fails here too, which is the direction that matters more — a template still asking for it
 * would otherwise keep resolving to `undefined` in silence.
 *
 * The values are irrelevant and never rendered; only the keys are read.
 */
const EVERY_AGENT_CONFIG_FIELD: Required<AgentConfig> = {
  name: "web-developer",
  title: "Web Developer",
  description: "Builds web interfaces",
  model: "opus",
  effort: "high",
  tools: [],
  disallowedTools: [],
  permissionMode: "default",
  hooks: {},
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
 * Every field a shipped template asks the model for is a field the model has.
 *
 * `agent.liquid` spelled two of them snake_case — `agent.permission_mode` and
 * `agent.disallowed_tools` — against a `AgentConfig` that has always been camelCase, so a
 * compiled sub-agent silently lost both. Four things that normally catch a name that no longer
 * names anything were all inapplicable at once: `tsc` does not open a `.liquid` file, ESLint
 * does not lint one, the engine runs `strictVariables: false` so the lookup does not throw, and
 * `permissionMode`'s `default:` filter kept emitting the key so the output still looked right.
 *
 * This is the missing fifth. It is deliberately one-directional — a field the type has and no
 * template reads is not a defect, since most of `AgentConfig` is not frontmatter — so the
 * assertion is a subset check rather than an equality, and the subject guard below is what stops
 * a subset check over an empty set from passing for free.
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

  /**
   * The subject guard, and it carries the red for two failures the assertion above cannot
   * distinguish from success: a glob that stopped matching any template, and a reader that
   * stopped matching any lookup. Either leaves the check above comparing an empty list to an
   * empty list, which is the shape every vacuous gate has.
   */
  it("reads the fields the frontmatter block is built from", async () => {
    const templates = await shippedTemplates();
    const readEverywhere = new Set(templates.flatMap(({ source }) => agentFieldsReadBy(source)));

    expect([...readEverywhere].sort()).toStrictEqual([
      "description",
      "disallowedTools",
      "effort",
      "model",
      "name",
      "permissionMode",
      "title",
      "tools",
    ]);
  });
});
