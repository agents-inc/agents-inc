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

/**
 * **The measurement C5's renderer is built on, encoded so it can stop being true.**
 *
 * Nothing in this file touches our CLI. It plants agent ROLE DEFINITION files by hand and asks the
 * PINNED `@openai/codex` 0.155.1 what it did with them — which is the only way any of these claims
 * can be checked at all, and the reason every one of them was wrong in the first draft of the plan
 * that produced this step.
 *
 * **Why it is a tripwire rather than a red-then-green spec.** These are facts about a third party's
 * deserializer, so they are GREEN the day they are written. Their value is the day they go red: the
 * renderer emits exactly the keys measured here, and one unlisted key drops the whole file, so a
 * Codex release that moves the schema turns sixteen working sub-agents into sixteen silently
 * missing ones with every other test in this repository still passing. The pin is exact
 * (`@openai/codex` is a devDependency at `"0.155.1"`), so this reddens on the day somebody bumps
 * it, which is when it is worth reading.
 *
 * **Calibrated both ways, in every test that uses the roster.** With no role registered,
 * `spawn_agent` has no `agent_type` parameter AT ALL. With one registered, it appears and names
 * the role. Without the negative half an assertion that a role is present cannot tell a working
 * rig from one that is looking in the wrong place — which is exactly how a captured request body
 * with no top-level `tools` key read as "Codex offers no roles" until the tools were found nested
 * inside an `additional_tools` item of `input`.
 *
 * **HOME, CODEX_HOME and the global config, every time.** Codex writes helper binaries under
 * `$CODEX_HOME/tmp/arg0` before it reads an argument, and `codex exec` under a writable sandbox
 * writes `[projects."<cwd>"] trust_level = "trusted"` into the global config ITSELF — so the tool
 * under test sets the independent variable unless every run starts from a deleted config and a
 * read-only sandbox. That contamination has already produced two contradictory measurements in
 * this programme. The machine's own `~/.codex` is checked around every test for the same reason
 * `codex-lane.smoke.test.ts` checks it.
 *
 * NOTE: smoke tests for the Codex CLI binary's agent-role schema, NOT E2E tests for our CLI.
 */

/** The machine's own Codex state tree. Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

/** The prompt each turn carries. Its content is irrelevant; the request body is the subject. */
const ANY_PROMPT = "summarise this repository";

/** A control role that is valid by every measurement, so a subject's absence means something. */
const CONTROL = {
  id: "control-role",
  file: "control.toml",
  body: ['name = "control-role"', 'description = "the control"', 'developer_instructions = "C"'],
};

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

  /** Writes one role file into this home's global agents directory. */
  async function plantRole(file: string, lines: readonly string[]): Promise<void> {
    await writeFile(path.join(codexHome(home), "agents", file), `${lines.join("\n")}\n`, "utf-8");
  }

  /**
   * Every startup warning `codex doctor` reports, as one string.
   *
   * **Its EXIT CODE is not a verdict and is deliberately not asserted.** `codex doctor --json`
   * exits 1 in this rig whatever the agent roles look like, because its `auth` check fails with
   * no Codex credentials — measured on 0.155.1, 2026-09-22, with a role file that was malformed
   * and again with none at all. What is read instead is the report it still prints: a run that
   * produced no report at all is caught by the schema guard rather than by the code.
   */
  async function startupWarnings(): Promise<string> {
    const doctor = await runCodex(home, ["doctor"], project);
    const reported = JSON.stringify(doctor.json);

    expect(reported, `codex doctor printed no report: ${doctor.stderr}`).toContain("schemaVersion");

    return reported;
  }

  /** The roles Codex offers the model, as the request body carries them. */
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

    // The control proves the rig was looking; the subject's absence is the measurement.
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
