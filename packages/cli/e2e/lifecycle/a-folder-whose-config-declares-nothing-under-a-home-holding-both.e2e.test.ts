import path from "path";
import { rm } from "fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { codexGlobalAgentsDir } from "../fixtures/codex-agent-roles.js";
import {
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { setAsideInstallation } from "../fixtures/config-reading-commands.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  compactCliOutput,
  fileExists,
  flattenCliOutput,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, doctorRow, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";

/**
 * A project whose own config declares nothing, under a HOME holding a Claude and a Codex
 * installation. The user docs say such a config is not an installation (configuration/
 * config-reference.md), so the scope in play is HOME's; and where one scope holds both, the
 * commands that change something refuse naming both, and `list` and `doctor` name both
 * (configuration/providers.md). The state is reached through real commands only: `eject` writes
 * exactly this config into a project with no installation of its own.
 *
 * A project holding nothing at all, under the same HOME, is refused by each of them; each refusal
 * is paired with the same command under `--provider`, which must not be refused.
 *
 * Owner 2026-10-24 ("Never count it, and say so"): such a config is never the project's
 * installation, and a command run there first prints one line saying so, on stderr as the
 * old-`.claude-src/` line is. Owner 2026-10-26 ("A line worded for each"): `uninstall`, `eject`,
 * `init` and `search` print a line of their own in its place, true for each; `uninstall`'s says
 * there is nothing to remove, so only a run finding nothing prints it. Under the refusal, which
 * comes first, no line is pinned.
 */

const SEED_ID = "DeclNone";

/** Differs from what HOME holds, so `edit --from` has something to apply. */
const DROPS_A_SKILL_ID = "DeclDrop";

const COMPILED_AGENT = E2E_AGENT["web-developer"].name;

const NAME_EITHER = "--provider <claude|codex>";

/** The refusal is a literal: it composes the subject a run passes. */
function refusal(home: string, subject: string): string {
  return `${home} holds 2 installations — claude and codex — so ${subject} cannot tell which one you mean. Name it with ${NAME_EITHER}. Nothing has been changed.`;
}

describe("a folder whose config declares nothing, under a HOME holding a Claude and a Codex installation", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let home = "";
  let project: ProjectHandle;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(SEED_ID, e2eStackPayload());
    store.publish(DROPS_A_SKILL_ID, e2eStackPayload({ without: [E2E_SKILL.zustand.id] }));

    env = await createTestEnvironment({ permissions: false });
    home = env.fakeHome;
    project = { dir: env.projectDir, globalHome: home };
    const atHome: ProjectHandle = { dir: home, globalHome: home };

    const claude = await runInitFromOnClaude(store, SEED_ID, atHome, E2E_SOURCE.sourceDir);
    expect(claude.exitCode, flattenCliOutput(claude.output)).toBe(EXIT_CODES.SUCCESS);
    // Before Codex arrives: under a HOME holding both, eject in an empty project is refused.
    const ejected = await CLI.run(["eject", "agent-partials"], project);
    expect(ejected.exitCode, flattenCliOutput(ejected.output)).toBe(EXIT_CODES.SUCCESS);
    const codex = await runInitFromOnCodex(store, SEED_ID, atHome, E2E_SOURCE.sourceDir);
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    // Subject guards: HOME holds both installations, and the project's own config declares nothing.
    expect(
      [
        await fileExists(path.join(home, DIRS.SOURCE_CLAUDE, FILES.CONFIG_TS)),
        await fileExists(path.join(home, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
      ],
      "HOME holds a Claude and a Codex installation",
    ).toStrictEqual([true, true]);
    const own = await loadProjectConfigFromDir(project.dir, "claude");
    expect(
      { skills: own?.config.skills, agents: own?.config.agents },
      "eject left a config in the project that declares no skill and no sub-agent",
    ).toStrictEqual({ skills: [], agents: [] });

    restore = await setAsideInstallation(home);
  }, TIMEOUTS.LIFECYCLE);

  beforeEach(async () => {
    await restore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(env.tempDir);
  });

  /** So a pass that compiles either installation shows on disk rather than rewriting identical bytes. */
  async function removeEachCompiledAgent(): Promise<void> {
    await rm(path.join(agentsPath(home), `${COMPILED_AGENT}.md`));
    await rm(
      path.join(codexGlobalAgentsDir(home), `${COMPILED_AGENT}${FILES.CODEX_AGENT_EXTENSION}`),
    );
  }

  function run(args: readonly string[]): Promise<CLIResult> {
    return CLI.run([...args], project, { env: { AGENTS_INC_API_URL: store.url } });
  }

  function expectTheLineFirst(
    { stderr }: CLIResult,
    line: string = STEP_TEXT.DECLARES_NOTHING_GLOBAL_STANDS_IN,
  ): void {
    // execa strips one final newline, which is the line's own when nothing is written after it.
    const printed = `${stderr}\n`;
    const lineAsPrinted = `${line}\n`;
    expect(
      printed.slice(0, lineAsPrinted.length),
      `stderr opens with the one line saying the project's config declares nothing:\n${stderr}`,
    ).toBe(lineAsPrinted);
    expect(printed.slice(lineAsPrinted.length), "the line is printed once").not.toContain(
      STEP_TEXT.DECLARES_NOTHING_OPENING,
    );
  }

  async function expectRefusedNamingBoth(
    args: readonly string[],
    subject: string,
  ): Promise<CLIResult> {
    const before = await readTreeSnapshot(home);

    const result = await run(args);

    expect(
      await readTreeSnapshot(home),
      `${subject} changed one of HOME's two installations, or the project, without asking which`,
    ).toStrictEqual(before);
    expect(result.exitCode, flattenCliOutput(result.output)).toBe(EXIT_CODES.INVALID_ARGS);
    expect(compactCliOutput(result.output)).toContain(compactCliOutput(refusal(home, subject)));
    return result;
  }

  async function expectNotRefusedAsAmbiguous(args: readonly string[]): Promise<CLIResult> {
    const result = await run(args);

    expect(result.exitCode, flattenCliOutput(result.output)).not.toBe(EXIT_CODES.INVALID_ARGS);
    expect(flattenCliOutput(result.output)).not.toContain("installations — claude and codex");
    return result;
  }

  it(
    "compile refuses rather than rewriting the Claude installation at HOME, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await removeEachCompiledAgent();
      expectTheLineFirst(await expectRefusedNamingBoth(["compile"], "compile"));
    },
  );

  it(
    "compile --provider codex rebuilds the Codex installation at HOME and only that one",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await removeEachCompiledAgent();
      const result = await expectNotRefusedAsAmbiguous(["compile", ...PROVIDER_CODEX]);

      expect(
        await fileExists(
          path.join(codexGlobalAgentsDir(home), `${COMPILED_AGENT}${FILES.CODEX_AGENT_EXTENSION}`),
        ),
        "the Codex role file the run named was rebuilt",
      ).toBe(true);
      expect(
        await fileExists(path.join(agentsPath(home), `${COMPILED_AGENT}.md`)),
        "the Claude installation was compiled by a run that named codex",
      ).toBe(false);
      expectTheLineFirst(result);
    },
  );

  it(
    "edit --from refuses rather than applying a configuration to the Claude installation at HOME, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      expectTheLineFirst(
        await expectRefusedNamingBoth(["edit", "--from", DROPS_A_SKILL_ID], "edit"),
      );
    },
  );

  it(
    "edit --from naming a provider is past the ambiguity, at the terminal it needs",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const result = await expectNotRefusedAsAmbiguous([
        "edit",
        "--from",
        DROPS_A_SKILL_ID,
        ...PROVIDER_CLAUDE,
      ]);

      expect(flattenCliOutput(result.output)).toContain(STEP_TEXT.SHARED_CONFIG_NEEDS_TERMINAL);
      expectTheLineFirst(result);
    },
  );

  it(
    "share refuses naming both installations rather than saying there is none, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      expectTheLineFirst(await expectRefusedNamingBoth(["share"], "share"));
    },
  );

  it(
    "share naming a provider is not refused as ambiguous",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      expectTheLineFirst(await expectNotRefusedAsAmbiguous(["share", ...PROVIDER_CLAUDE]));
    },
  );

  it(
    "edit refuses naming both installations rather than saying there is none, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      expectTheLineFirst(await expectRefusedNamingBoth(["edit"], "edit"));
    },
  );

  it(
    "edit naming a provider is not refused as ambiguous",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      expectTheLineFirst(await expectNotRefusedAsAmbiguous(["edit", ...PROVIDER_CLAUDE]));
    },
  );

  it(
    "uninstall refuses naming both rather than removing the project's config",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectRefusedNamingBoth(["uninstall", "--yes"], "uninstall");
    },
  );

  it(
    "uninstall naming a provider is not refused, and removes nothing at HOME or in the project, after its own line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const before = await readTreeSnapshot(home);

      const result = await run(["uninstall", "--yes", ...PROVIDER_CLAUDE]);
      const { exitCode, stdout, output } = result;

      expect(
        await readTreeSnapshot(home),
        "HOME's two installations, and the project's config that declares nothing, are as they were",
      ).toStrictEqual(before);
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(flattenCliOutput(stdout), "as from a project holding no installation").toContain(
        STEP_TEXT.UNINSTALL_NOT_INSTALLED,
      );
      expectTheLineFirst(result, STEP_TEXT.DECLARES_NOTHING_UNINSTALL);
    },
  );

  /** The partials the setup ejected are already in the project, so this run copies none. */
  it(
    "eject naming a provider works on the project, leaving HOME's two installations as they were, after its own line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const before = await readTreeSnapshot(home);

      const result = await run(["eject", "agent-partials", ...PROVIDER_CLAUDE]);
      const { exitCode, output } = result;

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(
        compactCliOutput(output),
        "the run worked on this project's partials, which it found already there",
      ).toContain(compactCliOutput(path.join(project.dir, DIRS.SOURCE_CLAUDE, DIRS.AGENTS)));
      expect(
        await readTreeSnapshot(home),
        "neither of HOME's installations, nor the partials already in the project, change",
      ).toStrictEqual(before);
      expectTheLineFirst(result, STEP_TEXT.DECLARES_NOTHING_EJECT);
    },
  );

  it(
    "init shows what it shows from a project with no installation, after its own line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const before = await readTreeSnapshot(home);

      const result = await run(["init"]);
      const { exitCode, output } = result;

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(await readTreeSnapshot(home), "a bare init writes nothing").toStrictEqual(before);
      expectTheLineFirst(result, STEP_TEXT.DECLARES_NOTHING_INIT);
    },
  );

  /** Eject wrote the project's config naming the marketplace HOME read, so search reads that one. */
  it(
    "search reads the marketplace the project's config names, after its own line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const before = await readTreeSnapshot(home);

      const result = await run(["search", "react"]);
      const { exitCode, stdout, output } = result;

      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "subject guard: search found what it searched for").toContain(
        'matching "react"\n',
      );
      expect(await readTreeSnapshot(home), "search writes nothing").toStrictEqual(before);
      expectTheLineFirst(result, STEP_TEXT.DECLARES_NOTHING_SEARCH);
    },
  );

  it(
    "list names both of HOME's installations above the Claude one it lists, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const result = await run(["list"]);
      const { exitCode, stdout } = result;

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the installation listed is HOME's Claude one").toContain(
        `  Config:  ${home}/${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS}\n`,
      );
      expect(stdout, "the line naming both sits directly above the listing").toContain(
        `${home} holds 2 installations — claude and codex — and this is the claude one. Show another with ${NAME_EITHER}.\n\nInstallation: `,
      );
      expectTheLineFirst(result);
    },
  );

  it(
    "list --provider codex lists HOME's Codex installation alone",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const result = await run(["list", ...PROVIDER_CODEX]);
      const { exitCode, stdout } = result;

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(`  Config:  ${home}/${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS}\n`);
      expect(stdout, "a run naming its installation has no other to name").toMatch(
        /^\s*Installation: /,
      );
      expectTheLineFirst(result);
    },
  );

  it(
    "doctor reports HOME's two installations as a finding and checks each, after the line",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const result = await run(["doctor"]);
      const { stdout } = result;

      expect(stdout).toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_INSTALLATIONS,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          `2 ${STEP_TEXT.DOCTOR_INSTALLATIONS_EACH_CHECKED}\n`,
        ),
      );
      expect(stdout).toMatch(
        /\n {2}The claude installation\n[\s\S]*\n {2}The codex installation\n/,
      );
      expectTheLineFirst(result);
    },
  );
});
