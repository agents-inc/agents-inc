import path from "path";
import type { Provider } from "../../consts.js";
import type { SkillScope } from "../../types/config.js";
import { STANDARD_FILES } from "../../consts.js";
import {
  agentsDir,
  installBaseDir,
  providerInUse,
  skillsDir,
  sourceFolderInUse,
} from "./install-layout.js";

/**
 * Base directory for a scope's installed artifacts: the home directory for
 * `"global"` scope, the project directory otherwise (absent scope defaults to
 * project). Calls `os.homedir()` at runtime so test home-dir mocks apply.
 *
 * Declared in `install-layout.ts`, which every host role is rooted at, and forwarded here under
 * the name its callers already write — this module imports that one, so the answer cannot live
 * in both without a cycle.
 */
export { installBaseDir };

/**
 * Path to `provider`'s unified project config under `dir`, inside that provider's source folder.
 *
 * The resolution is {@link sourceFolderInUse}'s, so the path a caller reads and the path a caller
 * writes are one answer.
 *
 * **The provider is required, and that is the whole of C2 at this function.** It took none until
 * then, so a root holding an installation of each provider answered the Claude one to every
 * caller — a path that exists and parses, with nothing anywhere able to report that the other
 * installation was the subject. A caller holding only a directory reads the provider off it with
 * {@link providerInUse}.
 */
export function getProjectConfigPath(dir: string, provider: Provider): string {
  return path.join(sourceFolderInUse(dir, provider).dir, STANDARD_FILES.CONFIG_TS);
}

/**
 * The config path of whichever installation `dir` holds, for a caller that holds a directory and
 * nothing else.
 *
 * Its name says the provider was READ rather than assumed, which is the whole difference between
 * this and the default parameter C2 deleted: a default is invisible at the call site, while a
 * call to this one is a visible statement that the folder decided.
 */
export function getInstalledConfigPath(dir: string): string {
  return getProjectConfigPath(dir, providerInUse(dir));
}

export type InstallPaths = {
  skillsDir: string;
  agentsDir: string;
  configPath: string;
};

/**
 * The three places one scope's installation puts things, for the ~25 callers that hold a project
 * directory and a scope.
 *
 * **All three now follow the provider, and until C4 only one of them did.** The two directories
 * were composed from `CLAUDE_DIR` and `LOCAL_SKILLS_PATH` here while `configPath` came from
 * {@link getInstalledConfigPath}, so one view answered about two different installations at once:
 * a Codex installation's config was read from `.agents-inc/codex/config.ts` and its skills copied
 * into `.claude/skills/` in the same call, with nothing anywhere able to report it. They are one
 * read now — the provider is resolved once off the scope root and handed to `agentsDir` and
 * `skillsDir`, which take a required provider already.
 *
 * For Claude the answer does not move: `claudeRoles` in `install-layout.ts` composes exactly
 * `<scope root>/.claude/agents` and `<scope root>/.claude/skills`, which is what the two literals
 * spelled.
 *
 * **The provider is still READ rather than passed**, which is the gap C4 leaves open in turn: a
 * greenfield `init --from --provider codex` has no folder to read, and a scope holding an
 * installation of each provider is answered by roster order. Both are `providerInUse`'s stated
 * limits, and closing them is a provider argument threaded from the command — see the C4 report.
 */
export function resolveInstallPaths(
  projectDir: string,
  scope: SkillScope = "project",
): InstallPaths {
  const baseDir = installBaseDir(projectDir, scope);
  // One read for all three, so the directories and the config path cannot name two different
  // installations: `providerInUse` probes the disk, and asking it twice in one function is how
  // two answers to one question get into one value object.
  const provider = providerInUse(baseDir);

  return {
    skillsDir: skillsDir(provider, scope, projectDir),
    agentsDir: agentsDir(provider, scope, projectDir),
    configPath: getProjectConfigPath(baseDir, provider),
  };
}
