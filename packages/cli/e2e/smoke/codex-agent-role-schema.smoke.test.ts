import { lstat, mkdir, readdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isCodexCLIAvailable, runCodex } from "../fixtures/codex.js";
import {
  assistantMessage,
  respondWith,
  startCodexResponsesMock,
  type CodexResponsesMock,
} from "../fixtures/codex-responses-mock.js";
import {
  firstRequestOf,
  readOnlyExecArgs,
  ROSTER_HEADING,
  ROSTER_PARAMETER,
} from "../fixtures/codex-agent-roles.js";
import {
  cleanupTempDir,
  codexHome,
  createTempDir,
  directoryExists,
} from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

// The pinned Codex binary's agent-role schema, measured by planting role files by hand: the Codex
// renderer emits exactly these keys, and one unlisted key drops the whole file. Each roster check has
// a negative control (no role registered means no `agent_type` parameter at all).

/** Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

const ANY_PROMPT = "summarise this repository";

/** Valid by every measurement, so a subject's absence means something. */
const CONTROL = {
  id: "control-role",
  file: "control.toml",
  body: ['name = "control-role"', 'description = "the control"', 'developer_instructions = "C"'],
};

async function modificationTimesUnder(dir: string): Promise<Record<string, number>> {
  if (!(await directoryExists(dir))) return {};

  const entries = [".", ...(await readdir(dir, { recursive: true }))];
  const stamped = await Promise.all(
    entries.map(async (entry) => [entry, (await lstat(path.join(dir, entry))).mtimeMs] as const),
  );

  return Object.fromEntries(stamped);
}

describe("the agent role schema of the pinned Codex binary", () => {
  let home: string;
  let project: string;
  let mock: CodexResponsesMock | undefined;
  let machineCodexBefore: Record<string, number>;

  beforeEach(async () => {
    machineCodexBefore = await modificationTimesUnder(MACHINE_CODEX_HOME);
    home = await createTempDir();
    project = path.join(home, "project");
    await mkdir(path.join(codexHome(home), "agents"), { recursive: true });
    await mkdir(project, { recursive: true });
  });

  afterEach(async () => {
    await mock?.close();
    mock = undefined;
    await cleanupTempDir(home);

    expect(
      await modificationTimesUnder(MACHINE_CODEX_HOME),
      "the machine's own ~/.codex moved during this test — Codex was started without HOME and CODEX_HOME pinned",
    ).toStrictEqual(machineCodexBefore);
  });

  async function plantRole(file: string, lines: readonly string[]): Promise<void> {
    await writeFile(path.join(codexHome(home), "agents", file), `${lines.join("\n")}\n`, "utf-8");
  }

  // Exit code not asserted: `codex doctor` exits 1 here regardless, as auth fails without credentials.
  async function startupWarnings(): Promise<string> {
    const doctor = await runCodex(home, ["doctor"], project);
    const reported = JSON.stringify(doctor.json);

    expect(reported, `codex doctor printed no report: ${doctor.stderr}`).toContain("schemaVersion");

    return reported;
  }

  async function rosterOnTheWire(): Promise<string> {
    mock = await startCodexResponsesMock((_request, requestNumber) =>
      respondWith(requestNumber, (responseId) => [assistantMessage(responseId, "ok")]),
    );

    const run = await runCodex(home, readOnlyExecArgs(mock, ANY_PROMPT), project);
    expect(run.exitCode, run.stderr).toBe(EXIT_CODES.SUCCESS);

    return firstRequestOf(mock);
  }

  it("runs the pinned release", async () => {
    expect(await isCodexCLIAvailable()).toBe(true);
  });

  it("offers no agent_type at all when nothing is registered", async () => {
    const sent = await rosterOnTheWire();

    expect(sent).toContain("spawn_agent");
    expect(sent).not.toContain(ROSTER_PARAMETER);
  });

  it("registers a role carrying name, description and developer_instructions", async () => {
    await plantRole(CONTROL.file, CONTROL.body);

    const sent = await rosterOnTheWire();

    expect(await startupWarnings()).not.toContain("malformed agent role definition");
    expect(sent).toContain(ROSTER_PARAMETER);
    expect(sent).toContain(ROSTER_HEADING);
    expect(sent).toContain(CONTROL.id);
  });

  it("takes the role id from the name key rather than from the filename", async () => {
    await plantRole("a-filename-nobody-chose.toml", [
      'name = "id-from-the-name-key"',
      'description = "d"',
      'developer_instructions = "B"',
    ]);

    const sent = await rosterOnTheWire();

    expect(sent).toContain("id-from-the-name-key");
    expect(sent).not.toContain("a-filename-nobody-chose");
  });

  it("drops the WHOLE file on one rejected key, leaving the control registered", async () => {
    await plantRole(CONTROL.file, CONTROL.body);
    await plantRole("subject.toml", [
      'name = "subject-role"',
      'description = "carries one key Codex does not accept"',
      'developer_instructions = "B"',
      'reasoning_effort = "high"',
    ]);

    const sent = await rosterOnTheWire();

    expect(sent).toContain(CONTROL.id);
    expect(
      sent,
      "a role carrying a rejected key reached the model — the whole-file drop no longer holds",
    ).not.toContain("subject-role");
    expect(await startupWarnings()).toContain("unknown field `reasoning_effort`");
  });

  it("names the file and the missing key when a required one is absent", async () => {
    await plantRole("no-instructions.toml", ['name = "p"', 'description = "d"']);

    const warned = await startupWarnings();

    expect(warned).toContain("malformed agent role definition");
    expect(warned).toContain("developer_instructions");
    expect(warned).toContain("no-instructions.toml");
  });

  it("refuses `instructions` in place of `developer_instructions`", async () => {
    await plantRole("wrong-key.toml", ['name = "p"', 'description = "d"', 'instructions = "B"']);

    expect(await startupWarnings()).toContain("developer_instructions");
  });

  it("refuses a blank developer_instructions", async () => {
    await plantRole("blank.toml", [
      'name = "p"',
      'description = "d"',
      'developer_instructions = ""',
    ]);

    expect(await startupWarnings()).toContain("cannot be blank");
  });

  it("accepts the keys the renderer emits, and registers the role that carries them", async () => {
    await plantRole("full.toml", [
      'name = "full-role"',
      'description = "every key the renderer emits"',
      'developer_instructions = "B"',
      'model = "opus"',
      'model_reasoning_effort = "high"',
      "[features]",
      "shell_tool = false",
    ]);

    const sent = await rosterOnTheWire();

    expect(await startupWarnings()).not.toContain("malformed agent role definition");
    expect(sent).toContain("full-role");
  });

  it("rejects every key the renderer must never emit, one file each", async () => {
    const rejected = [
      'reasoning_effort = "high"',
      'effort = "high"',
      'disallowed_tools = ["Bash"]',
      'permissionMode = "default"',
      'isolation = "worktree"',
      'experimental = { cacheTtl = "1h" }',
      'tools = ["Read", "Write"]',
      'skills = ["a"]',
    ];

    for (const [index, line] of rejected.entries()) {
      await plantRole(`rejected-${index}.toml`, [
        `name = "rejected-${index}"`,
        'description = "d"',
        'developer_instructions = "B"',
        line,
      ]);
    }
    await plantRole(CONTROL.file, CONTROL.body);

    const sent = await rosterOnTheWire();

    expect(sent, "the control did not register, so nothing below is a measurement").toContain(
      CONTROL.id,
    );
    for (const index of rejected.keys()) {
      expect(sent, `rejected-${index} reached the model: ${rejected[index]}`).not.toContain(
        `rejected-${index}`,
      );
    }
  });
});
