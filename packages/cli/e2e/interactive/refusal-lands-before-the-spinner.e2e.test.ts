import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A refusal inside `edit --from`'s spinner load must be the last thing on screen, not repainted
 * under a still-mounted spinner. PTY only: without a terminal Ink flushes its last frame
 * regardless. Proved by order, since the buffer holds everything ever drawn.
 */

/** The `source-fetcher` message for a marketplace path that is not a directory. */
const LOCAL_MARKETPLACE_NOT_FOUND = "Local marketplace not found:";
const MISSING_SOURCE_PATH = "/tmp/not-a-real-source-path-refusal-frame";
/** Exactly as painted, less its rotating glyph. */
const SPINNER_ROW = `${STEP_TEXT.LOADING_SKILLS}...`;

const APPLIED_ID = "Refusal1";

describe("a refusal does not sit under a live spinner", () => {
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      APPLIED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
          }),
        },
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "project" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it("edit --from, where no installation exists, leaves the error as the last thing on screen", async () => {
    tempDir = await createTempDir();
    const emptyDir = path.join(tempDir, "empty");
    await mkdir(emptyDir, { recursive: true });

    // The id resolves, so the run refuses inside the spinner's load.
    prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], emptyDir, {
      env: { CC_MARKETPLACE: undefined, AGENTS_INC_API_URL: store.url },
    });
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

    expect(exitCode).toBe(EXIT_CODES.ERROR);

    const screen = prompt.getScreen();
    // Subject guard: the refusal is painted in this frame.
    expect(screen).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(
      screen.trimEnd().endsWith(SPINNER_ROW),
      "the loading spinner must not still be painting under the refusal",
    ).toBe(false);
  });

  it("edit --from, whose stored marketplace is gone, leaves the error as the last thing on screen", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // A real installation, so the run reaches the loadSource catch inside loadContext.
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

    prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], projectDir, {
      env: { CC_MARKETPLACE: undefined, AGENTS_INC_API_URL: store.url },
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
