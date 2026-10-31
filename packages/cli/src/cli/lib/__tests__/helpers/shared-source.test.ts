import { spawn } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../test-fs-utils.js";
import {
  buildFrozenSourceTree,
  buildSharedSource,
  isSharedSource,
  removeFrozenSourceTree,
  removeSharedSource,
  sweepAbandonedSharedSources,
} from "./shared-source.js";

// Every build here goes under a private root: real E2E runs keep their shared sources in os.tmpdir().
let root: string;

beforeEach(async () => {
  root = await createTempDir("cc-frozen-source-spec-");
});

afterEach(async () => {
  await removeFrozenSourceTree(root);
});

async function writeATree(dir: string): Promise<void> {
  await mkdir(path.join(dir, "nested"), { recursive: true });
  await writeFile(path.join(dir, "top.txt"), "top\n");
  await writeFile(path.join(dir, "nested", "deep.txt"), "deep\n");
}

/** Wide enough that removing it takes several milliseconds, so a later sweep can begin part-way. */
async function writeAWideTree(dir: string): Promise<void> {
  await Promise.all(
    Array.from({ length: 24 }, async (_, index) => {
      const branch = path.join(dir, `branch-${index}`, "leaf");
      await mkdir(branch, { recursive: true });
      await writeFile(path.join(branch, "file.txt"), `${index}\n`);
    }),
  );
}

