import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { parse as parseYaml } from "yaml";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerExternalSkills, writeExternalSkills } from "./external-skills.js";
import { seedToWizardResult } from "./seed-to-wizard.js";
import { STANDARD_FILES } from "../../consts.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { parseFrontmatter } from "../loading/loader.js";
import { initializeMatrix } from "../matrix/matrix-provider.js";
import { validateSkillMetadata } from "../schemas.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../__tests__/factories/seed-factories.js";
import { createMockSkill, sa } from "../__tests__/factories/skill-factories.js";
import { renderMetadataYaml, renderSkillMd } from "../__tests__/content-generators.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { FALLBACK_USAGE } from "../__tests__/mock-data/mock-skills.js";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir, fileExists } from "../__tests__/test-fs-utils.js";

import type { LocalSkillMetadata } from "../skills/skill-metadata.js";
import type { MergedSkillsMatrix, SkillId, SkillSlug } from "../../types/index.js";
import type { SeedExternalSkill } from "@workspace/matrix/seed";

/**
 * External skills: the one kind of skill a payload carries rather than names.
 *
 * Every other id in a payload is resolved by the receiver against a catalogue it already has, so
 * an id this catalogue does not know is skipped. An added skill answers to no catalogue at all —
 * its whole directory travels inline — so the receiver has to seat it as a catalogue entry AND
 * write its bytes, or the id it was keyed by is skipped like any other unknown one and the
 * configuration installs quietly smaller than it was shared.
 */

/**
 * The id an added skill is minted under at intake — `external-<category>-<name>`.
 *
 * Boundary cast, the same one `CUSTOM_HOUSE_TOOLING_ID` carries: a skill outside every catalogue
 * has an id outside the generated union by construction, and it has to index a matrix keyed by it.
 */
const EXTERNAL_ID = "external-web-framework-brainstorming" as SkillId;
const SECOND_EXTERNAL_ID = "external-web-framework-worktrees" as SkillId;
const WEB_DEV = "web-developer";

/**
 * The `agents` entry a project-scoped skill's assignment has to be paired with. Absent, a
 * sub-agent rests at the shared selection default and a project skill has nowhere to be written
 * on it.
 *
 * **Seven files declare this name and none exports it, by decision rather than by oversight** —
 * `grep -rn "const PINNED_TO_PROJECT" src e2e --include='*.ts'` is the census, and this note is
 * here because the previous wording ("spelled the way the `init-from-*` specs spell it") reads
 * like a shared import a reader would go looking for. It is not one, and it should not become
 * one. The sites fail the same-reason-to-change test in `clean-code-standards.md` 8.8: each
 * states `"project"` precisely so its own subject stays observable no matter what
 * `DEFAULT_SELECTION_OPTIONS.scope` becomes, so there is no future in which they move together.
 * And the value is an OBJECT — `agents: { [WEB_DEV]: PINNED_TO_PROJECT }` hands over the
 * identity, which is CLAUDE.md's ban on exporting a shared constant callers receive by identity.
 * A two-token literal is the cheaper half of that trade.
 */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * The metadata.yaml a skill EJECTED from a marketplace carries: provenance naming the id that
 * installs it again, and no directory beside it.
 *
 * That absence is the whole point, and it is the generator's own shape rather than an omission
 * arranged here — `renderMetadataYaml`'s `forkedFrom` has no `path` field, because `copySkillTo`
 * writes none. Only a skill a shared configuration CARRIED records where inside a repository its
 * bytes came from, since that pair is the only address it has.
 */
const EJECTED_SKILL_METADATA = renderMetadataYaml({
  author: "@acme",
  displayName: "Acme House Style",
  category: "web-framework",
  contentHash: "abc1234",
  forkedFrom: { skillId: SECOND_EXTERNAL_ID, contentHash: "abc1234", date: "2026-01-01" },
});

/**
 * A fresh matrix per spec rather than a shared constant from `mock-matrices.ts`: registration
 * writes the payload's entries INTO the matrix it is given, exactly as the local-skill merge
 * does, and a module-level constant would carry one spec's added skill into every later one.
 */
function catalogueWithFrameworkCategory(): MergedSkillsMatrix {
  return createMockMatrix(SKILLS.react, {
    categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
  });
}

