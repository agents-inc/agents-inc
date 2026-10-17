import path from "path";
import { mkdir, writeFile } from "fs/promises";

/** Writes the minimal `.git` entries that make `dir` a repository root, without running git. */
export async function makeGitRepositoryRoot(dir: string): Promise<void> {
  await writeGitDirectory(path.join(dir, ".git"));
}

export async function makeBareGitRepository(dir: string): Promise<void> {
  await writeGitDirectory(dir);
}

/** Lays out a linked worktree as `git worktree add` does, under `<commonDir>/worktrees/<name>/`. */
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
