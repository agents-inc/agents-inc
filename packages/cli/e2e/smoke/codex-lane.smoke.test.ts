import { lstat, mkdir, readdir, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isCodexCLIAvailable, runCodex } from "../fixtures/codex.js";
import {
  assistantMessage,
  mockProviderConfig,
  respondWith,
  startCodexResponsesMock,
  userTextsIn,
  type CodexResponsesMock,
} from "../fixtures/codex-responses-mock.js";
import { EXIT_CODES } from "../pages/constants.js";
import {
  cleanupTempDir,
  codexHome,
  createTempDir,
  directoryExists,
} from "../helpers/test-utils.js";

/**
 * The Codex test lane's two fixtures, run against the REAL pinned `@openai/codex` binary:
 * `e2e/fixtures/codex.ts` (the runner) and `e2e/fixtures/codex-responses-mock.ts` (the scripted
 * stand-in for the Responses API). Every Codex spec after this one stands on both, so this is the
 * file that says they work before anything is built on them.
 *
 * **No `skipIf`, unlike the Claude probes beside it.** `claude` is whatever a machine happens to
 * have; Codex is a devDependency at one exact version, so it is present wherever `bun install`
 * ran, and a skip would read as a green run. CI's smoke step therefore runs this file for real.
 *
 * **The machine's own `~/.codex` is checked around every test, not once.** Codex writes on every
 * start — unless its home is under the temp dir, it links helper binaries under
 * `$CODEX_HOME/tmp/arg0` before it reads an argument — so a door that forgets to pin `HOME` and
 * `CODEX_HOME` leaks on its first call. The snapshot is each entry's path and modification time,
 * read with `lstat`:
 *
 * - modification times, because a list of names can come back identical after a leak: Codex
 *   clears stale arg0 directories when it starts, so a run over a tree already holding
 *   `tmp/arg0` can leave the same names behind with only that directory's time moved. Observed on
 *   0.155.1 in the mutation run below, on `plugin marketplace list`;
 * - `lstat`, because the arg0 entries are symlinks, and a dangling one makes `stat` throw;
 * - not `readTreeSnapshot`, which reads every file's content — for `~/.codex` that includes the
 *   credentials a failing diff would print — and skips symlinks, which is what the arg0 leak is
 *   made of.
 *
 * An absent `~/.codex` is a snapshot of nothing and must stay absent: that is a CI runner's
 * state. A developer's own Codex session writing at the same moment also moves it, and the
 * failure names the entries that moved.
 *
 * Mutation-checked in a scratch copy of the package, never here, with the run's `HOME` pointed at
 * a scratch directory so a leak had somewhere harmless to land:
 *
 * - `startPinned` handing Codex no `HOME`/`CODEX_HOME`, and `TMPDIR` moved so that scratch HOME
 *   was not a temp dir to Codex: all four tests red on the machine-home assertion; the
 *   refused-add and exec tests also on their own trees, and the list test on its warning guard.
 * - The same, with the scratch HOME left under the temp dir: only the refused-add and exec tests
 *   went red. Codex declines to link helpers under a temp dir, so `--version` and `list` wrote
 *   nothing there. A leak test run from a `/tmp` HOME under-reports.
 * - The runner's JSON reader stubbed to return nothing: the list and exec tests red on the parsed
 *   output, and nothing else.
 * - The mock's `userTextsIn` stubbed to return nothing: the exec test red on the prompt check,
 *   and nothing else.
 *
 * NOTE: smoke tests for the Codex CLI binary and our fixtures around it, NOT E2E tests for our CLI.
 */

/** The machine's own Codex state tree. Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

/**
 * Every entry under `dir`, the directory itself included, keyed by relative path with its
 * modification time — `{}` when `dir` is absent.
 */
async function modificationTimesUnder(dir: string): Promise<Record<string, number>> {
  if (!(await directoryExists(dir))) return {};

  const entries = [".", ...(await readdir(dir, { recursive: true }))];
  const stamped = await Promise.all(
    entries.map(async (entry) => [entry, (await lstat(path.join(dir, entry))).mtimeMs] as const),
  );
  return Object.fromEntries(stamped);
}

describe("the Codex test lane against the pinned binary", () => {
  let home: string;
  let project: string;
  let mock: CodexResponsesMock | undefined;
  let machineCodexBefore: Record<string, number>;

  beforeEach(async () => {
    machineCodexBefore = await modificationTimesUnder(MACHINE_CODEX_HOME);
    home = await createTempDir();
    project = path.join(home, "project");
    await mkdir(project, { recursive: true });
  });

  afterEach(async () => {
    await mock?.close();
    mock = undefined;
    await cleanupTempDir(home);

    expect(
      await modificationTimesUnder(MACHINE_CODEX_HOME),
      "the machine's own ~/.codex moved during this test — Codex was started without HOME and CODEX_HOME pinned, or a Codex session outside the suite wrote to it meanwhile",
    ).toStrictEqual(machineCodexBefore);
  });

  it("finds the pinned binary, reporting the pinned release", async () => {
    expect(await isCodexCLIAvailable()).toBe(true);
  });

  it("parses a --json result off stdout and does not read the /tmp warning on stderr as a failure", async () => {
    const run = await runCodex(home, ["plugin", "marketplace", "list"], project);

    // Subject guard: the warning this claim is about was actually printed.
    expect(run.stderr).toContain("could not create PATH aliases");
    expect(run.exitCode, run.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(run.json).toStrictEqual([{ marketplaces: [] }]);
  });

  it("keeps what a refused command writes inside the HOME it was handed", async () => {
    const run = await runCodex(home, ["plugin", "marketplace", "add", project], project);

    // Subject guard: the refusal is the manifest check, reached after Codex staged its state —
    // not a binary that failed to start and so wrote nothing anywhere.
    expect(run.stderr).toContain("marketplace root does not contain a supported manifest");
    expect((await readdir(codexHome(home), { recursive: true })).sort()).toStrictEqual([
      ".tmp",
      ".tmp/marketplaces",
    ]);
  });

  it("runs a whole exec turn against the Responses mock and parses its event stream", async () => {
    mock = await startCodexResponsesMock((_request, requestNumber) =>
      respondWith(requestNumber, (responseId) => [assistantMessage(responseId, "mock says hello")]),
    );

    const run = await runCodex(
      home,
      ["exec", ...mockProviderConfig(mock), "--skip-git-repo-check", "say hello"],
      project,
    );

    expect(run.exitCode, run.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(run.json).toContainEqual({
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "mock says hello" },
    });
    expect(mock.requests.map((request) => request.path)).toStrictEqual(["/v1/responses"]);
    expect(mock.requests.flatMap((request) => userTextsIn(request.body))).toContain("say hello");

    // The provider overrides were flags and reached no file. What Codex persists is the trust it
    // gave the project it ran in, and nothing that points at the mock.
    const persisted = await readFile(path.join(codexHome(home), "config.toml"), "utf-8");
    expect(persisted).toContain(`[projects."${project}"]`);
    expect(persisted).not.toContain("model_providers");
  });
});
