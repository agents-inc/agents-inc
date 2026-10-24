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
 * CLI-971, measured against the built CLI: the refusal and `list`'s line counted the project's
 * config as its installation, while the command itself skipped it and read HOME by roster order.
 * `compile` rewrote the Claude installation, `edit --from` applied a configuration to it (at a
 * terminal, removing a skill from it), `list` and `doctor` reported it with nothing about the
 * Codex one, and `share` and `edit` said no installation existed. A project holding nothing at
 * all, under the same HOME, is refused by each of them. Each refusal is paired with the same
 * command under `--provider`, which must not be refused. The tree snapshot behind "nothing
 * changed" was seen red in compile's case, with HOME's Claude agent file back on disk.
 */

const SEED_ID = "DeclNone";

/** Differs from what HOME holds, so `edit --from` has something to apply. */
const DROPS_A_SKILL_ID = "DeclDrop";

const COMPILED_AGENT = E2E_AGENT["web-developer"].name;

const NAME_EITHER = "--provider <claude|codex>";

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

  async function expectRefusedNamingBoth(args: readonly string[], subject: string): Promise<void> {
    const before = await readTreeSnapshot(home);

    const { exitCode, output } = await run(args);

    expect(
      await readTreeSnapshot(home),
      `${subject} changed one of HOME's two installations, or the project, without asking which`,
    ).toStrictEqual(before);
    expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.INVALID_ARGS);
    expect(compactCliOutput(output)).toContain(compactCliOutput(refusal(home, subject)));
  }

  async function expectNotRefusedAsAmbiguous(args: readonly string[]): Promise<CLIResult> {
    const result = await run(args);

    expect(result.exitCode, flattenCliOutput(result.output)).not.toBe(EXIT_CODES.INVALID_ARGS);
    expect(flattenCliOutput(result.output)).not.toContain("installations — claude and codex");
    return result;
  }

  // KNOWN GAP: the refusal counts the project's config as its installation; compile skips it and
  // compiles HOME's Claude installation by roster order.
  it.fails(
    "compile refuses rather than rewriting the Claude installation at HOME",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      await removeEachCompiledAgent();
      await expectRefusedNamingBoth(["compile"], "compile");
    },
  );

  it(
    "compile --provider codex rebuilds the Codex installation at HOME and only that one",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await removeEachCompiledAgent();
      await expectNotRefusedAsAmbiguous(["compile", ...PROVIDER_CODEX]);

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
    },
  );

  // KNOWN GAP: edit --from resolves HOME's Claude installation by roster order and asks only to
  // confirm, so at a terminal it applies the configuration there.
  it.fails(
    "edit --from refuses rather than applying a configuration to the Claude installation at HOME",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectRefusedNamingBoth(["edit", "--from", DROPS_A_SKILL_ID], "edit");
    },
  );

  it(
    "edit --from naming a provider is past the ambiguity, at the terminal it needs",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const { output } = await expectNotRefusedAsAmbiguous([
        "edit",
        "--from",
        DROPS_A_SKILL_ID,
        ...PROVIDER_CLAUDE,
      ]);

      expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_NEEDS_TERMINAL);
    },
  );

  // KNOWN GAP: share reads the project's own config, finds it empty and says no installation
  // exists, while HOME holds two.
  it.fails(
    "share refuses naming both installations rather than saying there is none",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectRefusedNamingBoth(["share"], "share");
    },
  );

  it(
    "share naming a provider is not refused as ambiguous",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectNotRefusedAsAmbiguous(["share", ...PROVIDER_CLAUDE]);
    },
  );

  // KNOWN GAP: edit reads the project's own config, finds it empty and says no installation
  // exists, while HOME holds two.
  it.fails(
    "edit refuses naming both installations rather than saying there is none",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectRefusedNamingBoth(["edit"], "edit");
    },
  );

  it(
    "edit naming a provider is not refused as ambiguous",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      await expectNotRefusedAsAmbiguous(["edit", ...PROVIDER_CLAUDE]);
    },
  );

  // KNOWN GAP: list's line reads the roster, which counts the project's config, while the listing
  // skips it and shows HOME's Claude installation.
  it.fails(
    "list names both of HOME's installations above the Claude one it lists",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      const { exitCode, stdout } = await run(["list"]);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the installation listed is HOME's Claude one").toContain(
        `  Config:  ${home}/${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS}\n`,
      );
      expect(stdout, "the line naming both sits directly above the listing").toContain(
        `${home} holds 2 installations — claude and codex — and this is the claude one. Show another with ${NAME_EITHER}.\n\nInstallation: `,
      );
    },
  );

  it(
    "list --provider codex lists HOME's Codex installation alone",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const { exitCode, stdout } = await run(["list", ...PROVIDER_CODEX]);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(`  Config:  ${home}/${DIRS.SOURCE_CODEX}/${FILES.CONFIG_TS}\n`);
      expect(stdout, "a run naming its installation has no other to name").toMatch(
        /^\s*Installation: /,
      );
    },
  );

  // KNOWN GAP: doctor's finding reads the roster, which counts the project's config, while its
  // checks skip it and check HOME's Claude installation alone.
  it.fails(
    "doctor reports HOME's two installations as a finding and checks each",
    { retry: 0, timeout: TIMEOUTS.INSTALL },
    async () => {
      const { stdout } = await run(["doctor"]);

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
    },
  );
});
