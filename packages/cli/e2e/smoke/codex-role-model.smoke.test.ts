import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { EFFORT_NAMES } from "@workspace/matrix";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readCodexBundledModels, runCodex } from "../fixtures/codex.js";
import {
  assistantMessage,
  respondWith,
  startCodexResponsesMock,
  type CodexResponsesMock,
} from "../fixtures/codex-responses-mock.js";
import {
  CODEX_OFFERED_MODELS,
  firstRequestOf,
  readOnlyExecArgs,
  ROLE_MODEL_LEAD,
  roleModelSentence,
  ROSTER_PARAMETER,
} from "../fixtures/codex-agent-roles.js";
import { cleanupTempDir, codexHome, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

// The Codex models a sub-agent may be pinned to, held against the pinned `@openai/codex`: reddens
// when a pin bump retires or hides an offered id, or drops an effort the product sends with it.

const ANY_PROMPT = "summarise this repository";

/** A role with no model of its own, so the roster has a member that is not a subject. */
const CONTROL_ROLE = [
  'name = "control-role"',
  'description = "the control"',
  'developer_instructions = "C"',
];

describe("the Codex models this CLI offers, on the pinned binary", () => {
  let home: string;
  let project: string;
  let mock: CodexResponsesMock | undefined;

  beforeEach(async () => {
    home = await createTempDir();
    project = path.join(home, "project");
    await mkdir(path.join(codexHome(home), "agents"), { recursive: true });
    await mkdir(project, { recursive: true });
  });

  afterEach(async () => {
    await mock?.close();
    mock = undefined;
    await cleanupTempDir(home);
  });

  async function plantRole(file: string, lines: readonly string[]): Promise<void> {
    await writeFile(path.join(codexHome(home), "agents", file), `${lines.join("\n")}\n`, "utf-8");
  }

  async function rosterOnTheWire(): Promise<string> {
    mock = await startCodexResponsesMock((_request, requestNumber) =>
      respondWith(requestNumber, (responseId) => [assistantMessage(responseId, "ok")]),
    );

    const run = await runCodex(home, readOnlyExecArgs(mock, ANY_PROMPT), project);
    expect(run.exitCode, run.stderr).toBe(EXIT_CODES.SUCCESS);

    return firstRequestOf(mock);
  }

  it("ships every offered id as a listed model", async () => {
    const listed = (await readCodexBundledModels(home))
      .filter((model) => model.visibility !== "hide")
      .map((model) => model.slug);

    expect(
      CODEX_OFFERED_MODELS.filter((id) => !listed.includes(id)),
      "an offered id is hidden or gone from the pinned binary",
    ).toStrictEqual([]);
  });

  it("takes every effort this product can send with each offered id", async () => {
    const bundled = await readCodexBundledModels(home);

    for (const id of CODEX_OFFERED_MODELS) {
      const efforts = bundled
        .find((model) => model.slug === id)
        ?.supported_reasoning_levels.map((level) => level.effort);

      expect(
        EFFORT_NAMES.filter((effort) => !efforts?.includes(effort)),
        `${id} refuses an effort the product can pin beside it`,
      ).toStrictEqual([]);
    }
  });

  it("describes each offered id as the role's own model in the roster", async () => {
    await plantRole("control.toml", CONTROL_ROLE);
    for (const id of CODEX_OFFERED_MODELS) {
      await plantRole(`${id}.toml`, [
        `name = "pinned-${id}"`,
        'description = "pinned"',
        'developer_instructions = "B"',
        `model = "${id}"`,
        'model_reasoning_effort = "medium"',
      ]);
    }

    const sent = await rosterOnTheWire();

    expect(sent, "no role registered, so nothing below is a measurement").toContain(
      ROSTER_PARAMETER,
    );
    for (const id of CODEX_OFFERED_MODELS) {
      expect(sent, `pinned-${id} did not register`).toContain(`pinned-${id}`);
      expect(sent).toContain(roleModelSentence(id));
    }
  });

  it("says nothing about a model for a role that names none", async () => {
    await plantRole("control.toml", CONTROL_ROLE);

    const sent = await rosterOnTheWire();

    expect(sent).toContain("control-role");
    expect(sent).not.toContain(ROLE_MODEL_LEAD);
  });
});
