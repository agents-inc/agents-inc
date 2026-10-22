/**
 * A partial is prose, byte for byte, except the opt-in source-folder token, which an author can
 * escape to name it. The token is a literal so a rename the `.md` files miss fails.
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ROOT, STANDARD_DIRS, STANDARD_FILES } from "../../consts.js";
import { compileAgentForHost, createLiquidEngine } from "../compiler.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { createMockAgentConfig } from "./factories/agent-factories.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import type { AgentName } from "../../types/index.js";

/** Three shapes in one line because a Liquid render mangles each differently. */
const LIQUID_LOOKING_PROSE =
  "Use ${{ secrets.DB_PASSWORD }} in GitHub Actions. Also {{ user.name }} and {% if x %}y{% endif %}.";

const PROSE_AFTER_A_RENDER = "Use $ in GitHub Actions. Also  and .";

const SOURCE_FOLDER_TOKEN = "@@SOURCE_FOLDER@@";

const SOURCE_FOLDER_ESCAPE = `\\${SOURCE_FOLDER_TOKEN}`;

/** Rendered text, kept literal so it cannot move with the partial; composed from the token. */
const SUMMONER_TEACHES_THE_TOKEN = `The one exception is \`${SOURCE_FOLDER_TOKEN}\`, which the compile step`;

/** Bound to the constants, so a partial added to `readAgentFiles` and missed here fails. */
const AGENT_PARTIALS = [
  STANDARD_FILES.IDENTITY_MD,
  STANDARD_FILES.PLAYBOOK_MD,
  STANDARD_FILES.OUTPUT_MD,
  STANDARD_FILES.CRITICAL_REQUIREMENTS_MD,
  STANDARD_FILES.CRITICAL_REMINDERS_MD,
] as const;

/** A real `AgentName`: `compileAgentForHost` takes the union, so a made-up name is unreachable. */
const PROJECT_AGENT = "web-developer" satisfies AgentName;

const SUMMONER = "agent-summoner" satisfies AgentName;

const SUMMONER_PATH = "meta/agent-summoner";

const SUMMONER_PLAYBOOK_MARKER = "## The Agent Structure";

function proseIn(partial: string): string {
  return `${partial} — ${LIQUID_LOOKING_PROSE}`;
}

function optedInLine(partial: string): string {
  return `Author a ${partial} sub-agent into \`${SOURCE_FOLDER_TOKEN}/${STANDARD_DIRS.AGENTS}/\`.`;
}

function substitutedLine(partial: string, relName: string): string {
  return optedInLine(partial).replace(SOURCE_FOLDER_TOKEN, relName);
}

function escapedLine(partial: string): string {
  return `A ${partial} names the token itself as \`${SOURCE_FOLDER_ESCAPE}\`.`;
}

function taughtLine(partial: string): string {
  return escapedLine(partial).replace(SOURCE_FOLDER_ESCAPE, SOURCE_FOLDER_TOKEN);
}

function optingInBody(partial: string): string {
  return `${proseIn(partial)}\n\n${optedInLine(partial)}\n`;
}

/** The summoner's situation: one partial that both asks for the folder and names the token. */
function teachingBody(partial: string): string {
  return `${proseIn(partial)}\n\n${optedInLine(partial)}\n\n${escapedLine(partial)}\n`;
}

/**
 * Every line goes in all five partials, because the substitution enumerates the fields by hand.
 * Written under `sourceFolderInUse`, where `loadAgentDefinitions` reads a project's own agents.
 */
async function writeProjectAgentPartials(
  projectDir: string,
  body: (partial: string) => string,
): Promise<string> {
  const agentBaseDir = `${sourceFolderInUse(projectDir, "claude").relName}/${STANDARD_DIRS.AGENTS}`;
  const agentDir = path.join(projectDir, agentBaseDir, PROJECT_AGENT);
  await mkdir(agentDir, { recursive: true });

  for (const partial of AGENT_PARTIALS) {
    await writeFile(path.join(agentDir, partial), body(partial), "utf-8");
  }

  return agentBaseDir;
}

async function projectAgentCompiledIn(
  projectDir: string,
  body: (partial: string) => string = optingInBody,
): Promise<string> {
  const agentBaseDir = await writeProjectAgentPartials(projectDir, body);
  const engine = await createLiquidEngine(projectDir);

  return compileAgentForHost(
    "claude",
    PROJECT_AGENT,
    createMockAgentConfig(PROJECT_AGENT, [], { agentBaseDir, sourceRoot: projectDir }),
    projectDir,
    engine,
  );
}

