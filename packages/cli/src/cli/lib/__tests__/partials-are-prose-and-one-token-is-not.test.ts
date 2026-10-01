/**
 * A partial is PROSE, and exactly one token in it is not — unless the author escapes it.
 *
 * Everything an author wrote in one of a sub-agent's five markdown partials reaches the compiled
 * agent byte for byte — `${{ secrets.X }}`, `{{ user.name }}`, `{% if x %}…{% endif %}` and
 * anything else that merely LOOKS like template syntax is text. The single exception is
 * {@link SOURCE_FOLDER_TOKEN}, which the repository's own partials opt into so `agent-summoner`
 * can name the folder THIS install writes rather than a literal that is wrong on half of them.
 * {@link SOURCE_FOLDER_ESCAPE} is how a partial names that token instead of asking for the folder,
 * and `agent-summoner` — the one agent whose job is authoring partials — is the reason it exists:
 * the paragraph teaching the token was itself substituted, so every compiled copy read "the one
 * exception is `.agents-inc/claude`" and named the token nowhere.
 *
 * **Why the summoner's assertion is no longer `not.toContain(the token)`.** That negative claimed
 * "no occurrence survives anywhere", as a proxy for "every occurrence meant to become a folder
 * did". Once a partial may deliberately NAME the token, the blanket form asserts something false,
 * and the only ways to satisfy it are the two defects it was written against: spell the folder
 * literally, or delete the lesson. The claim splits in two, and both are below — the compiled agent
 * TEACHES the token ({@link SUMMONER_TEACHES_THE_TOKEN}), and no PATH in it is rooted at the raw
 * token, which is the shape every instruction occurrence in the shipped partials has:
 *
 * ```
 * grep -rn '@@SOURCE_FOLDER@@' packages/cli/src/agents | grep -v '@@SOURCE_FOLDER@@/'
 * ```
 *
 * The controlled fixture below keeps the blanket negative, because its partials opt in and never
 * escape, so there nothing may survive.
 *
 * **Both claims live in this file because either one alone is satisfied by the wrong fix.**
 * Rendering the five partials through the Liquid engine — which is how the folder was made
 * install-specific before this — satisfies the summoner claim and silently rewrites every custom
 * agent's prose: `Use ${{ secrets.DB_PASSWORD }} in GitHub Actions.` compiled to `Use $ in GitHub
 * Actions.`, exit 0, no warning, with the template-injection boundary `sanitizeLiquidSyntax` holds
 * deleted on the way past. Inlining the five verbatim satisfies the prose claim and sends every
 * agent to author into a folder the CLI may not read. Split across two files, each fix passes the
 * file it was written against; together they are the whole specification.
 *
 * Everything here compiles through the production path — `createLiquidEngine` over the install
 * root, then `compileAgentForHost` — rather than reading the partials off disk, for the reason
 * `agent-partials.test.ts` gives: the template and its partials are separate surfaces and only a
 * render puts them in one string.
 *
 * {@link SOURCE_FOLDER_TOKEN} is a LITERAL here and deliberately not an import. The token is a
 * contract between the substitution and the shipped partials that carry it, and an assertion
 * importing it would move with a rename while every `.md` on disk still spelled it the old way —
 * which is the one failure this pair cannot otherwise see.
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ROOT, STANDARD_DIRS, STANDARD_FILES } from "../../consts.js";
import { compileAgentForHost, createLiquidEngine } from "../compiler.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { createMockAgentConfig } from "./factories/agent-factories.js";
import { writeTestTsConfig } from "./helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import type { AgentName } from "../../types/index.js";

/**
 * The reviewer's fixture, unchanged.
 *
 * Three shapes in one line, because they fail differently: `${{ … }}` is GitHub Actions syntax
 * that a Liquid render reduces to a bare `$`, `{{ … }}` is an undefined variable that renders to
 * nothing under `strictVariables: false`, and `{% … %}` is a tag whose body is evaluated away. A
 * fixture carrying only the first would pass against an engine that merely stopped stripping
 * delimiters.
 */
const LIQUID_LOOKING_PROSE =
  "Use ${{ secrets.DB_PASSWORD }} in GitHub Actions. Also {{ user.name }} and {% if x %}y{% endif %}.";

/** What a Liquid render turns {@link LIQUID_LOOKING_PROSE} into, named so the failure says so. */
const PROSE_AFTER_A_RENDER = "Use $ in GitHub Actions. Also  and .";

/** The one token a partial may carry that this product substitutes. */
const SOURCE_FOLDER_TOKEN = "@@SOURCE_FOLDER@@";

/** What an author writes to name that token in prose rather than ask for the folder. */
const SOURCE_FOLDER_ESCAPE = `\\${SOURCE_FOLDER_TOKEN}`;

/**
 * The sentence `agent-summoner`'s playbook teaches the token in, as a compiled agent must carry it.
 *
 * Text the product RENDERS, so it is kept as a literal here rather than imported from the partial
 * or from the substitution — both sides would then move together and this could never fail. It is
 * composed from {@link SOURCE_FOLDER_TOKEN} because that spelling is this file's one contract with
 * the shipped `.md` files, and a second copy of it would be a second thing to rename.
 */