describe("registerExternalSkills", () => {
  let matrix: MergedSkillsMatrix;
  let projectDir: string;

  beforeEach(async () => {
    matrix = catalogueWithFrameworkCategory();
    initializeMatrix(matrix);
    projectDir = await createTempDir("cc-external-register-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("seats the payload's own catalogue entry under the category the sharer confirmed", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
      },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
      // Stated on both sides because the localPath below names the project: a project skill never
      // reaches a sub-agent resting at the shared selection default, so an assignment left to pair
      // itself with one would be a configuration nothing in this product can hand out.
      agents: { [WEB_DEV]: PINNED_TO_PROJECT },
    });

    registerExternalSkills(payload, matrix, projectDir);

    // The category is the whole of the entry's reach: it decides the domain, the grid tab, and
    // which sub-agent stack the assignment lands in. Everything else is what the sharer saw.
    expect(matrix.skills[EXTERNAL_ID]).toMatchObject({
      id: EXTERNAL_ID,
      slug: EXTERNAL_ID,
      displayName: "Brainstorming",
      description: "Structured brainstorming for hard problems",
      category: "web-framework",
      local: true,
      custom: true,
      localPath: path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID),
    });
    // Claimed on the identity axis too — an entry the slug map does not carry is invisible to
    // anything that addresses a skill by slug.
  });

  it("seats an entry the decode that runs immediately after it can still read", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }) },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    registerExternalSkills(payload, matrix, projectDir);

    // Registration is the first half of the install and the decode is the very next step, so a
    // payload this function seats and that one throws on is one no install can reach the end of.
    // The pair is what decides it, and neither half is stated here: this is the payload the
    // factories compose when a caller says nothing about scope on either side.
    expect(() => seedToWizardResult(payload, matrix)).not.toThrow();
  });

  it("returns the scope each entry names, so its bytes are written where its skill row says", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ scope: "global" }) },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    expect(installs.map((install) => [install.id, install.scope])).toStrictEqual([
      [EXTERNAL_ID, "global"],
    ]);
  });

  it("leaves content no skill row selects out of the install", () => {
    const payload = buildSeedPayload({
      skills: {},
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    // Presence in `skills` is selection; `external` is only where the bytes are. Content nobody
    // picked installs nothing, and seating it would put a skill in the grid nobody chose.
    expect(installs).toStrictEqual([]);
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });

  it("does not seat a skill whose category this catalogue does not declare", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill({ categoryId: "web-not-a-category-here" }),
      },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    // A skill is PLACED in the taxonomy, never extends it: a category this catalogue has no
    // definition for belongs to no domain, renders in no tab and reaches no sub-agent. Left
    // unseated, the id falls to the decode's own skip — reported by name, never fatal.
    expect(installs).toStrictEqual([]);
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });

  it("gives the seated skill the same reach a catalogue skill has", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({
          scope: "project",
          assignments: { [WEB_DEV]: "preloaded" },
        }),
      },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
      agents: { [WEB_DEV]: PINNED_TO_PROJECT },
    });

    registerExternalSkills(payload, matrix, projectDir);
    const { result, skippedSkillIds } = seedToWizardResult(payload, matrix);

    // The whole point of seating it: past registration the decode has no idea this id arrived
    // with its own bytes, so the assignment lands in the sub-agent's stack under the confirmed
    // category, at the load state the sharer chose.
    expect(skippedSkillIds).toStrictEqual([]);
    expect(result.skills).toStrictEqual(buildSkillConfigs([EXTERNAL_ID]));
    expect(result.assignedStack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(EXTERNAL_ID, true)] },
    });
  });

  it("refuses a carried skill claiming an id the catalogue already owns, naming every one", () => {
    const catalogue = createMockMatrix(SKILLS.react, SKILLS.vue, {
      categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
    });
    initializeMatrix(catalogue);
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill(),
        [SKILLS.vue.id]: buildSeedSkill(),
      },
      external: {
        [SKILLS.react.id]: buildSeedExternalSkill(),
        [SKILLS.vue.id]: buildSeedExternalSkill(),
      },
    });

    // A skill id is the directory the skill installs into, so a carried skill taking a catalogue
    // id writes its own bytes where the catalogue's copy belongs — and every consumer downstream
    // reads the payload's content under the catalogue's name. Both ids are named at once for the
    // same reason the plugin refusal names both: a sharer who fixes one only to be refused for
    // the next learns nothing the first message could not have told them.
    expect(() => registerExternalSkills(payload, catalogue, projectDir)).toThrow(
      new RegExp(`${SKILLS.react.id}[\\s\\S]*${SKILLS.vue.id}`),
    );
    // Both incumbents are still the catalogue's, which is the half a thrown error does not prove:
    // the seat writes into the matrix in place, so a guard placed after it would refuse the run
    // having already replaced the entries every later read in this process resolves. Both,
    // because a guard that throws on the FIRST collision it meets has already overwritten
    // whatever it seated on the way there, and only the second entry can show that.
    expect([catalogue.skills[SKILLS.react.id], catalogue.skills[SKILLS.vue.id]]).toStrictEqual([
      SKILLS.react,
      SKILLS.vue,
    ]);
  });

  it("refuses a carried skill claiming a shipped catalogue id the loaded matrix does not carry", () => {
    // The payload chooses which catalogue is loaded — `sharedConfigSourceFlags` in
    // `commands/init.tsx` passes `payload.marketplace` to the loader — so a payload naming a
    // marketplace that does not ship the id it impersonates meets no incumbent in the matrix
    // this function is handed. The shipped catalogue is the half no payload can move, which is
    // why `refuseCatalogueCollisions` in `loading/source-loader.ts` reads it, and this asks the
    // same question of the same set.
    const otherMarketplace = createMockMatrix(SKILLS.vue, {
      categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
    });
    initializeMatrix(otherMarketplace);
    const payload = buildSeedPayload({
      skills: { [SKILLS.react.id]: buildSeedSkill() },
      external: { [SKILLS.react.id]: buildSeedExternalSkill() },
    });

    // The subject guard: with the id seated here the refusal would be the loaded-matrix arm's,
    // and this spec would pass against the build it exists to red.
    expect(
      otherMarketplace.skills[SKILLS.react.id],
      "the matrix the payload steered must not carry the impersonated id",
    ).toBeUndefined();
    expect(() => registerExternalSkills(payload, otherMarketplace, projectDir)).toThrow(
      SKILLS.react.id,
    );
    expect(otherMarketplace.skills[SKILLS.react.id]).toBeUndefined();
  });

  it("seats a carried skill over this installation's own copy, so re-applying is not a collision", () => {
    // What `edit --from` hands this function on a SECOND apply: the id is in the matrix because
    // the local-skill merge read the directory a previous apply wrote, not because a marketplace
    // ships it. Refusing that would make a shared configuration installable exactly once.
    //
    // `category` and `slug` are stated because `createMockSkill` throws for an id its canonical
    // registry does not carry, and a skill outside every catalogue is outside that table by
    // construction. Neither is read off the id's segments: the category is the one the payload
    // below confirms and this matrix declares, and slug-equals-id is what `externalSlug` makes
    // true of every carried skill — a skill answering to no catalogue has no shorter name, and the
    // cast is that function's own (`return id as SkillSlug`) rather than a second opinion.
    const carried = buildSeedExternalSkill();
    const withOwnCopy = createMockMatrix(
      createMockSkill(EXTERNAL_ID, {
        category: "web-framework",
        slug: EXTERNAL_ID as SkillSlug,
        local: true,
        custom: true,
      }),
      { categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }) },
    );
    initializeMatrix(withOwnCopy);
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: { [EXTERNAL_ID]: carried },
    });

    expect(registerExternalSkills(payload, withOwnCopy, projectDir).map(({ id }) => id)) //
      .toStrictEqual([EXTERNAL_ID]);
    // The mirror of the refusal above, and what makes the pair a control rather than two specs
    // about different things: there the incumbent had to SURVIVE, here it has to be replaced by
    // the payload's own entry. Held against the values the payload carries rather than literals,
    // because the local copy's own displayName and description are what a seat that silently
    // did nothing would leave behind.
    expect(withOwnCopy.skills[EXTERNAL_ID]).toMatchObject({
      displayName: carried.displayName,
      description: carried.description,
    });
  });

  it("refuses to install an added skill as a plugin, naming every one", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ install: "plugin" }),
        [SECOND_EXTERNAL_ID]: buildSeedSkill({ install: "plugin" }),
      },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [SECOND_EXTERNAL_ID]: buildSeedExternalSkill(),
      },
    });

    // The payload IS the source, so there is no marketplace for a plugin install to fetch from —
    // and both are named at once, because a sharer who fixes one only to be refused for the next
    // learns nothing the first message could not have told them.
    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      new RegExp(`${EXTERNAL_ID}[\\s\\S]*${SECOND_EXTERNAL_ID}`),
    );
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });
});

