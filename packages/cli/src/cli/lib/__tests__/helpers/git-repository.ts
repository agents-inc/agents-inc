import path from "path";
import { mkdir, writeFile } from "fs/promises";

/**
 * Makes `dir` the root of an empty git repository, by writing the three entries git reads to
 * recognise one — `HEAD`, `objects/` and `refs/` — rather than by running git, since no suite here
 * runs a git command. From any folder below `dir`, `git rev-parse --show-toplevel` answers `dir`,
 * and so does Claude Code's own root lookup, which looks for the `.git` entry.
 */
export async function makeGitRepositoryRoot(dir: string): Promise<void> {
  await writeGitDirectory(path.join(dir, ".git"));
}

/** Makes `dir` an empty bare repository: the same three entries, written in `dir` itself. */
export async function makeBareGitRepository(dir: string): Promise<void> {
  await writeGitDirectory(dir);
}

/**
 * Makes `worktreeRoot` a linked worktree of the repository whose git directory is `commonDir` —
 * `<main>/.git`, or a bare repository's own folder — laid out as `git worktree add` lays one out: a
 * `.git` FILE pointing at `<commonDir>/worktrees/<name>/`, whose `commondir` leads back to
 * `commonDir` and whose `gitdir` names the worktree's `.git`. From inside it,
 * `git rev-parse --git-common-dir` answers `commonDir`.
 */
export async function makeGitWorktree(commonDir: string, worktreeRoot: string): Promise<void> {
  const ownGitDir = path.join(commonDir, "worktrees", path.basename(worktreeRoot));
  const pointer = path.join(worktreeRoot, ".git");
  await mkdir(ownGitDir, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });
  await writeFile(path.join(ownGitDir, "HEAD"), "ref: refs/heads/worktree\n");
  await writeFile(path.join(ownGitDir, "commondir"), "../..\n");
  await writeFile(path.join(ownGitDir, "gitdir"), `${pointer}\n`);
  await writeFile(pointer, `gitdir: ${ownGitDir}\n`);
}

async function writeGitDirectory(gitDir: string): Promise<void> {
  await mkdir(path.join(gitDir, "objects"), { recursive: true });
  await mkdir(path.join(gitDir, "refs", "heads"), { recursive: true });
  await writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
}
