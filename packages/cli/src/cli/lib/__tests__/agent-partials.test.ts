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

/** Every agent directory: two levels down, `<group>/<agent>/`. */
const AGENT_GLOB = "*/*";

/**
 * The partial every agent owes, its technique tag, and the wrapper `agent.liquid` puts AROUND it.
 *
 * Both halves are needed and the negative one matters more. A missing technique degrades one
 * agent and shows up in a read; a partial that opens with the wrapper the template already adds
 * emits the tag twice around the same content, which a diff review reading one file at a time
 * cannot see at all — on its own the file looks like well-formed markup. `skill-summoner` shipped
 * both partials that way, and the doubling reached every compiled copy.
 *
 * `template` is the exact block the template renders this partial into, asserted first: a
 * template that stopped wrapping would leave the negative below policing a tag nobody adds.
 *
 * Required means `readAgentFiles` in `lib/compiler.ts` reaches it through `readFile` rather than
 * `readFileOptional`, so an agent missing it cannot compile at all. That is what earns the
 * presence roster below, and it is why the two partials beside it do not get one.
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
 * The partials an agent may ship or omit, each with the render field that carries it.
 *
 * `readAgentFiles` reads both through `readFileOptional` defaulting to `""`, and the
 * `agent-summoner` playbook's "The Agent Structure" tells an author the same thing: of the five
 * markdown partials only `identity.md` and `playbook.md` are required. So an agent that follows
 * the shipped instructions and ships neither of these is a valid agent, and no PRESENCE roster is
 * asserted over them — a roster would redden on a correctly authored agent. What survives is
 * conditional: a copy that DOES exist owes its technique and must not self-wrap.
 *
 * `renderKey` is what makes the optionality real, and it names a field rather than a template
 * substring for a reason. The guard used to be asserted as the literal
 * `{% if criticalRequirementsTop != "" %}` appearing anywhere in `agent.liquid`, which is a claim
 * about the template's TEXT rather than about what it renders: move that tag inside the wrapper —
 * or leave it in place as an empty `{% if %}{% endif %}` — and the substring survives while every
 * agent without the file compiles `<critical_requirements></critical_requirements>` around
 * nothing. The render below cannot be satisfied that way.
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
 * Which agents ship each optional partial — a ledger of what is on disk, not a contract that
 * every agent must carry one.
 *
 * The two conditional assertions at the foot of this file only ever read files that ARE there, so
 * both are satisfied by an empty set: delete all eighteen `critical-requirements.md` and every
 * assertion in this file still passes, the presence roster above covering `identity.md` alone by
 * design. This is what gives them a subject.
 *
 * A ledger rather than a roster because the two fail differently. Deriving the expected list from
 * {@link agentNamesOnDisk} would make an agent that legitimately omits an optional partial a
 * failure; naming the shippers makes it an edit — add or remove the name here, beside the others.
 * Constrained to `AgentName` so retiring an agent is a compile error at the line holding its name
 * rather than a `toStrictEqual` searching for a directory nothing creates.
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
    "pm",
    "reviewer",
    "skill-summoner",
    "web-developer",
    "web-researcher",
    "web-tester",
  ],
} as const satisfies Record<(typeof OPTIONAL_PARTIALS)[number]["file"], readonly AgentName[]>;

/** Both kinds, for the contracts that hold however the partial came to be on disk. */
const PARTIAL_CONTRACTS = [...REQUIRED_PARTIALS, ...OPTIONAL_PARTIALS] as const;

/** The agents the partials tree holds, in the spelling `AGENT_NAMES` uses. */
async function agentNamesOnDisk(): Promise<string[]> {
  const dirs = await fg(AGENT_GLOB, {
    cwd: AGENTS_DIR,
    onlyDirectories: true,
    ignore: [`${TEMPLATES_DIR}/**`],
  });
  return dirs.map((dir) => path.basename(dir)).sort();
}

/** Every copy of one partial, paired with the agent that owns it. */
async function everyCopyOf(file: string): Promise<{ agent: string; source: string }[]> {
  const paths = await fg(`${AGENT_GLOB}/${file}`, { cwd: AGENTS_DIR });
  return Promise.all(
    paths.map(async (relative) => ({
      agent: path.basename(path.dirname(relative)),
      source: await readFile(path.join(AGENTS_DIR, relative), "utf8"),
    })),
  );
}

/** A version string the render is handed; the provenance stamp is not this file's subject. */
const RENDER_VERSION = "0.0.0-partials";

/**
 * The shipped template rendered with every partial empty except the fields named.
 *
 * Empty content fields are what make the answer the TEMPLATE's: a fixture carrying prose would
 * satisfy a wrapper assertion with its own text rather than with the guard under test.
 */
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

/**
 * Whether a LINE of this partial is the wrapper tag, opening or closing.
 *
 * Line equality rather than a substring: `skill-summoner` legitimately names both tags inside
 * backticks, because the structure it instructs an author about is the structure it is itself
 * written in. A `toContain` would condemn that sentence and leave nothing said about the shape
 * that matters.
 */
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
        await readFile(AGENT_TEMPLATE, "utf8"),
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