describe("a frozen source tree", () => {
  it("builds what its builder writes", async () => {
    await buildFrozenSourceTree(root, writeATree);

    expect(await readFile(path.join(root, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("answers with the root it was given", async () => {
    expect(await buildFrozenSourceTree(root, writeATree)).toBe(root);
  });

  it("refuses a write to a file, at the write", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "top.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  it("refuses a write below the top directory too", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "nested", "deep.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  it("refuses a new file in a frozen directory", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "new.txt"), "x")).rejects.toThrow(/EACCES|EPERM/);
  });

  it("removes itself despite being frozen", async () => {
    await buildFrozenSourceTree(root, writeATree);
    await removeFrozenSourceTree(root);

    await expect(stat(root)).rejects.toThrow();
  });

  it("replaces a tree an earlier run left behind rather than reusing it", async () => {
    await buildFrozenSourceTree(root, async (dir) => {
      await writeFile(path.join(dir, "stale.txt"), "from the last run\n");
    });

    await buildFrozenSourceTree(root, writeATree);

    await expect(stat(path.join(root, "stale.txt"))).rejects.toThrow();
    expect(await readFile(path.join(root, "top.txt"), "utf-8")).toBe("top\n");
  });
});

describe("each run's shared source", () => {
  it("is built under the parent it was given", async () => {
    const shared = await buildSharedSource(writeATree, { parent: root });

    expect(path.dirname(shared)).toBe(root);
  });

  it("is a different folder for each of two runs", async () => {
    const first = await buildSharedSource(writeATree, { parent: root });
    const second = await buildSharedSource(writeATree, { parent: root });

    expect(second).not.toBe(first);
  });

  it("stays whole while a second run builds its own", async () => {
    const first = await buildSharedSource(writeATree, { parent: root });
    await buildSharedSource(
      async (dir) => {
        await writeFile(path.join(dir, "other.txt"), "the other run\n");
      },
      { parent: root },
    );

    expect(await readFile(path.join(first, "nested", "deep.txt"), "utf-8")).toBe("deep\n");
    await expect(stat(path.join(first, "other.txt"))).rejects.toThrow();
  });

  it("is frozen, so a spec writing into it fails at the write", async () => {
    const shared = await buildSharedSource(writeATree, { parent: root });

    await expect(writeFile(path.join(shared, "top.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  it("is removed at its own run's teardown, leaving the other run's in place", async () => {
    const finishing = await buildSharedSource(writeATree, { parent: root });
    const stillRunning = await buildSharedSource(writeATree, { parent: root });

    await removeSharedSource(finishing);

    await expect(stat(finishing)).rejects.toThrow();
    expect(await readFile(path.join(stillRunning, "top.txt"), "utf-8")).toBe("top\n");
  });
});

describe("a spec's cleanup beside a shared source", () => {
  it("leaves a run's shared source in place", async () => {
    const shared = await buildSharedSource(writeATree, { parent: root });

    await cleanupTempDir(shared);

    expect(await readFile(path.join(shared, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("still removes an ordinary temporary directory", async () => {
    const ordinary = await createTempDir("cc-ordinary-temp-dir-");

    await cleanupTempDir(ordinary);

    await expect(stat(ordinary)).rejects.toThrow();
  });

  it("recognises a run's folder, and neither a path below it nor an ordinary one", async () => {
    const shared = await buildSharedSource(writeATree, { parent: root });

    expect(isSharedSource(shared)).toBe(true);
    expect(isSharedSource(path.join(shared, "nested"))).toBe(false);
    expect(isSharedSource(root)).toBe(false);
  });
});

type RunningProcess = { pid: number; stop: () => Promise<void> };

const runningProcesses: RunningProcess[] = [];

/** A process that started and exited, so its pid names a run that is gone. */
async function aFinishedProcessPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const { pid } = child;
  if (pid === undefined) throw new Error("the short-lived process never started");

  await new Promise((resolve) => child.once("exit", resolve));

  return pid;
}

/** A process alive until stopped, standing for another run still in progress. */
function aRunningProcess(): RunningProcess {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], {
    stdio: "ignore",
  });
  const { pid } = child;
  if (pid === undefined) throw new Error("the long-lived process never started");

  const exited = new Promise((resolve) => child.once("exit", resolve));
  const running: RunningProcess = {
    pid,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    },
  };
  runningProcesses.push(running);

  return running;
}

const BETWEEN_SWEEPS_MS = 1;

/**
 * Runs starting moments apart: sweeps `parent`, then again every millisecond until that first sweep
 * is done, so later ones meet its removal part-way (two started in the same tick move in lockstep
 * and never do). Answers what any of them failed with.
 */
async function failuresOfSweepsOverlappingOne(parent: string): Promise<unknown[]> {
  const failures: unknown[] = [];
  const sweep = () =>
    sweepAbandonedSharedSources(parent).catch((error: unknown) => {
      failures.push(error);
    });
  const first = { done: false };
  const sweeps = [
    sweep().then(() => {
      first.done = true;
    }),
  ];

  while (!first.done) {
    await new Promise((resolve) => setTimeout(resolve, BETWEEN_SWEEPS_MS));
    sweeps.push(sweep());
  }
  await Promise.all(sweeps);

  return failures;
}

describe("the sweep of folders left by killed runs", () => {
  afterEach(async () => {
    await Promise.all(runningProcesses.splice(0).map((running) => running.stop()));
  });

  it("removes the folder of a run whose process is gone", async () => {
    const abandoned = await buildSharedSource(writeATree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });

    await sweepAbandonedSharedSources(root);

    await expect(stat(abandoned)).rejects.toThrow();
  });

  it("leaves the folder of another run still in progress", async () => {
    const abandoned = await buildSharedSource(writeATree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });
    const inProgress = await buildSharedSource(writeATree, {
      parent: root,
      pid: aRunningProcess().pid,
    });

    await sweepAbandonedSharedSources(root);

    await expect(stat(abandoned)).rejects.toThrow();
    expect(await readFile(path.join(inProgress, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("sweeps a run's folder once that run is killed", async () => {
    const run = aRunningProcess();
    const folder = await buildSharedSource(writeATree, { parent: root, pid: run.pid });

    await sweepAbandonedSharedSources(root);
    expect(await readFile(path.join(folder, "top.txt"), "utf-8")).toBe("top\n");

    await run.stop();
    await sweepAbandonedSharedSources(root);

    await expect(stat(folder)).rejects.toThrow();
  });

  it("leaves the folder of a run whose process belongs to another user", async () => {
    const abandoned = await buildSharedSource(writeATree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });
    // Process 1 is always alive and, for anyone but root, refuses the liveness probe with EPERM.
    const anotherUsersRun = await buildSharedSource(writeATree, { parent: root, pid: 1 });

    await sweepAbandonedSharedSources(root);

    await expect(stat(abandoned)).rejects.toThrow();
    expect(await readFile(path.join(anotherUsersRun, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("leaves a folder that names no run, such as the fixed one earlier runs shared", async () => {
    const abandoned = await buildSharedSource(writeATree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });
    const fixed = path.join(root, "agents-inc-e2e-shared-fixtures");
    await buildFrozenSourceTree(fixed, writeATree);

    await sweepAbandonedSharedSources(root);

    await expect(stat(abandoned)).rejects.toThrow();
    expect(await readFile(path.join(fixed, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("leaves everything else under the parent alone", async () => {
    const abandoned = await buildSharedSource(writeATree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });
    const unrelated = path.join(root, "somebody-elses-fixture");
    await mkdir(unrelated);
    await writeFile(path.join(unrelated, "keep.txt"), "keep\n");

    await sweepAbandonedSharedSources(root);

    await expect(stat(abandoned)).rejects.toThrow();
    expect(await readFile(path.join(unrelated, "keep.txt"), "utf-8")).toBe("keep\n");
  });

  it("lets a run sweep a folder another run is part-way through removing", async () => {
    const abandoned = await buildSharedSource(writeAWideTree, {
      parent: root,
      pid: await aFinishedProcessPid(),
    });

    expect(await failuresOfSweepsOverlappingOne(root)).toStrictEqual([]);
    await expect(stat(abandoned)).rejects.toThrow();
  });
});
