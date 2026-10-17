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

// Smoke tests of the Codex fixtures (runner and Responses mock) against the real pinned binary. No
// `skipIf`: Codex is a pinned devDependency. `~/.codex` is snapshotted by lstat mtime around every
// test, since Codex writes (symlinks under tmp/arg0) on every start unless HOME/CODEX_HOME are pinned.

/** Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

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

    // Subject guard: refused at the manifest check, after Codex staged its state.
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

    // Codex persists the project's trust entry, and nothing pointing at the mock.
    const persisted = await readFile(path.join(codexHome(home), "config.toml"), "utf-8");
    expect(persisted).toContain(`[projects."${project}"]`);
    expect(persisted).not.toContain("model_providers");
  });
});
