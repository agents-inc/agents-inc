import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";
import { unique } from "remeda";

import { INCOMPLETE_WORK_RECOVERY } from "../../utils/messages.js";
import { typedKeys } from "../../utils/typed-object.js";
import { callSiteLines, constantMembersNamed } from "./helpers/source-call-sites.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EDIT = "src/cli/commands/edit.tsx";
const INIT = "src/cli/commands/init.tsx";
const EJECT = "src/cli/commands/eject.ts";
const BASE_COMMAND = "src/cli/base-command.ts";

const WARN_CALL = "this.warn(";
const RECOVERY_CONSTANT = "INCOMPLETE_WORK_RECOVERY";

/** Commands whose ending the recorded-work list decides, in directory order. */
const COMMANDS_WITH_A_THIRD_ENDING = [EDIT, EJECT, INIT] as const;

/**
 * `this.warn` alone exits 0; `reportIncompleteWork` warns and records. A failure warn looks like an
 * advisory one at the call site, so every warn-only site is rostered with its reason.
 */
type AdvisoryWarn = {
  line: string;
  why: string;
};

const EDIT_ADVISORY_WARNS = [
  {
    line: "if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));",
    why: "A fact about the PAYLOAD, not a failure of this run. The ids reach `reconcileSharedConfig` as `unplaceable`, so the entries stay installed and the confirm discloses them through `unplaceableKept`. Nothing was attempted and nothing was lost.",
  },
  {
    line: "if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));",
    why: "The sub-agent half of the same fact. A name this catalogue carries no definition for describes no work that could have been done.",
  },
  {
    line:
      "this.warn(`Could not tell which skills were written here: " + "${getErrorMessage(error)}`);",
    why: "A degraded READ, and one that only ever protects: an unanswered question makes the entry the CLI's own, which is what every other command already assumes. Its consequence is a removal the user is then shown and asked to approve.",
  },
  {
    line: "if (!opened.ok) this.warn(opened.error);",
    why: "`openSharedInEditor`'s half of the same site — the one that opens an id `--from` named rather than this installation. Identical reasoning and identical line, which is why the roster carries it twice: the scan reads source order, and two paths each print a link before trying to open one.",
  },
  {
    line: "if (!opened.ok) this.warn(opened.error);",
    why: "The URL is the deliverable and was printed above this; opening a browser is the convenience on top. Non-zero here would fail `--ui` on every headless machine that still has a TTY.",
  },
  {
    line: "this.warn(warning);",
    why: "`executeMigration`'s plugin-uninstall warnings. Diagnostic by ruling — see `uninstallMigratedPlugins`: after an eject the local copy IS the install, so a registration left behind is untidy rather than wrong, and it is what a machine with no Claude CLI produces on every healthy migration.",
  },
  {
    line: "this.warn(`Failed to copy ${item.id} for eject: ${item.error}`);",
    why: "Not warn-only at all — `reportEjectCopies` hard-errors on the same `failed` two statements below, so this line is the detail beside a refusal.",
  },
  {
    line: "this.warn(`Could not uninstall this project's plugin for ${half.id}: no marketplace`);",
    why: 'The project half of a collapsed `[P][G]` pair, removed: the config no longer names it, so a project-scope registration a source with no marketplace cannot address is untidy rather than wrong. CLAUDE.md: "Uninstall failures are diagnostic-only."',
  },
  {
    line: "this.warn(`Failed to uninstall plugin ${item.id}: ${item.error}`);",
    why: "The same collapsed half, where the uninstall itself failed — the reason the site beside `applyPluginChanges` gives below, one removal earlier in the run.",
  },
  {
    line: "this.warn(`Failed to uninstall plugin ${item.id}: ${item.error}`);",
    why: 'CLAUDE.md: "Uninstall failures are diagnostic-only." The skill is gone from the config and from disk; a stale registration in a registry this run could not reach is not work this run failed to do.',
  },
  {
    line: "this.warn(warning);",
    why: "The compiler's own reason per failed sub-agent. The FAILURE is recorded one statement below off `failed`, because `warnings` also carries entries that are not failures.",
  },
] as const satisfies readonly AdvisoryWarn[];

/** `init`'s warn-only sites, and the one that is detail beside a recorded failure. */
const INIT_ADVISORY_WARNS = [
  {
    line: "if (!opened.ok) this.warn(opened.error);",
    why: "The browser is the convenience, not the work. `init --ui` prints the editor's address BEFORE it tries to open one, precisely because there is no browser to be anybody's over a pipe, in CI, or on a machine with no desktop session — so a failed launch leaves the link on screen and nothing this run promised is missing. The same site and the same reason as `edit --ui`'s.",
  },
  {
    line: "if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));",
    why: "A fact about the PAYLOAD, not a failure of this run — the same line `edit --from` carries, worded once in `messages.ts`. An id no catalogue seats describes no work that could have been attempted.",
  },
  {
    line: "if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));",
    why: "The sub-agent half of the same fact.",
  },
  {
    line: "this.warn(warning);",
    why: "The compiler's own reason per failed sub-agent, printed where it is explicable. The FAILURE is recorded one statement below off `failed`, for the reason `edit` records off `failed`: `warnings` also carries entries that are not failures.",
  },
] as const satisfies readonly AdvisoryWarn[];