async function summonerCompiledFor(installRoot: string): Promise<string> {
  const engine = await createLiquidEngine(installRoot);

  return compileAgentForHost(
    "claude",
    SUMMONER,
    createMockAgentConfig(SUMMONER, [], { path: SUMMONER_PATH, sourceRoot: PROJECT_ROOT }),
    PROJECT_ROOT,
    engine,
  );
}

describe("what a compile does to the text an author wrote in a partial", () => {
  const temps: string[] = [];

  afterEach(async () => {
    await Promise.all(temps.splice(0).map(cleanupTempDir));
  });

  const tempProject = async (prefix: string): Promise<string> => {
    const dir = await createTempDir(prefix);
    temps.push(dir);
    return dir;
  };

  it("carries every partial's liquid-looking prose through byte for byte", async () => {
    const projectDir = await tempProject("partial-prose-");

    const compiled = await projectAgentCompiledIn(projectDir);

    // Subject guard: all five partials reached the render (the marker survives a Liquid render).
    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(`${partial} —`)),
      "the render picked up only some of the fixture's partials, so the roster below is about text that was never there",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(proseIn(partial))),
      "a partial's prose was rewritten on the way into the compiled agent — anything that looks like template syntax in a partial is text, and a partial that reaches the Liquid engine is also the template-injection boundary sanitizeLiquidSyntax exists to hold, gone",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(
      compiled,
      "the compiled agent carries what a Liquid render leaves behind, so the five partials were rendered rather than inlined",
    ).not.toContain(PROSE_AFTER_A_RENDER);
  });

  it("substitutes the one token a partial opts into with the folder this install writes", async () => {
    const projectDir = await tempProject("partial-token-");
    const relName = sourceFolderInUse(projectDir, "claude").relName;

    const compiled = await projectAgentCompiledIn(projectDir);

    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(substitutedLine(partial, relName))),
      "a partial's opted-in token was not substituted, so an agent is told to author into a folder this install does not have",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(compiled, "the raw token reached the compiled agent").not.toContain(SOURCE_FOLDER_TOKEN);
  });

  it("leaves an escaped token naming the token, with the opt-in beside it still substituted", async () => {
    const projectDir = await tempProject("partial-token-escape-");
    const relName = sourceFolderInUse(projectDir, "claude").relName;

    const compiled = await projectAgentCompiledIn(projectDir, teachingBody);

    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(`${partial} —`)),
      "the render picked up only some of the fixture's partials, so the rosters below are about text that was never there",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(taughtLine(partial))),
      "an escaped token was substituted anyway, so a partial that teaches the token teaches one install's folder literal instead — which is the defect the token exists to prevent, arriving in the one agent that authors partials",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(
      AGENT_PARTIALS.filter((partial) => compiled.includes(substitutedLine(partial, relName))),
      "the instruction beside the escape stopped being substituted, so escaping one occurrence disarmed the rest of the partial",
    ).toStrictEqual([...AGENT_PARTIALS]);
    expect(
      compiled,
      "the escape reached the compiled agent unconsumed, so an installed prompt carries the author's backslash",
    ).not.toContain(SOURCE_FOLDER_ESCAPE);
  });

  it("names the folder this install writes in the compiled agent-summoner", async () => {
    const installRoot = await tempProject("summoner-token-");
    const relName = sourceFolderInUse(installRoot, "claude").relName;

    const compiled = await summonerCompiledFor(installRoot);

    expect(
      compiled,
      "the render picked up no agent-summoner playbook, so the folder assertions below are about an empty string",
    ).toContain(SUMMONER_PLAYBOOK_MARKER);
    expect(
      compiled,
      "the shipped partials stopped naming the folder this install writes — the one agent whose own text has to be install-specific is not",
    ).toContain(`${relName}/${STANDARD_DIRS.AGENTS}/`);
    expect(
      compiled,
      "the compiled agent-summoner names the token nowhere: the paragraph teaching it was itself substituted, so the one agent whose job is authoring partials is told to spell one install's folder literally",
    ).toContain(SUMMONER_TEACHES_THE_TOKEN);
    expect(
      compiled,
      "a path in the compiled agent-summoner is rooted at the raw token, so nothing substituted it and an agent is sent to author into a folder literally named @@SOURCE_FOLDER@@",
    ).not.toContain(`${SOURCE_FOLDER_TOKEN}/`);
  });
});
