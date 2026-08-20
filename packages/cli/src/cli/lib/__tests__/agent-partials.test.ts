import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { AGENT_NAMES } from "../../types/generated/source-types.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = path.join(CLI_ROOT, "src", "agents");
const TEMPLATES_DIR = "_templates";
const AGENT_TEMPLATE = path.join(AGENTS_DIR, TEMPLATES_DIR, "agent.liquid");

/** Every agent directory: two levels down, `<group>/<agent>/`. */
const AGENT_GLOB = "*/*";

/**
 * One partial, the technique tag it owes, and the wrapper `agent.liquid` puts AROUND it.
 *
 * Both halves are needed and the negative one matters more. A missing technique degrades one
 * agent and shows up in a read; a partial that opens with the wrapper the template already adds
 * emits the tag twice around the same content, which a diff review reading one file at a time
 * cannot see at all — on its own the file looks like well-formed markup. `skill-summoner` shipped
 * both partials that way, and the doubling reached every compiled copy.
 *
 * `template` is the exact block the template renders this partial into, asserted first: a
 * template that stopped wrapping would leave the negative below policing a tag nobody adds.
 */
const PARTIAL_CONTRACTS = [
  {
    file: "identity.md",
    requires: "<domain_scope>",
    wrapper: "role",
    template: "<role>\n{{ identity }}\n</role>",
  },
  {
    file: "critical-requirements.md",
    requires: "<self_correction_triggers>",
    wrapper: "critical_requirements",
    template: "<critical_requirements>\n{{ criticalRequirementsTop }}\n</critical_requirements>",
  },
  {
    file: "critical-reminders.md",
    requires: "<post_action_reflection>",
    wrapper: "critical_reminders",
    template: "<critical_reminders>\n{{ criticalReminders }}\n</critical_reminders>",
  },
] as const;

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

  it.each(PARTIAL_CONTRACTS)("every agent directory holds $file", async ({ file }) => {
    const copies = await everyCopyOf(file);

    expect(
      copies.map((copy) => copy.agent).sort(),
      `an agent with no ${file} is one the two assertions below never read`,
    ).toStrictEqual(await agentNamesOnDisk());
  });

  it.each(PARTIAL_CONTRACTS)("every $file carries $requires", async ({ file, requires }) => {
    const without = (await everyCopyOf(file))
      .filter((copy) => !copy.source.includes(requires))
      .map((copy) => copy.agent);

    expect(without, `${requires} belongs in ${file} and in no sibling partial`).toStrictEqual([]);
  });

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