/** An occupied destination without `--force`: nothing attempted, and the remedy is a flag. */
const EJECT_ADVISORY_WARNS = [
  {
    line: "this.warn(result.skipReason);",
    why: "`ejectAgentPartials` declined: either the CLI carries no partials to copy, or the destination already holds them and `--force` was not passed. A refusal to overwrite is the command doing what it was asked, so the exit code stays at 0 and the reason names the flag that changes the answer.",
  },
  {
    line: "this.warn(",
    why: "Agent templates already on disk during a full `agent-partials` eject. The partials around them ARE written, so this is a partial eject by design — existing templates are preserved deliberately, and `--force` is the way to replace them.",
  },
  {
    line: "this.warn(result.skipReason);",
    why: "The skills half of the same decline: a populated destination without `--force`, or a marketplace carrying no non-local skill to eject.",
  },
] as const satisfies readonly AdvisoryWarn[];

/** Shared by four commands, so none adopts one's policy; rostered so the exclusion is visible. */
const BASE_COMMAND_ADVISORY_WARNS = [
  {
    line: "this.warn(message);",
    why: "`logWarning` — the generic passthrough, which says nothing about what it is reporting.",
  },
  {
    line: "this.warn(error.message);",
    why: "`reportValidationErrors`. Advisory by construction: the selection installs either way, and the docblock states that neither command's exit code turns on them.",
  },
  {
    line: "this.warn(`Failed to install plugin ${item.id}: ${item.error}`);",
    why: "Detail beside a refusal — `reportPluginInstalls` hard-errors on the same `failed` two statements below, before any config records a marketplace origin.",
  },
  {
    line: "this.warn(registeredProjectConfigUnreadable(projectPath));",
    why: "`reportFanOut` — a registered project the fan-out left alone because its config.ts cannot be loaded. The global change this run made has landed; the project is another installation, left as it was, and a run from inside it catches it up. `compile` and `uninstall` always warned about a skipped project and exited 0, and this keeps that posture for `init`, `edit` and `compile`, which share the method.",
  },
  {
    line: "this.warn(registeredProjectGone(projectPath));",
    why: "`reportProjectsOutOfReach` — a registered project with nothing installed at its path any more. Nothing there could hold what this run changed, so no work is left undone, and `compile` and `uninstall`, the two that print it, always exited 0 past it.",
  },
  {
    line: "this.warn(registeredProjectOnAnotherProvider(projectPath));",
    why: "`reportProjectsOutOfReach` — a registered project on the other provider: a different installation this run must not write, so leaving it alone is the correct outcome rather than an incomplete one.",
  },
  {
    line: "this.warn(warning);",
    why: "`reportPropagatedRecompile` — recompile failures in OTHER registered projects. Genuinely the same class as `edit`'s and `init`'s own compile failures, and still left alone: the method is shared by four commands, and `compile` and `uninstall` do not answer for a recorded failure at all — so recording here would file work into a list those two never read, which is a worse silence than the one it replaces.",
  },
  {
    line: "this.warn(skillAssignedToNoAgent(skillId));",
    why: "`reportUnassignedSkills`. The rule being reported is CORRECT and the install is complete — the skill is on disk and in the config, and nothing loads it.",
  },
  {
    line: "this.warn(scopeBlockedStackAssignment(blockedBy, skillId));",
    why: "The reason behind the line above, and advisory for the same reason.",
  },
  {
    line: "this.warn(what);",
    why: "`reportIncompleteWork` itself: the warn half of the call every failure site makes. It is the only warn-only line in these files that is not a decision about a failure — it IS the recording route, and it moved here when a second and third command needed it.",
  },
] as const satisfies readonly AdvisoryWarn[];

/**
 * Every recovery a failure site names, in source order with repeats, so a deleted site reddens too.
 * Held against `INCOMPLETE_WORK_RECOVERY`, so no unused recovery sentence survives.
 */
type FailureSite = {
  recovery: keyof typeof INCOMPLETE_WORK_RECOVERY;
  forWhat: string;
};

const EDIT_FAILURE_SITES = [
  { recovery: "INSPECT_INSTALLATION", forWhat: "a plugin scope migration that did not install" },
  { recovery: "RECOMPILE", forWhat: "the sub-agents a recompile pass refused to write" },
  { recovery: "RECOMPILE", forWhat: "a recompile pass that threw before reporting on any" },
  { recovery: "DELETE_AGENT_FILE", forWhat: "a stale compiled sub-agent that would not delete" },
] as const satisfies readonly FailureSite[];

