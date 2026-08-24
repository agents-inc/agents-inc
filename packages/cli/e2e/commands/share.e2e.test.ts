import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  addForkedFromMetadata,
  agentsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { UPSTREAM_SKILL_NAME } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";

/**
 * `share` end to end: the CLI turns the installation in this directory into a configuration the
 * store can hold, and hands back the id that installs it again.
 *
 * The claim worth proving here is the round trip, and it can only be proved by making it: install
 * a payload, share what was installed, then install the minted id into a second, untouched
 * directory and compare the two installations. A spec that only inspected the posted body would
 * pass on a payload the decoder cannot read.
 */

/**
 * A payload as the web app builds it, pinned to the wire version rather than the constant.
 *
 * `external` is omitted entirely when a spec names none, because absent is what the ordinary
 * payload — one built from the catalogue alone — carries.
 */
function seedPayload(
  skills: Record<string, unknown>,
  agents: Record<string, unknown> = {},
  external?: Record<string, unknown>,
) {
  return {
    v: 5,
    matrixVersion: "1.0.0",
    stackId: null,
    skills,
    agents,
    ...(external && { external }),
  };
}

/**
 * One skill row. Eject and global for the same reasons the `init --from` specs give: the E2E
 * source is local and has no marketplace, and no payload here pins its sub-agent.
 */
function skillEntry(overrides: Record<string, unknown> = {}) {
  return {
    install: "eject",
    scope: "global",
    assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    ...overrides,
  };
}

/**
 * A skill added from outside the catalogue, as it reaches the receiver: minted id, the category
 * the sharer confirmed, and the whole directory inline.
 *
 * A NON-exclusive category, for the reason `init-from-external-skills.e2e.test.ts` gives: an
 * exclusive one holds a single skill, so placing a carried skill beside a catalogue skill in one
 * would make these specs about that rule instead of about carried content.
 */
