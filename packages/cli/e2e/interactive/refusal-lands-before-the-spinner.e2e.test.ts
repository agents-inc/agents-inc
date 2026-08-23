import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/**
 * Both wizard commands render a loading `<Spinner>` and then await a load that can
 * refuse the run. The documented contract is that such a refusal "lands before the
 * spinner renders … never sits under a mounted Ink tree" — what the user is left
 * looking at must be the error, and nothing else.
 *
 * These are PTY specs and cannot be anything else. Without a terminal Ink buffers
 * its frames and writes the last one when the tree is torn down, so the spinner
 * text reaches stdout whether or not it was still mounted when the error was
 * raised — a non-PTY assertion on its absence fails identically either way and
 * would test nothing.
 *
 * The negative is proved by ORDER rather than by absence, per the standards: the
 * emulator's buffer holds everything the session ever drew, so `not.toContain` on
 * text the session legitimately painted is unfalsifiable. What discriminates is
 * that a spinner still mounted when oclif writes the error repaints BELOW it, so
 * the last thing on screen is the spinner rather than the refusal.
 *
 * `init-edit-error-guards.e2e.test.ts` owns the exit codes and message text for
 * two of these same paths; it runs without a PTY and says nothing about the
 * frame. Neither spec subsumes the other.
 */

/** The `source-fetcher` message for a marketplace path that is not a directory. */
const LOCAL_MARKETPLACE_NOT_FOUND = "Local marketplace not found:";
/** A path no marketplace can be fetched from, named so the failure is proved to be about it. */
const MISSING_SOURCE_PATH = "/tmp/not-a-real-source-path-refusal-frame";
/** The spinner row exactly as it is painted, less its rotating glyph. */
const SPINNER_ROW = `${STEP_TEXT.LOADING_SKILLS}...`;

describe("a refusal does not sit under a live spinner", () => {
  let prompt: InteractivePrompt | undefined;
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it("edit, where no installation exists, leaves the error as the last thing on screen", async () => {
    tempDir = await createTempDir();
    const emptyDir = path.join(tempDir, "empty");
    await mkdir(emptyDir, { recursive: true });

    prompt = new InteractivePrompt(["edit"], emptyDir, { env: { CC_MARKETPLACE: undefined } });
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

    expect(exitCode).toBe(EXIT_CODES.ERROR);

    const screen = prompt.getScreen();
    // Positive subject guard: the refusal IS painted in the frame being asserted on.
    expect(screen).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(
      screen.trimEnd().endsWith(SPINNER_ROW),
      "the loading spinner must not still be painting under the refusal",
    ).toBe(false);
  });

  it("edit, whose stored marketplace is gone, leaves the error as the last thing on screen", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // A real installation, so detectProject() succeeds and the run reaches the
    // loadSource catch inside loadContext — the second of its three throw paths.
    await writeProjectConfig(projectDir, {
      name: "refusal-frame-project",
      marketplace: MISSING_SOURCE_PATH,
      skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });
    await createLocalSkill(projectDir, E2E_SKILL.react.id, {
      description: "Minimal skill for the refusal-frame guard",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(E2E_SKILL.react.id),
        contentHash: "hash-refusal-frame",
      }),
    });

    prompt = new InteractivePrompt(["edit"], projectDir, { env: { CC_MARKETPLACE: undefined } });
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);

    const screen = prompt.getScreen();
    expect(screen).toContain(LOCAL_MARKETPLACE_NOT_FOUND);
    expect(screen).toContain(MISSING_SOURCE_PATH);
    expect(
      screen.trimEnd().endsWith(SPINNER_ROW),
      "the loading spinner must not still be painting under the refusal",
    ).toBe(false);
  });

  it("init, pointed at a marketplace that does not exist, leaves the error as the last thing on screen", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    // `Init.selectionFromWizard` has the identical structure: render, await the
    // load, then clear and unmount as statements AFTER the await.
    prompt = new InteractivePrompt(["init", "--marketplace", MISSING_SOURCE_PATH], projectDir, {
      env: { CC_MARKETPLACE: undefined },
    });
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);

    const screen = prompt.getScreen();
    expect(screen).toContain(LOCAL_MARKETPLACE_NOT_FOUND);
    expect(screen).toContain(MISSING_SOURCE_PATH);
    expect(
      screen.trimEnd().endsWith(SPINNER_ROW),
      "the loading spinner must not still be painting under the refusal",
    ).toBe(false);
  });
});