const INIT_FAILURE_SITES = [
  { recovery: "RECOMPILE", forWhat: "the sub-agents the install's compile pass would not write" },
] as const satisfies readonly FailureSite[];

const EJECT_FAILURE_SITES = [
  {
    recovery: "INSPECT_INSTALLATION",
    forWhat: "the config.ts that was not invented over an unreadable one, after the eject landed",
  },
] as const satisfies readonly FailureSite[];

const FAILURE_SITE_ROSTERS = [
  { file: EDIT, sites: EDIT_FAILURE_SITES },
  { file: INIT, sites: INIT_FAILURE_SITES },
  { file: EJECT, sites: EJECT_FAILURE_SITES },
] as const;

const WARN_ROSTERS = [
  { file: EDIT, warns: EDIT_ADVISORY_WARNS },
  { file: INIT, warns: INIT_ADVISORY_WARNS },
  { file: EJECT, warns: EJECT_ADVISORY_WARNS },
  { file: BASE_COMMAND, warns: BASE_COMMAND_ADVISORY_WARNS },
] as const;

/** Only answering moves the exit code; recording without answering files failures nobody reads. */
const RECORDING_CALLS = ["this.reportIncompleteWork(", "this.recordIncompleteWork("];
const ANSWERING_CALL = "this.exitIfWorkIncomplete()";

/** Derived from the directory, so a new command cannot sit outside the gate. */
const EVERY_COMMAND = "src/cli/commands/**/*.{ts,tsx}";

async function sourceOf(relativePath: string): Promise<string> {
  return readFile(path.join(CLI_ROOT, relativePath), "utf8");
}

async function commandFiles(): Promise<string[]> {
  return (await fg(EVERY_COMMAND, { cwd: CLI_ROOT })).sort();
}

function recordsWork(source: string): boolean {
  return RECORDING_CALLS.some((call) => source.includes(call));
}

describe("a failure a command reports must say whether it changes the exit code", () => {
  for (const { file, warns } of WARN_ROSTERS) {
    it(`classifies every warn-only site in ${file}`, async () => {
      const source = await sourceOf(file);

      expect(
        callSiteLines(source, WARN_CALL),
        `an unrostered '${WARN_CALL}' in ${file} is a failure nobody has decided about: route ` +
          `it through reportIncompleteWork so the run exits COMPLETED_WITH_FAILURES, or add it ` +
          `above with the reason it is allowed to leave the exit code at 0`,
      ).toStrictEqual(warns.map((warn) => warn.line));
    });
  }

  for (const { file, sites } of FAILURE_SITE_ROSTERS) {
    it(`names a recovery at every failure site ${file} reports`, async () => {
      const { members, unreadable } = constantMembersNamed(await sourceOf(file), RECOVERY_CONSTANT);

      expect(
        unreadable,
        `every ${RECOVERY_CONSTANT} reference but the import must name a member — one that does ` +
          `not is a reference this gate cannot classify and must not silently pass`,
      ).toBe(1);
      expect(
        members,
        `a failure site removed from ${file} drops its recovery from this list, and the warn ` +
          `roster cannot see that: it reports what a site says, not that the site still exists`,
      ).toStrictEqual(sites.map((site) => site.recovery));
    });
  }

  it("leaves no recovery sentence that no failure site reaches for", () => {
    const reached = FAILURE_SITE_ROSTERS.flatMap(({ sites }) => sites.map((site) => site.recovery));

    expect(
      unique(reached).sort(),
      `an unreached member of ${RECOVERY_CONSTANT} is advice for a state nothing produces`,
    ).toStrictEqual(typedKeys(INCOMPLETE_WORK_RECOVERY).sort());
  });

  /** Since `BaseCommand` shares recording, a command can record without ever answering. */
  it("answers for what it records, in every command that records anything", async () => {
    const sources = await Promise.all(
      (await commandFiles()).map(async (file) => ({ file, source: await sourceOf(file) })),
    );

    const recording = sources.filter(({ source }) => recordsWork(source));
    expect(
      recording.map(({ file }) => file),
      "no command records incomplete work — the roster below has stopped describing the tree",
    ).toStrictEqual([...COMMANDS_WITH_A_THIRD_ENDING]);

    const unanswered = recording
      .filter(({ source }) => !source.includes(ANSWERING_CALL))
      .map(({ file }) => file);

    expect(
      unanswered,
      `a command that records incomplete work and never calls '${ANSWERING_CALL}' files its ` +
        `failures into a list nothing reads, and still exits 0`,
    ).toStrictEqual([]);
  });
});