const EXTERNAL_ID = "external-web-tooling-brainstorming";
const EXTERNAL_REPO = "obra/superpowers";
const EXTERNAL_PATH = "skills/brainstorming";
const EXTERNAL_FILES = {
  [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
  "reference/prompts.md": "# Prompts\n",
};

function externalEntry() {
  return {
    displayName: "Brainstorming",
    description: "Structured brainstorming for hard problems",
    categoryId: "web-tooling",
    repo: EXTERNAL_REPO,
    path: EXTERNAL_PATH,
    files: EXTERNAL_FILES,
  };
}

describe("share", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A fresh directory, cleaned up after the spec that took it. Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  it("mints an id whose install matches the installation it was minted from", async () => {
    const origin = await takeTempDir();
    store.publish(
      "Origin01",
      seedPayload({
        [E2E_SKILL.react.id]: skillEntry(),
        [E2E_SKILL.vitest.id]: skillEntry({
          assignments: { [E2E_AGENT["web-developer"].name]: "preloaded" },
        }),
      }),
    );
    const installed = await runInitFrom(store, "Origin01", { dir: origin }, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    const shared = await runShare(store, { dir: origin });

    expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(store.minted).toHaveLength(1);
    const mintedId = firstElement(store.minted);
    expect(shared.output).toContain(mintedId);

    // The other direction, in a directory that has never seen any of this: same skills at the
    // same scopes, the same sub-agent roster, and the same per-agent curation.
    const rebuilt = await takeTempDir();
    const reinstalled = await runInitFrom(store, mintedId, { dir: rebuilt }, sourceDir);
    expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );

    const before = await loadConfigOrFail(origin);
    const after = await loadConfigOrFail(rebuilt);
    expect(after.skills).toStrictEqual(before.skills);
    expect(after.agents).toStrictEqual(before.agents);
    expect(after.stack).toStrictEqual(before.stack);
    // Both sides of the install, not just the config: a config that agrees while the disk does
    // not is the failure the round trip exists to rule out.
    expect(await listFiles(skillsPath(rebuilt))).toStrictEqual(await listFiles(skillsPath(origin)));
    expect(await listFiles(agentsPath(rebuilt))).toStrictEqual(await listFiles(agentsPath(origin)));
    // The preload split the original payload asked for survives both directions.
    await expect({ dir: rebuilt }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      exactSkills: [E2E_SKILL.vitest.id],
    });

    // Both ENDS of the round trip, at four-surface strength. The comparisons above are
    // origin-against-rebuild, so two installations that are equally broken satisfy every one of
    // them — a generated pair that stopped narrowing travels perfectly. Each end is checked
    // against itself here, which is the claim a symmetry check cannot make.
    await expectFourSurfaces(origin);
    await expectFourSurfaces(rebuilt);
  });

  it("carries an added skill's own bytes back, so the minted id installs it too", async () => {
    const origin = await takeTempDir();
    store.publish(
      "Origin03",
      seedPayload({ [EXTERNAL_ID]: skillEntry() }, {}, { [EXTERNAL_ID]: externalEntry() }),
    );
    const installed = await runInitFrom(store, "Origin03", { dir: origin }, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    const shared = await runShare(store, { dir: origin });
    expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);

    // A skill no catalogue knows answers to no id on the way back in either, so the content has
    // to travel a second time or the id this share minted installs a configuration missing it.
    const posted: { external?: Record<string, { repo: string; path: string }> } = JSON.parse(
      firstElement(store.requests.filter((request) => request.method === "POST")).body,
    );
    expect(Object.keys(posted.external ?? {})).toStrictEqual([EXTERNAL_ID]);
    // Provenance, rebuilt from what the install recorded on disk: where the bytes came from is
    // what lets a reader go and look, and the path is the only address a skill outside every
    // catalogue has.
    expect(posted.external?.[EXTERNAL_ID]?.repo).toBe(EXTERNAL_REPO);
    expect(posted.external?.[EXTERNAL_ID]?.path).toBe(EXTERNAL_PATH);

    const rebuilt = await takeTempDir();
    const mintedId = firstElement(store.minted);
    const reinstalled = await runInitFrom(store, mintedId, { dir: rebuilt }, sourceDir);
    expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    // The failure this whole leg exists to end: the id reported as one the catalogue does not
    // know, because the second payload named it and carried nothing.
    expect(flattenCliOutput(reinstalled.output)).not.toContain("does not know");

    // Both sides of the install, and the whole directory rather than the manifest alone: a skill
    // that arrives without its reference files loads and then cannot do what it says.
    const before = await loadConfigOrFail(origin);
    const after = await loadConfigOrFail(rebuilt);
    expect(after.skills).toStrictEqual(before.skills);
    expect(after.stack).toStrictEqual(before.stack);
    expect(await listFiles(skillsPath(rebuilt))).toStrictEqual([EXTERNAL_ID]);
    for (const file of [FILES.SKILL_MD, path.join("reference", "prompts.md")]) {
      expect(await readTestFile(path.join(skillsPath(rebuilt), EXTERNAL_ID, file))).toBe(
        await readTestFile(path.join(skillsPath(origin), EXTERNAL_ID, file)),
      );
    }

    // An id no catalogue knows has to reach the generated unions at both ends, or the config
    // each end wrote names a skill its own `config-types.ts` never learned.
    await expectFourSurfaces(origin);
    await expectFourSurfaces(rebuilt);
  });

  it("identifies itself as the CLI, and posts to the collection rather than to an id", async () => {
    const origin = await takeTempDir();
    store.publish("Origin02", seedPayload({ [E2E_SKILL.react.id]: skillEntry() }));
    await runInitFrom(store, "Origin02", { dir: origin }, sourceDir);
    store.reset();

    await runShare(store, { dir: origin });

    expect(store.requests).toHaveLength(1);
    expect(firstElement(store.requests).method).toBe("POST");
    expect(firstElement(store.requests).url).toBe("/configs");
    expect(firstElement(store.requests).userAgent).toBe("agents-inc-cli");
  });

  it("leaves a skill the user wrote themselves out of what it shares", async () => {
    // Two ejected skills, indistinguishable in config.ts — both `origin: "eject"`. What tells
    // them apart is on disk: the CLI stamps `forkedFrom` into every skill it copies, and a
    // skill somebody wrote by hand into `.claude/skills/` carries none.
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
    });
    tempDirs.push(path.dirname(project.dir));
    await addForkedFromMetadata(project.dir, E2E_SKILL.react.id);

    const shared = await runShare(store, project);

    expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
    // Not refused and not carried: a user-authored skill is outside the round trip, so nothing
    // about leaving it home is lossy — it was never in scope. `edit --from` must not delete it
    // either, which is the same rule read from the other end.
    const posted: { skills: Record<string, unknown>; external?: unknown } = JSON.parse(
      firstElement(store.requests).body,
    );
    expect(Object.keys(posted.skills)).toStrictEqual([E2E_SKILL.react.id]);
    // `expect(posted.external).toBeUndefined()` sat here and proved nothing: this fixture's two
    // skills are CATALOGUE skills, and `external` only ever carries ids no catalogue resolves, so
    // it is undefined whether the rule works or not. The discriminating assertion is the one
    // above — the posted id set is exactly the catalogue skill, with the user-authored directory
    // absent from it. A spec that needs the content half asserted needs an EXTERNAL skill in the
    // fixture; the sibling above, which posts `EXTERNAL_ID`, is that spec.
  });

  it("refuses a directory with nothing installed, without spending a write", async () => {
    const empty = await takeTempDir();

    const { exitCode, output } = await runShare(store, { dir: empty });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("No installation found");
    // An id for an empty configuration is a dead link, and minting one spends a write from the
    // scarce half of the store's free tier.
    expect(store.requests).toStrictEqual([]);
  });
});