const SUMMONER_TEACHES_THE_TOKEN = `The one exception is \`${SOURCE_FOLDER_TOKEN}\`, which the compile step`;

/**
 * The five partials a sub-agent is compiled from, by the constants that name them.
 *
 * Bound rather than spelled out: these are SYMBOLS whose deletion should break this file, and a
 * partial added to `readAgentFiles` and forgotten here is a partial nothing below asks about. The
 * order is `readAgentFiles`'s own.
 */
const AGENT_PARTIALS = [
  STANDARD_FILES.IDENTITY_MD,
  STANDARD_FILES.PLAYBOOK_MD,
  STANDARD_FILES.OUTPUT_MD,
  STANDARD_FILES.CRITICAL_REQUIREMENTS_MD,
  STANDARD_FILES.CRITICAL_REMINDERS_MD,
] as const;

/**
 * A real name from the generated roster rather than a fabricated one.
 *
 * `compileAgentForHost` takes an `AgentName`, so a name outside that union is unreachable in
 * production and casting one in is what `packages/cli/CLAUDE.md` forbids. Which name it is says
 * nothing here — the partials this fixture writes are the subject, and they are written into the
 * project's own source folder, which is where a project's agents live.
 */
const PROJECT_AGENT = "web-developer" satisfies AgentName;

/** The one agent whose shipped partials name the source folder. */
const SUMMONER = "agent-summoner" satisfies AgentName;

/** Where its partials live under the CLI's bundled agent tree. */
const SUMMONER_PATH = "meta/agent-summoner";

/**
 * A sentence from the summoner's playbook that has nothing to do with the folder.
 *
 * The subject guard for the summoner case: a render that picked up no playbook, or picked up a
 * different agent's, would name no folder and the assertion would be about an empty string.
 */
const SUMMONER_PLAYBOOK_MARKER = "## The Agent Structure";

/** The line this fixture writes into `partial`, distinct per partial so a failure names which. */
function proseIn(partial: string): string {
  return `${partial} — ${LIQUID_LOOKING_PROSE}`;
}

/** The opt-in sentence this fixture writes into `partial`, as an author would write one. */
function optedInLine(partial: string): string {
  return `Author a ${partial} sub-agent into \`${SOURCE_FOLDER_TOKEN}/${STANDARD_DIRS.AGENTS}/\`.`;
}

/** The same sentence once an install's folder has been substituted into it. */
function substitutedLine(partial: string, relName: string): string {
  return optedInLine(partial).replace(SOURCE_FOLDER_TOKEN, relName);
}

/** The sentence an author writes in `partial` to NAME the token rather than ask for the folder. */
function escapedLine(partial: string): string {
  return `A ${partial} names the token itself as \`${SOURCE_FOLDER_ESCAPE}\`.`;
}

/** The same sentence as a compiled agent must carry it: the token, and the escape consumed. */
function taughtLine(partial: string): string {
  return escapedLine(partial).replace(SOURCE_FOLDER_ESCAPE, SOURCE_FOLDER_TOKEN);
}

/** What the opt-in fixture writes into each partial: prose, and an instruction naming the folder. */
function optingInBody(partial: string): string {
  return `${proseIn(partial)}\n\n${optedInLine(partial)}\n`;
}

/**
 * What the escape fixture writes into each partial, which is the summoner's own situation: one
 * partial that both asks for the folder and names the token, and has to get the two right at once.
 */
function teachingBody(partial: string): string {
  return `${proseIn(partial)}\n\n${optedInLine(partial)}\n\n${escapedLine(partial)}\n`;
}

/**
 * A project agent whose every partial carries {@link LIQUID_LOOKING_PROSE} and whatever `body`
 * writes beside it.
 *
 * Every line goes in ALL FIVE because the substitution enumerates the five fields by hand: a field
 * added to the render and forgotten there passes its partial through untouched, and a fixture that
 * opted in from one partial would say nothing about the other four.
 *
 * Written under the source folder this project is ON — `sourceFolderInUse`, not a constant — which
 * is where `loadAgentDefinitions` points `agentBaseDir` for a project's own agents.
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

/** That agent compiled for an install rooted at `projectDir`, through the write path. */
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

/** `agent-summoner` compiled for an install rooted at `installRoot`, through the write path. */
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

/** An install still on the folder every pre-rename installation carries. */
async function putOnLegacyLayout(projectDir: string): Promise<void> {
  await writeTestTsConfig(projectDir, {}, ".claude-src");
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

    // Subject guard: all five partials really did reach the render. The marker survives a Liquid
    // render intact, so this holds whether or not the prose beside it was rewritten — without it
    // a compile that read no partials at all would fail the roster below for the wrong reason.
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
    const projectDir = await tempProject("partial-token-legacy-");
    await putOnLegacyLayout(projectDir);
    const relName = sourceFolderInUse(projectDir, "claude").relName;

    const compiled = await projectAgentCompiledIn(projectDir);

    // Subject guard: the fixture really did put this install on the pre-rename folder, so the
    // assertion below is about resolution rather than about whichever literal is current.
    expect(
      relName,
      "the fixture did not put this install on the folder it was written to test",
    ).toBe(".claude-src");
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

    // Subject guard: all five partials really did reach the render, so the rosters below are about
    // text that was there to be substituted rather than about text nothing ever read.
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
