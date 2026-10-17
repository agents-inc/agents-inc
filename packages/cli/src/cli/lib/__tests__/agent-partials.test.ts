import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "./factories/agent-factories.js";
import { AGENT_NAMES } from "../../types/generated/source-types.js";
import type { CompiledAgentData } from "../../types/index.js";
import type { AgentName } from "../../types/generated/source-types.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = path.join(CLI_ROOT, "src", "agents");
const TEMPLATES_DIR = "_templates";
const AGENT_TEMPLATE = path.join(AGENTS_DIR, TEMPLATES_DIR, "agent.liquid");

/** The body half: `agent.liquid` is frontmatter only, and the wrappers live in the body. */
const AGENT_BODY_TEMPLATE = path.join(AGENTS_DIR, TEMPLATES_DIR, "agent-body.liquid");

async function wholeAgentTemplate(): Promise<string> {
  const [frontmatter, body] = await Promise.all([
    readFile(AGENT_TEMPLATE, "utf8"),
    readFile(AGENT_BODY_TEMPLATE, "utf8"),
  ]);

  return `${frontmatter}${body}`;
}

const AGENT_GLOB = "*/*";

/**
 * Required partials (read without a fallback, so an agent missing one cannot compile), their
 * technique tag, and the wrapper the template adds around them. A partial opening with that wrapper
 * would emit the tag twice; `template` is asserted first so the negative polices a real wrapper.
 */
const REQUIRED_PARTIALS = [
  {
    file: "identity.md",
    requires: "<domain_scope>",
    wrapper: "role",
    template: "<role>\n{{ identity }}\n</role>",
  },
] as const;

/**
 * Optional partials: no presence roster, since a correct agent may omit them, but a copy that
 * exists owes its technique and must not self-wrap. `renderKey` names a field so the guard is
 * proved by rendering, not by a template substring.
 */
const OPTIONAL_PARTIALS = [
  {
    file: "critical-requirements.md",
    requires: "<self_correction_triggers>",
    wrapper: "critical_requirements",
    template: "<critical_requirements>\n{{ criticalRequirementsTop }}\n</critical_requirements>",
    renderKey: "criticalRequirementsTop",
  },
  {
    file: "critical-reminders.md",
    requires: "<post_action_reflection>",
    wrapper: "critical_reminders",
    template: "<critical_reminders>\n{{ criticalReminders }}\n</critical_reminders>",
    renderKey: "criticalReminders",
  },
] as const satisfies readonly {
  file: string;
  requires: string;
  wrapper: string;
  template: string;
  renderKey: keyof CompiledAgentData;
}[];

/**
 * A ledger of which agents ship each optional partial, so the conditional assertions have a
 * subject. Typed to `AgentName`, so retiring an agent is a compile error here.
 */
const OPTIONAL_PARTIAL_SHIPPERS = {
  "critical-requirements.md": [
    "agent-summoner",
    "ai-developer",
    "ai-researcher",
    "ai-tester",
    "api-developer",
    "api-researcher",
    "api-tester",
    "cli-developer",
    "cli-researcher",
    "cli-tester",
    "codex-keeper",
    "convention-keeper",
    "pm",
    "reviewer",
    "skill-summoner",
    "web-developer",
    "web-researcher",
    "web-tester",
  ],
  "critical-reminders.md": [
    "agent-summoner",
    "ai-developer",
    "ai-researcher",
    "ai-tester",
    "api-developer",
    "api-researcher",
    "api-tester",
    "cli-developer",
    "cli-researcher",
    "cli-tester",
    "codex-keeper",
    "convention-keeper",
    "reviewer",
    "skill-summoner",
    "web-developer",
    "web-researcher",
    "web-tester",
  ],
} as const satisfies Record<(typeof OPTIONAL_PARTIALS)[number]["file"], readonly AgentName[]>;

const PARTIAL_CONTRACTS = [...REQUIRED_PARTIALS, ...OPTIONAL_PARTIALS] as const;

async function agentNamesOnDisk(): Promise<string[]> {
  const dirs = await fg(AGENT_GLOB, {
    cwd: AGENTS_DIR,
    onlyDirectories: true,
    ignore: [`${TEMPLATES_DIR}/**`],
  });
  return dirs.map((dir) => path.basename(dir)).sort();
}