describe("writeExternalSkills", () => {
  let matrix: MergedSkillsMatrix;
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    matrix = catalogueWithFrameworkCategory();
    initializeMatrix(matrix);
    tempDir = await createTempDir("cc-external-write-");
    projectDir = path.join(tempDir, "project");
    // Global scope resolves through `os.homedir()`, which reads $HOME on POSIX — without the
    // stub a global-scoped entry would be written into the developer's own ~/.claude.
    vi.stubEnv("HOME", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  /** Registers and writes in the order both producers must: seat the entries, then write them. */
  async function install(
    external: SeedExternalSkill,
    scope: "project" | "global",
  ): Promise<string> {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ scope }) },
      external: { [EXTERNAL_ID]: external },
    });
    await writeExternalSkills(registerExternalSkills(payload, matrix, projectDir));
    return path.join(resolveInstallPaths(projectDir, scope).skillsDir, EXTERNAL_ID);
  }

  /**
   * A skill directory already standing where a carried skill's bytes would land, described by
   * `metadata` — or by nothing at all, which is how a skill somebody wrote by hand most often
   * arrives.
   */
  async function standingSkillDir(id: SkillId, metadata: string | null): Promise<string> {
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, id);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(id));
    if (metadata !== null) {
      await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), metadata);
    }
    return skillDir;
  }

  it("writes the whole directory it was given, nesting and all", async () => {
    const skillDir = await install(
      buildSeedExternalSkill({
        files: {
          "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
          "reference/api.md": "# API\n",
        },
      }),
      "project",
    );

    // A skill is its SKILL.md AND everything under it: the manifest alone installs something
    // that loads and then cannot do what it says.
    expect(await readFile(path.join(skillDir, "reference/api.md"), "utf8")).toBe("# API\n");
    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      "Structured brainstorming",
    );
  });

  it("writes a global-scoped skill into the user's own skills directory", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "global");

    expect(skillDir).toBe(path.join(tempDir, ".claude", "skills", EXTERNAL_ID));
    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      EXTERNAL_ID,
    );
  });

  it("names the skill by the id it installs under, so a sub-agent's reference resolves", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // Every loader reads a skill's id off its frontmatter `name`, and a compiled sub-agent
    // references it by the id the config recorded — the minted one. Left as the repository
    // wrote it, the two never meet: the agent names a skill Claude Code knows as something else,
    // and the next load registers an id the configuration does not carry.
    const frontmatter = parseFrontmatter(
      await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8"),
    );
    expect(frontmatter?.name).toBe(EXTERNAL_ID);
    // Only the name. The description is the author's and travels untouched.
    expect(frontmatter?.description).toBe("Structured brainstorming");
  });

  it("registers the skill on disk as well as in memory, under the same taxonomy", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // The in-memory seat lasts one run. What makes the skill survive the next `edit`, `compile`
    // or `list` is a metadata.yaml the local-skill discovery can read it out of — carrying the
    // category the sharer confirmed and the domain that category belongs to.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata).toMatchObject({
      displayName: "Brainstorming",
      slug: EXTERNAL_ID,
      category: "web-framework",
      domain: "web",
      custom: true,
    });
  });

  it("writes a metadata.yaml this installation's own validator accepts", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // `doctor` validates every installed skill's metadata.yaml against the schema below, so a
    // file this command writes and that command reports as an error is the CLI disagreeing with
    // itself — and a user who cannot fix it (the skill is somebody else's repository) learns to
    // ignore `doctor` instead. What the payload cannot say is defaulted in the CLI's own idiom,
    // not left out.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );

    const validated = validateSkillMetadata(metadata);
    expect(validated.success ? [] : validated.error.issues.map((issue) => issue.path.join("."))) //
      .toStrictEqual([]);
  });

  it("keeps what the repository shipped where the payload has nothing to say", async () => {
    const shipped = "Use when a decision has more than one defensible answer";
    const skillDir = await install(
      buildSeedExternalSkill({
        files: {
          "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME),
          "metadata.yaml": `usageGuidance: "${shipped}"\nauthor: "@jesse"\n`,
        },
      }),
      "project",
    );

    // Only what the sharer CONFIRMED is written over the repository's own file — the placement in
    // this taxonomy, and the names the editor showed. Everything else it shipped is kept, because
    // a skill's author knows more about when to use it than a default does.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata).toMatchObject({ usageGuidance: shipped, author: "@jesse" });
  });

  it("stamps the provenance that says this directory is the CLI's copy, not the user's own", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // `forkedFrom` is the package's one answer to "did the CLI put this here?" — `uninstall`
    // reads it to decide what it may delete, and the producer reads it to decide what the round
    // trip owns. An added skill IS the round trip's, so it says so where that question is asked.
    //
    // Both halves of the address, because sharing this installation has to rebuild the entry the
    // payload arrived as: a repository alone cannot say which of its directories travelled, and a
    // skill answering to no catalogue has no id anyone can resolve instead.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata.forkedFrom).toMatchObject({
      skillId: EXTERNAL_ID,
      source: "github:obra/superpowers",
      path: "skills/brainstorming",
    });
  });

  it("states when to reach for the skill in the same sentence the stack loader falls back to", async () => {
    const skillDir = await install(
      buildSeedExternalSkill({ categoryId: "web-framework" }),
      "project",
    );

    // One sentence, one definition. A carried skill's trigger line is reachable by two routes —
    // this file, on every load after the install, and `statedUsageFor` in
    // `stacks/stacks-loader.ts` during the run that seats it — and the two used to disagree on
    // both halves: the category against the display name, and a trailing period against none.
    // Held against `FALLBACK_USAGE`, which MIRRORS the product's wording rather than importing
    // it, so a change to the template reddens here instead of moving both sides at once.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata.usageGuidance).toBe(FALLBACK_USAGE["web-framework"]);
  });

  it("refuses to write over a skill directory no shared configuration carried, naming every one", async () => {
    const handAuthored = await standingSkillDir(EXTERNAL_ID, null);
    const ejected = await standingSkillDir(SECOND_EXTERNAL_ID, EJECTED_SKILL_METADATA);
    // Stated on both entries: the standing directories above are the project's, and the shared
    // selection default rests at global — so a payload that said nothing would be judged against
    // the user's own ~/.claude and meet nothing at all.
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ scope: "project" }),
        [SECOND_EXTERNAL_ID]: buildSeedSkill({ scope: "project" }),
      },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [SECOND_EXTERNAL_ID]: buildSeedExternalSkill(),
      },
    });

    // `forkedFrom.path` is the one thing that says a directory arrived inside a shared
    // configuration: {@link registerSkillOnDisk} is the only writer of it and `readCarriedSkill`
    // reads it for this exact question. `local` cannot stand in for it — the local-skill merge
    // writes that flag on everything it finds, so the user's own work and a marketplace skill
    // ejected here both wear it. Both are named at once, for the same reason the two refusals
    // above name every id: a user who moves one directory only to be refused for the next
    // learns nothing the first message could not have told them.
    await expect(writeExternalSkills(registerExternalSkills(payload, matrix, projectDir))) //
      .rejects.toThrow(new RegExp(`${EXTERNAL_ID}[\\s\\S]*${SECOND_EXTERNAL_ID}`));

    // And neither directory moved. A refusal that had already written the first of two is a
    // refusal that destroyed what it was raised to protect.
    expect(await readFile(path.join(handAuthored, STANDARD_FILES.SKILL_MD), "utf8")).toBe(
      renderSkillMd(EXTERNAL_ID),
    );
    expect(await fileExists(path.join(handAuthored, STANDARD_FILES.METADATA_YAML))).toBe(false);
    expect(await readFile(path.join(ejected, STANDARD_FILES.METADATA_YAML), "utf8")).toBe(
      EJECTED_SKILL_METADATA,
    );
  });

  it("writes over the directory a previous apply carried, so re-applying is not a refusal", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // The control for the refusal above, and the constraint the whole re-apply rests on:
    // `edit --from` applies a shared configuration destructively over an existing install, so a
    // carried skill a previous apply wrote is met again on the next one. Refusing it would make
    // a shared configuration installable exactly once.
    await install(
      buildSeedExternalSkill({
        files: { "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Revised upstream") },
      }),
      "project",
    );

    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      "Revised upstream",
    );
  });

  it("refuses a file path that escapes the skill's own directory", async () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill({
          files: {
            "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME),
            "../../../escaped.md": "owned",
          },
        }),
      },
    });
    const installs = registerExternalSkills(payload, matrix, projectDir);

    // The keys come off the wire, so a payload can ask for any path it likes. The same guard the
    // skill copier applies to a marketplace's own paths applies to these.
    await expect(writeExternalSkills(installs)).rejects.toThrow("escaped.md");
  });
});
