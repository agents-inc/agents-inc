import { execa } from "execa";
import { appendFile } from "fs/promises";
import path from "path";
import { expect } from "vitest";

import { CLI } from "./cli.js";
import type { E2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { EXIT_CODES, FILES, SOURCE_PATHS } from "../pages/constants.js";

export const SOURCE_EDIT = "## A section added to the marketplace after installation";

/** Edits every named skill in the source, then rebuilds, so the marketplace offers a new version. */
export async function offerANewVersionOf(
  fixture: E2EPluginSource,
  skillIds: readonly string[],
): Promise<void> {
  for (const skillId of skillIds) {
    await appendFile(
      path.join(fixture.sourceDir, SOURCE_PATHS.SKILLS_DIR, skillId, FILES.SKILL_MD),
      `\n\n${SOURCE_EDIT}\n`,
    );
  }
  for (const build of [
    ["build", "plugins"],
    ["build", "marketplace"],
  ]) {
    const built = await CLI.run(build, { dir: fixture.sourceDir });
    expect(built.exitCode, `${build.join(" ")} failed: ${built.output}`).toBe(EXIT_CODES.SUCCESS);
  }
}

/**
 * Codex fetches a git marketplace over HTTPS or SSH only, so the URL handed out names a host that
 * cannot resolve and the HOME's git config rewrites it to a local bare clone: nothing leaves the
 * machine, and Codex still records the marketplace as `git`.
 */
const UNREACHABLE_GIT_HOST = "https://git.e2e.invalid/";

const COMMITTER = [
  "-c",
  "user.name=e2e",
  "-c",
  "user.email=e2e@e2e.invalid",
  "-c",
  "commit.gpgsign=false",
];

export type GitMarketplace = {
  url: string;
  /** Commits whatever the source folder holds now and pushes it where the next fetch reads. */
  publish: () => Promise<void>;
};

/** Every git run, ours and the ones Codex spawns, reads the same fake HOME and no system config. */
export async function serveOverGit(
  fixture: E2EPluginSource,
  home: string,
): Promise<GitMarketplace> {
  const bareDir = path.join(fixture.tempDir, `${fixture.marketplaceName}.git`);
  const git = (args: readonly string[], cwd: string) =>
    execa("git", [...COMMITTER, ...args], {
      cwd,
      env: { HOME: home, GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: undefined },
    });
  const commitEverything = async (message: string) => {
    await git(["add", "--all"], fixture.sourceDir);
    await git(["commit", "--quiet", "--message", message], fixture.sourceDir);
  };

  await git(["init", "--quiet", "--initial-branch=main"], fixture.sourceDir);
  await commitEverything("the marketplace as installed");
  await git(["clone", "--quiet", "--bare", fixture.sourceDir, bareDir], fixture.tempDir);
  await git(
    [
      "config",
      "--file",
      path.join(home, ".gitconfig"),
      `url.file://${fixture.tempDir}/.insteadOf`,
      UNREACHABLE_GIT_HOST,
    ],
    home,
  );

  return {
    url: `${UNREACHABLE_GIT_HOST}${fixture.marketplaceName}.git`,
    publish: async () => {
      await commitEverything("the marketplace moves on");
      await git(["push", "--quiet", bareDir, "HEAD:main"], fixture.sourceDir);
    },
  };
}