async function everyCopyOf(file: string): Promise<{ agent: string; source: string }[]> {
  const paths = await fg(`${AGENT_GLOB}/${file}`, { cwd: AGENTS_DIR });
  return Promise.all(
    paths.map(async (relative) => ({
      agent: path.basename(path.dirname(relative)),
      source: await readFile(path.join(AGENTS_DIR, relative), "utf8"),
    })),
  );
}

const RENDER_VERSION = "0.0.0-partials";

/** Every other partial empty, so a wrapper assertion is answered by the template, not by prose. */
async function renderWith(partials: Partial<CompiledAgentData>): Promise<string> {
  const engine = await createLiquidEngine();

  return renderAgent(
    engine,
    {
      ...createMockCompiledAgentData(),
      identity: "",
      playbook: "",
      output: "",
      criticalRequirementsTop: "",
      criticalReminders: "",
      ...partials,
    },
    RENDER_VERSION,
  );
}

/** Line equality, not a substring: `skill-summoner` legitimately names both tags in backticks. */
function selfWraps(source: string, wrapper: string): boolean {
  return source
    .split("\n")
    .some((line) => line.trim() === `<${wrapper}>` || line.trim() === `</${wrapper}>`);
}

describe("every agent partial carries its technique and none carries the template's wrapper", () => {
  it("holds one directory per generated agent name", async () => {
    expect(
      await agentNamesOnDisk(),
      "the partials tree and AGENT_NAMES describe one roster — a directory with no name, or a name with no directory, is one of them missing",
    ).toStrictEqual([...AGENT_NAMES].sort());
  });

  it.each(PARTIAL_CONTRACTS)(
    "agent.liquid supplies the wrapper around $file",
    async ({ template }) => {
      expect(
        await wholeAgentTemplate(),
        "the template no longer adds this wrapper, so the partials below are being checked against nothing",
      ).toContain(template);
    },
  );

  it.each(OPTIONAL_PARTIALS)(
    "agent.liquid drops the $file section for an agent that ships no such file",
    async ({ wrapper, renderKey }) => {
      const withTheFile = await renderWith({ [renderKey]: `${wrapper} content` });
      const withoutTheFile = await renderWith({ [renderKey]: "" });

      expect(
        withTheFile,
        "the render carrying this partial does not open its wrapper, so the absence below proves nothing",
      ).toContain(`<${wrapper}>`);
      expect(
        withoutTheFile,
        "an agent that omits the partial compiles an empty wrapper around nothing — assert the render rather than the template text, which a no-op {% if %} satisfies",
      ).not.toContain(`<${wrapper}>`);
    },
  );

  it.each(OPTIONAL_PARTIALS)(
    "$file is shipped by the agents named as shipping it",
    async ({ file }) => {
      const copies = await everyCopyOf(file);

      expect(
        copies.map((copy) => copy.agent).sort(),
        `the two assertions below read every ${file} on disk and pass over an empty set — this names the set`,
      ).toStrictEqual([...OPTIONAL_PARTIAL_SHIPPERS[file]].sort());
    },
  );

  it.each(REQUIRED_PARTIALS)("every agent directory holds $file", async ({ file }) => {
    const copies = await everyCopyOf(file);

    expect(
      copies.map((copy) => copy.agent).sort(),
      `an agent with no ${file} is one the two assertions below never read`,
    ).toStrictEqual(await agentNamesOnDisk());
  });

  it.each(PARTIAL_CONTRACTS)(
    "every $file an agent ships carries $requires",
    async ({ file, requires }) => {
      const without = (await everyCopyOf(file))
        .filter((copy) => !copy.source.includes(requires))
        .map((copy) => copy.agent);

      expect(without, `${requires} belongs in ${file} and in no sibling partial`).toStrictEqual([]);
    },
  );

  it.each(PARTIAL_CONTRACTS)("no $file adds the wrapper agent.liquid owns", async (contract) => {
    const selfWrapped = (await everyCopyOf(contract.file))
      .filter((copy) => selfWraps(copy.source, contract.wrapper))
      .map((copy) => copy.agent);

    expect(
      selfWrapped,
      `a partial opening with <${contract.wrapper}> emits it twice around the same content — the template adds it`,
    ).toStrictEqual([]);
  });
});
