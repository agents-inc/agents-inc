import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";

/** Set only by the spec driving the default source from disk; else the load reads this checkout. */
const { projectRootOverride } = vi.hoisted(() => ({
  projectRootOverride: { value: undefined as string | undefined },
}));

vi.mock("../../consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../consts")>();
  return {
    ...actual,
    get PROJECT_ROOT() {
      return projectRootOverride.value ?? actual.PROJECT_ROOT;
    },
  };
});
import {
  loadSkillsMatrixFromSource,
  convertStackToResolvedStack,
  mergeLocalSkillsIntoMatrix,
} from "./source-loader";
import { MarketplaceNameRefusedError } from "./source-fetcher";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createMockSkill,
  createMockSkillAssignment,
  createMockExtractedSkill,
  createTestSkill,
} from "../__tests__/factories/skill-factories.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { createMockCategory } from "../__tests__/factories/category-factories.js";
import { createMockStack } from "../__tests__/factories/stack-factories.js";
import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../__tests__/factories/plugin-factories.js";
import {
  CLAUDE_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  MARKETPLACE_JSON,
  SKILL_RULES_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  marketplaceManifestPath,
} from "../../consts";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  TEST_MARKETPLACE_NAME,
  type TestDirs,
  type TestSkill,
  type TestStack,
} from "../__tests__/fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS, EXTRA_DOMAIN_TEST_SKILLS } from "../__tests__/mock-data/mock-skills";
import type {
  AgentName,
  Category,
  CategoryDefinition,
  CategoryPath,
  MergedSkillsMatrix,
  ResolvedSkill,
  ResolvedStack,
  SkillId,
  SkillSlug,
  Stack,
} from "../../types";
import { renderConfigTs, renderSkillMd } from "../__tests__/content-generators";
import { getErrorMessage } from "../../utils/errors";
import { disableBuffering, drainBuffer, enableBuffering } from "../../utils/logger";
import { defaultCategories } from "../configuration/default-categories";
import { defaultStacks } from "../configuration/default-stacks";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { allSkills, initializeMatrix, matrix } from "../matrix/matrix-provider";
// Cleared through the resolver's own constant: these hooks assert nothing.
import { SOURCE_ENV_VAR } from "../configuration/config";
import { LOCAL_DEFAULTS } from "../metadata-keys";
import type { LocalSkillDiscoveryResult } from "../skills";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { typedEntries, typedKeys, typedValues } from "../../utils/typed-object";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";

/** In its own namespace: a custom marketplace shipping a catalogue id is refused whole. */
const FIXTURE_SKILLS = inTestMarketplace([...DEFAULT_TEST_SKILLS, ...EXTRA_DOMAIN_TEST_SKILLS]);

/** The fixture marketplace's id for the skill the source's react entry publishes. */
const FIXTURE_REACT_ID = testMarketplaceSkillId("web-framework-react");

/** The same, for the entry the local-skill merge specs overwrite. */
const FIXTURE_VITEST_ID = testMarketplaceSkillId("web-testing-vitest");

const FIXTURE_SKILL_COUNT = FIXTURE_SKILLS.length;

const BUILT_IN_CATEGORY_COUNT = Object.keys(defaultCategories).length;

/** An absolute local path with nothing at it — the loader must refuse, not load empty. */
const MISSING_SOURCE_PATH = "/non/existent/path";

const UNRESOLVED_SLUG_WARNING = "Unresolved slug";

/** A slug the built-in rules name and no test source ships. */
const SLUG_NO_TEST_SOURCE_SHIPS: SkillSlug = "angular-standalone";

/** A slug only a user's own skill carries — nothing in any catalogue claims it. */
// Boundary cast: a local skill's slug is outside the generated union, as its id is
const LOCAL_ONLY_SLUG = "house-style" as SkillSlug;

/** The id and slug of the local skill the load-level slug specs write to disk. */
const LOCAL_DISK_SKILL_ID = "my-house-style";
const LOCAL_DISK_SKILL_SLUG = LOCAL_ONLY_SLUG;

/** A slug the test source does ship — read off the fixture so it cannot drift from it. */
const SLUG_THE_TEST_SOURCE_SHIPS: SkillSlug = firstElement(FIXTURE_SKILLS).slug;

/** A manifest `marketplaceSchema` refuses, because `owner.name` may not be empty. */
const MANIFEST_WITH_UNNAMED_OWNER = {
  ...createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
  owner: { name: "" },
};

/** The field that manifest breaks, which the refusal has to name. */
const UNREADABLE_MANIFEST_FIELD = "owner.name";

/** `build plugins` writes what `build marketplace` lists. */
const BUILDS_IN_ORDER = /build plugins[\s\S]*build marketplace/;

/**
 * No file, a file that is not JSON, and JSON the schema refuses: three routes through the loader.
 */
const MANIFEST_DEFECTS = ["absent", "unparseable", "refused by the schema"] as const;

type ManifestDefect = (typeof MANIFEST_DEFECTS)[number];

const UNPARSEABLE_MANIFEST = "{ this is not json";

/** A marketplace on disk whose manifest is present and refused by the loader's own schema. */
async function writeMarketplaceWithUnreadableManifest(tempDir: string): Promise<string> {
  return writeMarketplaceWithManifestDefect(tempDir, "refused by the schema");
}

/** A marketplace on disk, shipping the fixture's skills, whose manifest is in the state `defect` names. */
async function writeMarketplaceWithManifestDefect(
  tempDir: string,
  defect: ManifestDefect,
): Promise<string> {
  const sourceDir = path.join(tempDir, `${defect.replaceAll(" ", "-")}-manifest-marketplace`);
  await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
  if (defect === "absent") return sourceDir;

  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    defect === "unparseable" ? UNPARSEABLE_MANIFEST : JSON.stringify(MANIFEST_WITH_UNNAMED_OWNER),
  );
  return sourceDir;
}

/** Writes the manifest a custom marketplace load requires, so the refusal is not the subject. */
async function publishMarketplace(sourceDir: string): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace([createMockMarketplacePlugin(FIXTURE_REACT_ID)]),
      name: TEST_MARKETPLACE_NAME,
    }),
  );
}

/** A name Claude Code will not register plugins under, then the accepted spelling. */
const MANIFEST_NAME_REFUSED = "Acme_Skills";
const MANIFEST_NAME_ACCEPTED = "acme-skills";

/** A marketplace on disk publishing under `name`, with no other defect in its manifest. */
async function writeMarketplaceNamed(
  tempDir: string,
  dirName: string,
  name: string,
): Promise<string> {
  const sourceDir = path.join(tempDir, dirName);
  await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
      name,
    }),
  );
  return sourceDir;
}

async function loadWithWarnings(
  sourceFlag: string,
  projectDir: string,
): Promise<{ matrix: MergedSkillsMatrix; warnings: string[] }> {
  enableBuffering();
  try {
    const { matrix } = await loadSkillsMatrixFromSource({ sourceFlag, projectDir });
    return { matrix, warnings: drainBuffer().map((message) => message.text) };
  } finally {
    disableBuffering();
  }
}

/** Widens once here: namespaced ids are strings outside the `SkillId` union. */
function loadedSkill(matrix: MergedSkillsMatrix, id: string): ResolvedSkill | undefined {
  // Boundary cast: skills keys are branded SkillId, widened to string for test indexing
  return (matrix.skills as Record<string, ResolvedSkill>)[id];
}

/** The same question of a stack conversion, which warns about what it drops. */
function convertStackWithWarnings(stack: Stack): {
  resolved: ResolvedStack;
  warnings: string[];
} {
  enableBuffering();
  try {
    const resolved = convertStackToResolvedStack(stack);
    return { resolved, warnings: drainBuffer().map((message) => message.text) };
  } finally {
    disableBuffering();
  }
}

/** The same question of a synchronous local-skill merge. */
function mergeLocalSkillsWithWarnings(
  matrix: MergedSkillsMatrix,
  localResult: LocalSkillDiscoveryResult,
): { matrix: MergedSkillsMatrix; warnings: string[] } {
  enableBuffering();
  try {
    const merged = mergeLocalSkillsIntoMatrix(matrix, localResult);
    return { matrix: merged, warnings: drainBuffer().map((message) => message.text) };
  } finally {
    disableBuffering();
  }
}

const FIXTURE_STACKS: TestStack[] = [
  {
    id: "fixture-test-stack",
    name: "Fixture Test Stack",
    description: "A stack for source-loader tests",
    agents: {
      "web-developer": {
        "web-framework": FIXTURE_REACT_ID,
      },
    },
  },
];

let fixtureDirs: TestDirs;

beforeAll(async () => {
  fixtureDirs = await createTestSource({
    skills: FIXTURE_SKILLS,
    stacks: FIXTURE_STACKS,
  });
});

afterAll(async () => {
  await cleanupTestSource(fixtureDirs);
});

/**
 * A fake home, since loads read HOME's global config and `~/.claude/skills`; bun fixes
 * `os.homedir()` at startup.
 */
let fakeHome: string;
let savedHome: string | undefined;

beforeEach(async () => {
  fakeHome = await createTempDir("cc-source-loader-home-");
  savedHome = process.env.HOME;
  process.env.HOME = fakeHome;
  vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
});

afterEach(async () => {
  vi.mocked(os.homedir).mockRestore();
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  projectRootOverride.value = undefined;
  await cleanupTempDir(fakeHome);
});

describe("source-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-loader-test-");
    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    delete process.env[SOURCE_ENV_VAR];
  });

  describe("loadSkillsMatrixFromSource", () => {
    describe("dev mode detection", () => {
      it("should use eject mode when devMode flag is explicitly set", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
          devMode: true,
        });

        expect(result.isLocal).toBe(true);
        expect(typeof result.matrix.version).toBe("string");
        const loadedSkillIds = Object.keys(result.matrix.skills);
        expect(loadedSkillIds).toHaveLength(FIXTURE_SKILL_COUNT);
        for (const skill of FIXTURE_SKILLS) {
          expect(loadedSkillIds).toContain(skill.id);
        }
      });

      it("should use source flag when provided", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.isLocal).toBe(true);
        expect(result.sourceConfig.source).toBe(fixtureDirs.sourceDir);
        expect(result.sourceConfig.sourceOrigin).toBe("flag");
      });
    });

    describe("local source loading", () => {
      it("should load matrix from local source", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        const loadedSkillIds = Object.keys(result.matrix.skills);
        expect(loadedSkillIds).toHaveLength(FIXTURE_SKILL_COUNT);
        for (const skill of FIXTURE_SKILLS) {
          expect(loadedSkillIds).toContain(skill.id);
        }
      });

      it("should set sourcePath to the root path", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.sourcePath).toBe(fixtureDirs.sourceDir);
      });

      it("should mark result as local", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.isLocal).toBe(true);
      });

      it("should resolve marketplace name from the source's marketplace.json", async () => {
        const sourceDir = path.join(tempDir, "local-marketplace-source");
        await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
        const manifestPath = marketplaceManifestPath(sourceDir);
        await mkdir(path.dirname(manifestPath), { recursive: true });
        await writeFile(
          manifestPath,
          JSON.stringify(
            createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
          ),
        );

        const result = await loadSkillsMatrixFromSource({
          sourceFlag: sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBe("test-marketplace");
      });

      it("should name a local marketplace after the manifest its builds wrote", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBe(TEST_MARKETPLACE_NAME);
      });
    });

    /** Refused, naming both builds in order; the fixture loads above are the permitted twin. */
    describe("a custom marketplace with no valid marketplace.json", () => {
      it.each(MANIFEST_DEFECTS)(
        "should refuse the load when the manifest is %s, naming the builds that write one",
        async (defect) => {
          const sourceDir = await writeMarketplaceWithManifestDefect(tempDir, defect);

          const refusal = await refusalLoading(sourceDir, tempDir);

          expect(
            refusal,
            "a marketplace with no valid marketplace.json must not load at all",
          ).not.toBeNull();
          expect(
            refusal,
            "the refusal must name `build plugins` and then `build marketplace`",
          ).toMatch(BUILDS_IN_ORDER);
        },
      );

      it("should call a manifest that is not there absent rather than unreadable", async () => {
        const sourceDir = await writeMarketplaceWithManifestDefect(tempDir, "absent");

        const refusal = await refusalLoading(sourceDir, tempDir);

        expect(refusal).toBe(
          `'${sourceDir}' has no .claude-plugin/marketplace.json, so it is not a marketplace yet.\n\n` +
            "Every marketplace other than the default one must publish a valid .claude-plugin/marketplace.json. " +
            "Run 'npx agents-inc build plugins' and then 'npx agents-inc build marketplace' in that marketplace's repository, which write it.",
        );
      });

      it("should name the field that failed when the manifest is there and the schema refuses it", async () => {
        const refusal = await refusalLoading(
          await writeMarketplaceWithUnreadableManifest(tempDir),
          tempDir,
        );

        expect(refusal, "an invalid manifest must be refused").not.toBeNull();
        expect(refusal, "the refusal must say what in the file is wrong").toContain(
          UNREADABLE_MANIFEST_FIELD,
        );
      });

      /** An upkeep load is not refused: everything it touches is already installed. */
      describe("read for the upkeep of an installation that names it", () => {
        async function installationNaming(sourceDir: string): Promise<void> {
          await writeTestTsConfig(
            tempDir,
            buildProjectConfig({ marketplace: sourceDir, marketplaceName: TEST_MARKETPLACE_NAME }),
          );
        }

        it.each(MANIFEST_DEFECTS)(
          "should load when the manifest is %s, under the name the installation recorded",
          async (defect) => {
            const sourceDir = await writeMarketplaceWithManifestDefect(tempDir, defect);
            await installationNaming(sourceDir);

            const result = await loadSkillsMatrixFromSource({
              projectDir: tempDir,
              skipExtraSources: true,
              matrixOnly: true,
              purpose: "upkeep",
            });

            expect(result.sourceConfig.source).toBe(sourceDir);
            expect(result.marketplace).toBe(TEST_MARKETPLACE_NAME);
          },
        );

        it("should still refuse the same installation's load for anything else", async () => {
          const sourceDir = await writeMarketplaceWithManifestDefect(tempDir, "absent");
          await installationNaming(sourceDir);

          await expect(
            loadSkillsMatrixFromSource({
              projectDir: tempDir,
              skipExtraSources: true,
              matrixOnly: true,
            }),
          ).rejects.toThrow(BUILDS_IN_ORDER);
        });
      });
    });

    describe("a marketplace.json naming a marketplace Claude Code cannot register", () => {
      it("should refuse the load rather than label the marketplace by its ref", async () => {
        const sourceDir = await writeMarketplaceNamed(tempDir, "refused", MANIFEST_NAME_REFUSED);

        const refusal = await refusalLoading(sourceDir, tempDir);

        expect(
          refusal,
          "a name Claude Code registers no plugin under leaves nothing installable, so the load must stop",
        ).not.toBeNull();
        expect(refusal, "the manifest holding the name must be named").toContain(MARKETPLACE_JSON);
        expect(refusal, "the refusal must state the rule, not the regex").toContain("kebab-case");
      });

      it("should load the same marketplace once its name is one Claude Code accepts", async () => {
        const sourceDir = await writeMarketplaceNamed(tempDir, "accepted", MANIFEST_NAME_ACCEPTED);

        const result = await loadSkillsMatrixFromSource({
          sourceFlag: sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBe(MANIFEST_NAME_ACCEPTED);
      });
    });

    /** A recorded name outranks the manifest's and is refused too; the last spec is the twin. */
    describe("an installation that recorded a reserved marketplace name", () => {
      async function installationRecording(marketplaceName: string): Promise<void> {
        const sourceDir = await writeMarketplaceNamed(tempDir, "recorded", MANIFEST_NAME_ACCEPTED);
        await writeTestTsConfig(
          tempDir,
          buildProjectConfig({ marketplace: sourceDir, marketplaceName }),
        );
      }

      function loadInstallation(): Promise<unknown> {
        return loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });
      }

      it("should refuse the load in the words a reserved manifest name is refused in", async () => {
        await installationRecording(EJECT_SOURCE);

        const refusal = loadInstallation();

        await expect(refusal).rejects.toBeInstanceOf(MarketplaceNameRefusedError);
        await expect(refusal).rejects.toThrow(`Marketplace name '${EJECT_SOURCE}' is reserved`);
      });

      it("should send the reader to the config that recorded the reserved name", async () => {
        const sourceDir = await writeMarketplaceNamed(tempDir, "recorded", MANIFEST_NAME_ACCEPTED);
        const configPath = await writeTestTsConfig(
          tempDir,
          buildProjectConfig({ marketplace: sourceDir, marketplaceName: EJECT_SOURCE }),
        );

        await expect(loadInstallation()).rejects.toThrow(
          `Choose a name of your own: set this installation up again, or correct the marketplaceName it recorded in '${configPath}'.`,
        );
      });

      it("should refuse it over the public catalogue too, which is read without a manifest", async () => {
        await writeTestTsConfig(tempDir, buildProjectConfig({ marketplaceName: EJECT_SOURCE }));

        await expect(loadInstallation()).rejects.toBeInstanceOf(MarketplaceNameRefusedError);
      });

      it("should load the same installation under the name it recorded when the name is its own", async () => {
        await installationRecording(MANIFEST_NAME_ACCEPTED);

        const result = await loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });

        expect(result.marketplace).toBe(MANIFEST_NAME_ACCEPTED);
      });
    });

    describe("matrixOnly", () => {
      it("should resolve the default source offline with the built-in matrix and empty sourcePath", async () => {
        // Resolves to DEFAULT_SOURCE; without matrixOnly this would fetch and fail loudly.
        const result = await loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });

        expect(result.sourcePath).toBe("");
        expect(result.isLocal).toBe(false);
        expect(Object.keys(result.matrix.skills)).toStrictEqual(
          Object.keys(BUILT_IN_MATRIX.skills),
        );
      });
    });

    describe("the public catalogue read offline", () => {
      it("should carry the built-in stacks and slug map as they ship", async () => {
        const result = await loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });

        expect(result.matrix.suggestedStacks).toStrictEqual(BUILT_IN_MATRIX.suggestedStacks);
        expect(result.matrix.slugMap.slugToId).toStrictEqual(BUILT_IN_MATRIX.slugMap.slugToId);
      });

      it("should label it with the marketplace name its installation recorded", async () => {
        await writeTestTsConfig(
          tempDir,
          buildProjectConfig({ marketplaceName: DEFAULT_PUBLIC_SOURCE_NAME }),
        );

        const result = await loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });

        expect(result.marketplace).toBe(DEFAULT_PUBLIC_SOURCE_NAME);
      });
    });

    describe("error handling", () => {
      it("should reject a local source path that does not exist, naming the path", async () => {
        // An unreadable named path is an argument error, not an empty catalog.
        await expect(
          loadSkillsMatrixFromSource({
            sourceFlag: MISSING_SOURCE_PATH,
            projectDir: tempDir,
          }),
        ).rejects.toThrow(`Local marketplace not found: '${MISSING_SOURCE_PATH}'`);
      });

      it("should return empty skills if skills directory is missing", async () => {
        // Create a directory without src/skills/ — published, so the manifest is not the subject
        const emptySource = path.join(tempDir, "empty-source");
        await mkdir(emptySource, { recursive: true });
        await publishMarketplace(emptySource);

        const result = await loadSkillsMatrixFromSource({
          sourceFlag: emptySource,
          projectDir: tempDir,
        });

        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        expect(Object.keys(result.matrix.skills)).toHaveLength(0);
      });
    });
  });
});

describe("source-loader relationship rules", () => {
  let tempDir: string;

  /** A source whose OWN `skill-rules.ts` names one slug it ships and one it does not. */
  async function createSourceWhoseOwnRulesDangle(): Promise<TestDirs> {
    const dirs = await createTestSource({ skills: FIXTURE_SKILLS });
    await writeFile(
      path.join(dirs.sourceDir, SKILL_RULES_PATH),
      renderConfigTs({
        version: "1.0.0",
        relationships: {
          conflicts: [
            {
              skills: [SLUG_THE_TEST_SOURCE_SHIPS, SLUG_NO_TEST_SOURCE_SHIPS],
              reason: "One slug this source ships, one it does not",
            },
          ],
          discourages: [],
          requires: [],
          alternatives: [],
        },
      }),
    );
    return dirs;
  }

  beforeEach(async () => {
    tempDir = await createTempDir("cc-relationship-rules-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("says nothing about the built-in slugs a source does not ship", async () => {
    // Built-in rules are narrowed to the shipped slugs, so dangling built-in names warn nothing.
    const { warnings } = await loadWithWarnings(fixtureDirs.sourceDir, tempDir);

    expect(warnings.filter((text) => text.includes(UNRESOLVED_SLUG_WARNING))).toStrictEqual([]);
  });

  it("hands the health check nothing for the built-in slugs a source does not ship", async () => {
    // Nor is a narrowed-out built-in slug reported against the source for `doctor`.
    const { matrix } = await loadWithWarnings(fixtureDirs.sourceDir, tempDir);

    expect(matrix.unresolvedSlugs).toBeUndefined();
  });

  it("still warns about a slug the source's own rules name and its skills do not carry", async () => {
    // A slug the source's author typed is the source's defect, caught at load.
    const dirs = await createSourceWhoseOwnRulesDangle();
    try {
      const { warnings } = await loadWithWarnings(dirs.sourceDir, tempDir);
      const unresolved = warnings.filter((text) => text.includes(UNRESOLVED_SLUG_WARNING));

      expect(unresolved).not.toStrictEqual([]);
      expect(
        unresolved.filter((text) => !text.includes(SLUG_NO_TEST_SOURCE_SHIPS)),
        "only the slug the source's own rules name may be reported unresolved",
      ).toStrictEqual([]);
    } finally {
      await cleanupTestSource(dirs);
    }
  });

  it("hands the health check the slug the source's own rules dangle", async () => {
    // `doctor` reads the matrix, so the finding must survive the merge.
    const dirs = await createSourceWhoseOwnRulesDangle();
    try {
      const { matrix } = await loadWithWarnings(dirs.sourceDir, tempDir);

      expect(matrix.unresolvedSlugs).toStrictEqual([SLUG_NO_TEST_SOURCE_SHIPS]);
    } finally {
      await cleanupTestSource(dirs);
    }
  });
});

describe("source-loader local skills integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-skills-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should merge local skills into matrix when .claude/skills exists", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-my-skill");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: My Local Skill\nslug: my-local-skill\ncliDescription: A local skill\ndomain: web\ncategory: web-tooling\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("my-local-skill", "A local skill", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Boundary cast: skills keys are branded SkillId, widened to string for test indexing
    const skills = result.matrix.skills as Record<string, ResolvedSkill>;
    const localSkill = skills["my-local-skill"];

    expect(localSkill).toStrictEqual(
      expect.objectContaining({
        id: "my-local-skill",
        category: "web-tooling",
        author: "@dummy-author",
        local: true,
        localPath: path.join(tempDir, ".claude/skills", "test-my-skill") + path.sep,
      }),
    );
  });

  it("tags a discovered skill the source does not carry with its local copy alone", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-house-tooling");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: House Tooling\nslug: house-tooling\ncliDescription: A skill the user wrote\ndomain: web\ncategory: web-tooling\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("external-web-tooling-house", "A skill the user wrote", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    const skills = result.matrix.skills as Record<string, ResolvedSkill>;
    const custom = skills["external-web-tooling-house"];

    expect(custom?.availableSources).toStrictEqual([
      { name: EJECT_SOURCE, type: "local", installed: true, installMode: "eject" },
    ]);
  });

  it("should not inject fake local category definitions into the matrix", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-cat-skill");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Category Test\nslug: cat-skill\ndomain: web\ncategory: web-tooling\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      `---\nname: cat-skill (@local)\ndescription: Category test\n---\nContent`,
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Local skills must not inject fake "local" categories.
    // Boundary cast: categories keys are branded Category, widened to string for test indexing
    expect(
      (result.matrix.categories as Record<string, CategoryDefinition>)["local/custom"],
    ).toBeUndefined();
  });

  it("should not modify matrix when no local skills exist", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir, // No .claude/skills directory
    });

    // The matrix may carry local categories from earlier tests, so assert on local skills instead.
    const localSkills = Object.values(result.matrix.skills).filter((s) => s.local === true);
    expect(localSkills).toHaveLength(0);
  });

  it("should preserve remote skill category when local skill overwrites with category 'local'", async () => {
    const targetSkillId = FIXTURE_REACT_ID;
    const expectedCategory = "web-framework";

    // The same id, a different category: the remote skill's category must survive.
    const skillsDir = path.join(
      tempDir,
      CLAUDE_DIR,
      STANDARD_DIRS.SKILLS,
      "test-override-category",
    );
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Override Test\nslug: override-test\ndomain: web\ncategory: web-styling`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(targetSkillId, "Local override", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Boundary cast: branded SkillId key widened to string for test indexing
    const overriddenSkill = (result.matrix.skills as Record<string, ResolvedSkill>)[targetSkillId];

    expect(overriddenSkill).toStrictEqual(
      expect.objectContaining({
        local: true,
        category: expectedCategory,
      }),
    );
  });

  it("should preserve existing skills when merging local skills", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-preserve");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Preserve Test\nslug: preserve-test\ndomain: web\ncategory: web-tooling\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("preserve-skill", "Preserve test", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    const marketplaceSkills = Object.values(result.matrix.skills).filter((s) => s.local !== true);
    expect(marketplaceSkills.length).toBe(FIXTURE_SKILL_COUNT);

    // Boundary cast: branded SkillId key widened to string for test indexing
    expect((result.matrix.skills as Record<string, ResolvedSkill>)["preserve-skill"]).toStrictEqual(
      expect.objectContaining({ id: "preserve-skill", local: true }),
    );
  });

  it("local skill takes precedence over plugin skill with same ID", async () => {
    const sourceDir = path.join(tempDir, "precedence-source");
    const skillDir = path.join(
      sourceDir,
      "src",
      STANDARD_DIRS.SKILLS,
      "web",
      "testing",
      FIXTURE_VITEST_ID,
    );
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(
        FIXTURE_VITEST_ID,
        "Marketplace vitest configuration",
        "Marketplace vitest skill content.",
      ),
    );
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      'category: web-testing\nauthor: "@test"\ndisplayName: Vitest\ncliDescription: Marketplace vitest configuration\ncontentHash: abc1234\ndomain: web\nslug: vitest\n',
    );

    await publishMarketplace(sourceDir);

    const initialResult = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    const existingSkillId = FIXTURE_VITEST_ID;
    const existingSkill = loadedSkill(initialResult.matrix, existingSkillId)!;
    expect(existingSkill).toStrictEqual(
      expect.objectContaining({
        id: existingSkillId,
        description: "Marketplace vitest configuration",
      }),
    );
    expect(existingSkill.local).toBeUndefined(); // Should be a marketplace skill
    expect(existingSkill.description).toBe("Marketplace vitest configuration");

    const localSkillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "local-vitest");
    await mkdir(localSkillsDir, { recursive: true });

    await writeFile(
      path.join(localSkillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: My Custom Vitest\nslug: vitest\ndomain: web\ncategory: web-testing`,
    );
    await writeFile(
      path.join(localSkillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(
        FIXTURE_VITEST_ID,
        "My custom vitest configuration",
        "This is my local override of the vitest skill.",
      ),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    const overriddenSkill = loadedSkill(result.matrix, existingSkillId)!;
    expect(overriddenSkill).toStrictEqual(
      expect.objectContaining({
        local: true,
        description: "My custom vitest configuration",
        author: "@dummy-author",
        // When overwriting a remote skill, the remote skill's category is inherited
        category: existingSkill.category,
        localPath: path.join(tempDir, ".claude/skills", "local-vitest") + path.sep,
      }),
    );
    // Verify the original description was different (proves we actually overwrote something)
    expect(overriddenSkill.description).not.toBe(existingSkill.description);
  });
});

describe("source-loader local skill slugs", () => {
  let tempDir: string;

  /** Writes one local skill under `<projectDir>/.claude/skills`, the way a user's own skill sits. */
  async function writeLocalSkill(projectDir: string): Promise<void> {
    const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "house-style");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      `displayName: House Style\nslug: ${LOCAL_DISK_SKILL_SLUG}\ndomain: web\ncategory: web-tooling\ncustom: true`,
    );
    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(LOCAL_DISK_SKILL_ID, "The house style", "Content"),
    );
  }

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-slug-test-");
    await writeLocalSkill(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("resolves a local skill by the slug its metadata declares", async () => {
    await loadSkillsMatrixFromSource({ sourceFlag: fixtureDirs.sourceDir, projectDir: tempDir });

    expect(
      matrix.slugMap.slugToId[LOCAL_DISK_SKILL_SLUG],
      "the merge left the slug map as the source built it, so a relationship rule naming a skill the user wrote themselves resolved to nothing",
    ).toBe(LOCAL_DISK_SKILL_ID);
    expect(allSkills().filter((skill) => skill.local)).toStrictEqual([
      expect.objectContaining({ id: LOCAL_DISK_SKILL_ID, slug: LOCAL_DISK_SKILL_SLUG }),
    ]);
  });

  it("leaves the built-in matrix's own slug map alone", async () => {
    // The default-source branch hands out BUILT_IN_MATRIX's fields, so a merge that
    // writes through one of them edits a module constant every later load reads.
    const result = await loadSkillsMatrixFromSource({
      projectDir: tempDir,
      skipExtraSources: true,
      matrixOnly: true,
    });

    expect(result.matrix.slugMap.slugToId[LOCAL_DISK_SKILL_SLUG]).toBe(LOCAL_DISK_SKILL_ID);
    expect(
      BUILT_IN_MATRIX.slugMap.slugToId[LOCAL_DISK_SKILL_SLUG],
      "a project's local skill must not reach the shipped catalogue",
    ).toBeUndefined();
  });
});

describe("source-loader config-driven paths", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-paths-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should use custom skillsDir from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-source");

    const configDir = path.join(sourceDir, ".agents-inc");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { skillsDir: "lib/skills" };',
    );

    const skillsDir = path.join(
      sourceDir,
      "lib",
      STANDARD_DIRS.SKILLS,
      "web",
      "framework",
      "react",
    );
    await mkdir(skillsDir, { recursive: true });
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(FIXTURE_REACT_ID, "React framework", "React skill content"),
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      'category: web-framework\nauthor: "@test"\ndisplayName: React\ncliDescription: React framework\nusageGuidance: Use React for building UIs\ncontentHash: abc1234\ndomain: web\nslug: react\n',
    );

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(loadedSkill(result.matrix, FIXTURE_REACT_ID)).toStrictEqual(
      expect.objectContaining({ id: FIXTURE_REACT_ID }),
    );
  });

  it("should use custom categoriesFile path from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-categories-source");

    const configDir = path.join(sourceDir, ".agents-inc");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { categoriesFile: "data/categories.yaml" };',
    );

    // Do NOT create categories at data/categories.yaml — loader should fall back to CLI categories
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Falls back to CLI categories since custom path doesn't exist
    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });

  it("should use custom rulesFile path from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-rules-source");

    const configDir = path.join(sourceDir, ".agents-inc");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { rulesFile: "data/rules.yaml" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Falls back to CLI rules since custom path doesn't exist
    expect(typeof result.matrix.version).toBe("string");
  });

  it("should use custom stacksFile from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-stacks-source");

    const configDir = path.join(sourceDir, ".agents-inc");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { stacksFile: "data/stacks.ts" };',
    );

    const dataDir = path.join(sourceDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "stacks.ts"),
      renderConfigTs({
        stacks: [
          {
            id: "custom-path-stack",
            name: "Custom Path Stack",
            description: "Stack from custom path",
            agents: { "web-developer": { "web-framework": "web-framework-react" } },
          },
        ],
      }),
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(firstElement(result.matrix.suggestedStacks).id).toBe("custom-path-stack");
  });

  it("should fall back to convention defaults when source has no config", async () => {
    const sourceDir = path.join(tempDir, "no-config-source");

    // No .agents-inc/config.ts — just create conventional paths
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });

  it("should fall back to convention defaults when config has no path overrides", async () => {
    const sourceDir = path.join(tempDir, "config-no-paths-source");

    // Create source config WITHOUT path fields
    const configDir = path.join(sourceDir, ".agents-inc");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { marketplace: "github:myorg/skills" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });
});

describe("source-loader integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-integration-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should load all skills from local source", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    // Verify all fixture skills are present (built-in matrix may add more)
    const loadedSkillIds = Object.keys(result.matrix.skills);
    expect(loadedSkillIds.length).toBeGreaterThanOrEqual(FIXTURE_SKILL_COUNT);
    for (const skill of FIXTURE_SKILLS) {
      expect(loadedSkillIds).toContain(skill.id);
    }

    const reactSkill = loadedSkill(result.matrix, FIXTURE_REACT_ID)!;
    expect(reactSkill).toStrictEqual(
      expect.objectContaining({
        id: FIXTURE_REACT_ID,
        category: "web-framework",
      }),
    );
    expect(reactSkill.path).toContain(`web-framework/${FIXTURE_REACT_ID}`);
  });

  it("should load suggested stacks", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    const fixtureStack = result.matrix.suggestedStacks.find((s) => s.id === "fixture-test-stack");
    expect(fixtureStack).toStrictEqual(
      expect.objectContaining({
        id: "fixture-test-stack",
        name: "Fixture Test Stack",
      }),
    );
    expect(fixtureStack!.allSkillIds).toContain(FIXTURE_REACT_ID);
  });

  it("should load stacks from source when source has config/stacks.ts", async () => {
    const sourceDir = path.join(tempDir, "custom-source");
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeFile(
      path.join(configDir, "stacks.ts"),
      renderConfigTs({
        stacks: [
          {
            id: "custom-test-stack",
            name: "Custom Test Stack",
            description: "A test stack from the source",
            agents: { "web-developer": { "web-framework": "web-framework-react" } },
          },
        ],
      }),
    );

    // Create an empty src/skills dir so extractAllSkills doesn't fail
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(firstElement(result.matrix.suggestedStacks).id).toBe("custom-test-stack");
    expect(firstElement(result.matrix.suggestedStacks).name).toBe("Custom Test Stack");
  });

  it("should offer no stacks when a custom source ships none", async () => {
    const sourceDir = path.join(tempDir, "no-stacks-source");
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    await publishMarketplace(sourceDir);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Built-in stacks stand in for the default public marketplace only.
    expect(result.matrix.suggestedStacks).toStrictEqual([]);
  });

  it("should stand the built-in stacks in when the DEFAULT source ships none", async () => {
    // Dev mode resolves the default source from disk, so it gets a stackless root of its own.
    const sourceRoot = path.join(tempDir, "stackless-source-root");
    await mkdir(path.join(sourceRoot, "src", STANDARD_DIRS.SKILLS), { recursive: true });
    projectRootOverride.value = sourceRoot;

    const result = await loadSkillsMatrixFromSource({
      projectDir: tempDir,
      devMode: true,
      skipExtraSources: true,
    });

    expect(result.matrix.suggestedStacks.map((stack) => stack.id)).toStrictEqual(
      defaultStacks.map((stack) => stack.id),
    );
  });

  it("should load categories", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    const categoryIds = Object.keys(result.matrix.categories);
    expect(categoryIds).toContain("web-framework");
    expect(categoryIds).toContain("web-testing");
    expect(categoryIds).toContain("api-api");
    expect(categoryIds.length).toBeGreaterThan(10);
  });
});

describe("convertStackToResolvedStack", () => {
  const reactSkill = createMockSkill("web-framework-react");
  const zustandSkill = createMockSkill("web-state-zustand");
  const honoSkill = createMockSkill("api-framework-hono");

  beforeEach(() => {
    // convertStackToResolvedStack reads the module-level matrix, so seed it.
    const testMatrix = createMockMatrix(reactSkill, zustandSkill, honoSkill);
    initializeMatrix(testMatrix);
  });

  it("should convert an empty stack", () => {
    const stack = createMockStack("empty", {
      name: "Empty Stack",
      agents: {},
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.id).toBe("empty");
    expect(resolved.name).toBe("Empty Stack");
    expect(resolved.allSkillIds).toStrictEqual([]);
    expect(resolved.skills).toStrictEqual({});
    expect(resolved.philosophy).toBe("");
  });

  it("should convert a single-agent stack", () => {
    const stack = createMockStack("single", {
      name: "Single Agent",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.id).toBe("single");
    expect(resolved.name).toBe("Single Agent");
    expect(resolved.allSkillIds).toContain("web-framework-react");
    // Boundary cast: branded Category key widened to string for test indexing
    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]>;
    expect(agentSkills).toStrictEqual({ "web-framework": ["web-framework-react"] });
  });

  it("should convert a multi-agent stack with shared skills", () => {
    const stack = createMockStack("multi", {
      name: "Multi Agent",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
          "web-client-state": [createMockSkillAssignment("web-state-zustand")],
        },
        "api-developer": {
          "api-api": [createMockSkillAssignment("api-framework-hono")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.allSkillIds).toHaveLength(3);
    expect(resolved.allSkillIds).toContain("web-framework-react");
    expect(resolved.allSkillIds).toContain("web-state-zustand");
    expect(resolved.allSkillIds).toContain("api-framework-hono");

    expect(resolved.skills["web-developer"]).toStrictEqual({
      "web-framework": ["web-framework-react"],
      "web-client-state": ["web-state-zustand"],
    });
    expect(resolved.skills["api-developer"]).toStrictEqual({
      "api-api": ["api-framework-hono"],
    });
  });

  it("should deduplicate skill IDs across agents", () => {
    const stack = createMockStack("shared", {
      name: "Shared Skills",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
        reviewer: {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.allSkillIds).toHaveLength(1);
    expect(resolved.allSkillIds).toStrictEqual(["web-framework-react"]);
  });

  it("should filter out skills not present in the current matrix", () => {
    const stack = createMockStack("filtered", {
      name: "Filtered",
      agents: {
        "web-developer": {
          "web-framework": [
            createMockSkillAssignment("web-framework-react"),
            // Boundary cast: deliberately invalid skill ID for test
            createMockSkillAssignment("web-framework-nonexistent" as SkillId),
          ],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]>;
    expect(agentSkills["web-framework"]).toStrictEqual(["web-framework-react"]);
  });

  it("should preserve stack philosophy", () => {
    const stack = createMockStack("with-philosophy", {
      name: "Philosophical",
      agents: {},
      philosophy: "Modern type-safe development",
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.philosophy).toBe("Modern type-safe development");
  });

  it("should skip empty assignment arrays", () => {
    const stack = createMockStack("empty-assignments", {
      name: "Empty Assignments",
      agents: {
        "web-developer": {
          "web-framework": [],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]> | undefined;
    expect(agentSkills?.["web-framework"]).toBeUndefined();
    expect(resolved.allSkillIds).toHaveLength(0);
  });

  /** The surviving agent makes it a drop, not a failure; the warning makes it not silent. */
  it("drops a sub-agent the CLI does not declare and keeps the rest of the stack", () => {
    const stack = createMockStack("part-declared", {
      name: "Part Declared",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
        "frontend-dev": {
          "api-api": [createMockSkillAssignment("api-framework-hono")],
        },
      },
    });

    const { resolved } = convertStackWithWarnings(stack);

    expect(
      typedKeys<AgentName>(resolved.skills),
      "the declared sub-agent survives, which is what makes the other one a drop",
    ).toStrictEqual(["web-developer"]);
    expect(
      resolved.allSkillIds,
      "a dropped sub-agent takes its skills with it — nothing installs them",
    ).toStrictEqual(["web-framework-react"]);
  });

  it("names the stack and the sub-agent it dropped", () => {
    const stack = createMockStack("part-declared", {
      name: "Part Declared",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
        "frontend-dev": {
          "api-api": [createMockSkillAssignment("api-framework-hono")],
        },
      },
    });

    const { warnings } = convertStackWithWarnings(stack);

    expect(warnings).toStrictEqual([
      "Stack 'part-declared' names 1 sub-agent(s) this CLI does not define: 'frontend-dev'. " +
        "Left out of the stack — a sub-agent must be one the CLI ships.",
    ]);
  });

  /** `allSkillIds`, which the editor lists, must drop what the per-category map drops. */
  it("drops a stack skill the catalogue does not carry from allSkillIds too", () => {
    // A real catalogue id this matrix does not seed, so no cast past `SkillId` is needed.
    const stack = createMockStack("half-known", {
      name: "Half Known",
      agents: {
        "web-developer": {
          "web-framework": [
            createMockSkillAssignment("web-framework-react"),
            createMockSkillAssignment("web-styling-tailwind"),
          ],
        },
      },
    });

    const { resolved } = convertStackWithWarnings(stack);

    expect(resolved.allSkillIds).toStrictEqual(["web-framework-react"]);
    expect(resolved.skills["web-developer"]?.["web-framework"]).toStrictEqual([
      "web-framework-react",
    ]);
  });

  it("names the dropped skill, so a marketplace author can see what its stack lost", () => {
    const stack = createMockStack("half-known", {
      name: "Half Known",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-styling-tailwind")],
        },
      },
    });

    const { warnings } = convertStackWithWarnings(stack);

    expect(warnings.join(" ")).toContain("web-styling-tailwind");
  });

  it("names every sub-agent it dropped, comma-separated", () => {
    const stack = createMockStack("two-undeclared", {
      name: "Two Undeclared",
      agents: {
        "frontend-dev": { "web-framework": [createMockSkillAssignment("web-framework-react")] },
        "backend-dev": { "api-api": [createMockSkillAssignment("api-framework-hono")] },
      },
    });

    const { warnings } = convertStackWithWarnings(stack);

    expect(warnings).toStrictEqual([
      "Stack 'two-undeclared' names 2 sub-agent(s) this CLI does not define: 'frontend-dev', 'backend-dev'. " +
        "Left out of the stack — a sub-agent must be one the CLI ships.",
    ]);
  });

  it("names every skill the catalogue does not carry, comma-separated", () => {
    const stack = createMockStack("two-withdrawn", {
      name: "Two Withdrawn",
      agents: {
        "web-developer": {
          "web-framework": [
            createMockSkillAssignment("web-styling-tailwind"),
            createMockSkillAssignment("web-testing-vitest"),
          ],
        },
      },
    });

    const { warnings } = convertStackWithWarnings(stack);

    expect(warnings).toStrictEqual([
      "Stack 'two-withdrawn' names 2 skill(s) this marketplace's catalogue does not carry: 'web-styling-tailwind', 'web-testing-vitest'. " +
        "Left out of the stack — selecting it would install nothing.",
    ]);
  });

  it("says nothing about a stack whose sub-agents the CLI all declares", () => {
    const stack = createMockStack("all-declared", {
      name: "All Declared",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
      },
    });

    const { warnings } = convertStackWithWarnings(stack);

    expect(warnings).toStrictEqual([]);
  });
});

describe("mergeLocalSkillsIntoMatrix slug map", () => {
  it("makes a local skill reachable by the slug its metadata declares", () => {
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/house-style/",
          slug: LOCAL_ONLY_SLUG,
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(createMockMatrix(), localResult);

    expect(result.slugMap.slugToId[LOCAL_ONLY_SLUG]).toBe("web-tooling-custom");
  });

  it("leaves a slug the matrix already maps with the skill holding it, and warns about nothing", () => {
    // Slugs are not namespaced, so a local skill may share one; the incumbent keeps it, silently.
    const incumbent = createMockSkill("web-framework-react");
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/my-react/",
          slug: incumbent.slug,
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const { matrix, warnings } = mergeLocalSkillsWithWarnings(
      createMockMatrix(incumbent),
      localResult,
    );

    expect(matrix.slugMap.slugToId[incumbent.slug]).toBe("web-framework-react");
    expect(
      warnings,
      "a slug an installed skill shares with the loaded catalogue is legal, since only ids carry a namespace, and nothing is ignored",
    ).toStrictEqual([]);
    expect(
      matrix.skills["web-tooling-custom" as SkillId],
      "the local skill is still in the matrix — only its slug claim was refused",
    ).toBeDefined();
  });

  it("keeps the mapping when a local skill overrides an id the matrix already holds", () => {
    const incumbent = createMockSkill("web-framework-react");
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react/",
          slug: LOCAL_ONLY_SLUG,
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const { matrix, warnings } = mergeLocalSkillsWithWarnings(
      createMockMatrix(incumbent),
      localResult,
    );

    expect(matrix.slugMap.slugToId[incumbent.slug]).toBe("web-framework-react");
    expect(
      matrix.slugMap.slugToId[LOCAL_ONLY_SLUG],
      "an override inherits the slug the matrix already maps, so it claims none of its own",
    ).toBeUndefined();
    expect(warnings).toStrictEqual([]);
  });
});

describe("mergeLocalSkillsIntoMatrix — what a local skill carries in", () => {
  const LOCAL_ID = "web-tooling-custom" as SkillId;
  // Boundary cast: a local category outside the generated union
  const LOCAL_CATEGORY = "web-tooling" as CategoryPath;

  function mergedLocalSkill(
    overrides: Parameters<typeof createMockExtractedSkill>[1],
  ): ResolvedSkill | undefined {
    const merged = mergeLocalSkillsIntoMatrix(createMockMatrix(), {
      skills: [
        createMockExtractedSkill(LOCAL_ID, {
          local: true,
          category: LOCAL_CATEGORY,
          domain: "web",
          slug: "tooling" as SkillSlug,
          ...overrides,
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    });
    return loadedSkill(merged, LOCAL_ID);
  }

  it("carries the activation description and usage guidance its metadata declares", () => {
    expect(
      mergedLocalSkill({
        activationDescription: "Use when tooling",
        usageGuidance: "Use this skill when configuring tools.",
      }),
    ).toMatchObject({
      activationDescription: "Use when tooling",
      usageGuidance: "Use this skill when configuring tools.",
    });
  });

  it("adds neither field when the metadata declares neither", () => {
    const skill = mergedLocalSkill({});

    expect(skill).toBeDefined();
    expect(Object.keys(skill ?? {})).not.toContain("activationDescription");
    expect(Object.keys(skill ?? {})).not.toContain("usageGuidance");
  });

  it("synthesizes a definition for a category the matrix lacks, as a local one", () => {
    const merged = mergeLocalSkillsIntoMatrix(createMockMatrix(), {
      skills: [
        createMockExtractedSkill(LOCAL_ID, {
          local: true,
          category: LOCAL_CATEGORY,
          domain: "web",
          slug: "tooling" as SkillSlug,
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    });

    expect((merged.categories as Record<string, CategoryDefinition>)[LOCAL_CATEGORY]).toStrictEqual(
      {
        id: LOCAL_CATEGORY,
        displayName: LOCAL_CATEGORY,
        description: "Local skill category",
        domain: "web",
        exclusive: false,
        order: 0,
      },
    );
  });

  it("keeps the definition of a category the matrix already has", () => {
    const declared = createMockCategory("web-framework", "Framework");
    const merged = mergeLocalSkillsIntoMatrix(
      createMockMatrix({}, { categories: buildCategoryMap({ "web-framework": declared }) }),
      {
        skills: [
          createMockExtractedSkill(LOCAL_ID, {
            local: true,
            category: "web-framework",
            domain: "web",
            slug: "tooling" as SkillSlug,
          }),
        ],
        localSkillsPath: "/project/.claude/skills",
      },
    );

    expect(merged.categories["web-framework"]).toStrictEqual(declared);
  });
});

describe("mergeLocalSkillsIntoMatrix", () => {
  it("should add a local skill to an empty matrix", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom-skill/",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    // Boundary cast: branded SkillId key widened to string for test indexing
    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"]).toStrictEqual(
      expect.objectContaining({
        id: "web-tooling-custom",
        local: true,
        author: LOCAL_DEFAULTS.AUTHOR,
      }),
    );
  });

  it("should inherit category from existing remote skill when overwriting", () => {
    const remoteSkill = createMockSkill("web-framework-react");
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react-override/",
          // Local skill declares different category, but remote's should be preserved
          category: "web-styling",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-framework-react"]).toMatchObject({
      category: "web-framework",
      local: true,
    });
  });

  it("should use local skill category when no remote skill exists", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          // Boundary cast: custom category not in generated union
          category: "web-tooling" as CategoryPath,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"]).toMatchObject({ category: "web-tooling" });
  });

  it("should inherit slug and displayName from existing remote skill", () => {
    const remoteSkill = createMockSkill("web-framework-react", {
      slug: "react",
      displayName: "React",
    });
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react/",
          // Boundary cast: test slug not in generated union
          slug: "local-react" as SkillSlug,
          displayName: "Local React",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-framework-react"]).toMatchObject({ slug: "react", displayName: "React" });
  });

  it("should preserve existing skills when adding new local skills", () => {
    const existingSkill = createMockSkill("web-framework-react");
    const matrix = createMockMatrix(existingSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-framework-react"]).toStrictEqual(
      expect.objectContaining({ id: "web-framework-react" }),
    );
    expect(skills["web-tooling-custom"]).toStrictEqual(
      expect.objectContaining({ id: "web-tooling-custom", local: true }),
    );
    expect(skills["web-framework-react"]).not.toHaveProperty("local");
  });

  it("should add category definition for local skill when category does not exist", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          // Boundary cast: custom category not in generated union
          category: "web-tooling" as CategoryPath,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    // Boundary cast: branded Category key widened to string for test indexing
    const categories = result.categories as Record<string, CategoryDefinition>;
    expect(categories["web-tooling"]).toStrictEqual(
      expect.objectContaining({
        id: "web-tooling",
        domain: "web",
        exclusive: false,
        order: 0,
      }),
    );
  });

  it("should NOT add category definition when category is 'local'", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-local-skill" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          category: "local",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const categories = result.categories as Record<string, CategoryDefinition>;
    expect(categories["local"]).toBeUndefined();
  });

  it("should handle multiple local skills", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          domain: "web",
        }),
        createMockExtractedSkill("api-database-drizzle", {
          local: true,
          localPath: "/project/.claude/skills/drizzle/",
          domain: "api",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"]).toMatchObject({ local: true });
    expect(skills["api-database-drizzle"]).toMatchObject({ local: true });
  });

  it("should inherit conflict and relationship data from existing remote skill", () => {
    const remoteSkill = createMockSkill("web-framework-react", {
      conflictsWith: [{ skillId: "web-framework-vue-composition-api", reason: "Choose one" }],
      requires: [{ skillIds: ["web-state-zustand"], needsAny: false, reason: "State needed" }],
    });
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react/",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    const mergedSkill = skills["web-framework-react"];
    if (!mergedSkill) throw new Error("the merge must keep web-framework-react in the matrix");
    expect(mergedSkill.conflictsWith).toStrictEqual([
      { skillId: "web-framework-vue-composition-api", reason: "Choose one" },
    ]);
    expect(mergedSkill.requires).toStrictEqual([
      { skillIds: ["web-state-zustand"], needsAny: false, reason: "State needed" },
    ]);
  });

  it("should mark custom local skills with their custom flag", () => {
    const matrix = createMockMatrix({}, { categories: CUSTOM_SKILL_CATEGORY_MAP });
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          custom: true,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"]).toMatchObject({ custom: true });
  });
});

/** The category `web-tooling-custom` declares, as a matrix declaring it. */
const CUSTOM_SKILL_CATEGORY_MAP = buildCategoryMap({
  "web-tooling": createMockCategory("web-tooling", "Tooling"),
});

/** A marketplace's own category: what counts is that this load declares it. */
// Boundary cast: the category is a marketplace's own, so outside the generated union by design
const MARKETPLACE_DECLARED_CATEGORY = "acme-conventions" as Category;

/** A category nothing declares — what typing one in rather than picking it produces. */
const UNDECLARED_CATEGORY = "acme-invented";

/** A skill answering to no marketplace, so wearing the `external-` namespace. */
const CUSTOM_LOCAL_SKILL_ID = "external-acme-house" as SkillId;

/** Where that skill's files sit, and so the metadata.yaml a refusal must name. */
const CUSTOM_LOCAL_SKILL_PATH = ".claude/skills/acme-house/";

function customSkillDeclaring(category: string): LocalSkillDiscoveryResult {
  return {
    skills: [
      createMockExtractedSkill(CUSTOM_LOCAL_SKILL_ID, {
        local: true,
        custom: true,
        localPath: `/project/${CUSTOM_LOCAL_SKILL_PATH}`,
        path: CUSTOM_LOCAL_SKILL_PATH,
        // Boundary cast: the fixture names categories outside the generated union
        category: category as CategoryPath,
        domain: "web",
        slug: "acme-house" as SkillSlug,
      }),
    ],
    localSkillsPath: "/project/.claude/skills",
  };
}

/** A custom skill's category must already exist; an undeclared one means no pick happened. */
describe("mergeLocalSkillsIntoMatrix — a custom skill's category", () => {
  const matrixDeclaringMarketplaceCategory = () =>
    createMockMatrix(
      {},
      {
        categories: buildCategoryMap({
          [MARKETPLACE_DECLARED_CATEGORY]: createMockCategory(
            MARKETPLACE_DECLARED_CATEGORY,
            "House Conventions",
          ),
        }),
      },
    );

  it("admits a custom skill into a category the marketplace declares", () => {
    const { matrix, warnings } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(MARKETPLACE_DECLARED_CATEGORY),
    );

    expect(loadedSkill(matrix, CUSTOM_LOCAL_SKILL_ID)).toMatchObject({
      category: MARKETPLACE_DECLARED_CATEGORY,
      custom: true,
      local: true,
    });
    expect(warnings).toStrictEqual([]);
  });

  it("refuses a custom skill whose category no definition declares", () => {
    const { matrix } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(UNDECLARED_CATEGORY),
    );

    expect(
      loadedSkill(matrix, CUSTOM_LOCAL_SKILL_ID),
      "a skill nothing can place must not enter the matrix as if it had been placed",
    ).toBeUndefined();
  });

  it("invents no category definition for the skill it refused", () => {
    const { matrix } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(UNDECLARED_CATEGORY),
    );

    expect(
      (matrix.categories as Record<string, CategoryDefinition>)[UNDECLARED_CATEGORY],
      "synthesizing the category is what made the placeholder look like a real placement",
    ).toBeUndefined();
  });

  it("names the skill, the category and the file to edit when it refuses", () => {
    const { warnings } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(UNDECLARED_CATEGORY),
    );

    const refusal = warnings.find((text) => text.includes(CUSTOM_LOCAL_SKILL_ID));
    expect(refusal, "a dropped skill the user wrote must say so").toBeDefined();
    expect(refusal).toContain(UNDECLARED_CATEGORY);
    expect(refusal).toContain(`${CUSTOM_LOCAL_SKILL_PATH}${STANDARD_FILES.METADATA_YAML}`);
  });

  it("refuses in words that send the author to the metadata.yaml to edit", () => {
    const { warnings } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(UNDECLARED_CATEGORY),
    );

    expect(warnings).toStrictEqual([
      `Skipping local skill '${CUSTOM_LOCAL_SKILL_ID}': category '${UNDECLARED_CATEGORY}' is not one this ` +
        "installation declares, so the skill belongs in no grid tab and can be given to no sub-agent. " +
        `Set category in ${CUSTOM_LOCAL_SKILL_PATH}${STANDARD_FILES.METADATA_YAML} to a category that already exists — a skill ` +
        "is placed in the taxonomy, it does not extend it.",
    ]);
  });

  it("leaves the slug of a refused custom skill unclaimed", () => {
    const { matrix } = mergeLocalSkillsWithWarnings(
      matrixDeclaringMarketplaceCategory(),
      customSkillDeclaring(UNDECLARED_CATEGORY),
    );

    expect(
      matrix.slugMap.slugToId["acme-house" as SkillSlug],
      "a skill that never entered the matrix must not be reachable by slug either",
    ).toBeUndefined();
  });
});

/**
 * Ids the catalogue owns; an id is the directory a skill installs into, so these would shadow it.
 */
const CATALOGUE_OWNED_IDS: SkillId[] = ["web-framework-react", "web-testing-vitest"];

/** A marketplace name of the author's own, and therefore the namespace its ids live in. */
const AUTHOR_MARKETPLACE_NAME = "acme";

/** Written out: asserting an identity against its own definition cannot notice it moving. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

const AUTHOR_PACKAGE_NAME = "@acme/skills";

/** The catalogue's skills as a marketplace that skipped the namespace rule ships them. */
function skillsUnderCatalogueIds(): TestSkill[] {
  return CATALOGUE_OWNED_IDS.map((id) => createTestSkill(id, `Published as '${id}'`));
}

/** The same skills in a marketplace's own namespace; only the published id moves. */
function skillsUnderAuthorNamespace(): TestSkill[] {
  return CATALOGUE_OWNED_IDS.map((id) =>
    createTestSkill(id, `Published as '${AUTHOR_MARKETPLACE_NAME}-${id}'`, {
      id: `${AUTHOR_MARKETPLACE_NAME}-${id}`,
    }),
  );
}

const AUTHOR_NAMESPACED_IDS = CATALOGUE_OWNED_IDS.map(
  (id) => `${AUTHOR_MARKETPLACE_NAME}-${id}`,
).sort();

/** Gives a source a package.json, the file the catalogue is recognised by. */
async function writeSourcePackageJson(sourceDir: string, name: string): Promise<void> {
  await writeFile(
    path.join(sourceDir, STANDARD_FILES.PACKAGE_JSON),
    JSON.stringify({ name, version: "1.0.0" }),
  );
}

async function writeSourceMarketplaceJson(sourceDir: string, name: string): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace(CATALOGUE_OWNED_IDS.map((id) => createMockMarketplacePlugin(id))),
      name,
    }),
  );
}

/** The message a load refused with, or null when it loaded. */
async function refusalLoading(sourceDir: string, projectDir: string): Promise<string | null> {
  return loadSkillsMatrixFromSource({ sourceFlag: sourceDir, projectDir }).then(
    () => null,
    (error: unknown) => getErrorMessage(error),
  );
}

describe("source-loader public catalogue collision guard", () => {
  let tempDir: string;
  let sourceDirs: TestDirs | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-catalogue-collision-");
    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    if (sourceDirs) {
      await cleanupTestSource(sourceDirs);
      sourceDirs = undefined;
    }
    delete process.env[SOURCE_ENV_VAR];
  });

  it("refuses a marketplace whose skill ids the public catalogue already owns", async () => {
    sourceDirs = await createTestSource({ skills: skillsUnderCatalogueIds() });

    const refusal = await refusalLoading(sourceDirs.sourceDir, tempDir);

    expect(refusal, "a marketplace shipping catalogue ids must not load at all").not.toBeNull();
    for (const id of CATALOGUE_OWNED_IDS) {
      expect(refusal, "every colliding id must be named").toContain(id);
    }
    expect(refusal, "the marketplace that shipped them must be named").toContain(
      sourceDirs.sourceDir,
    );
    expect(refusal, "the fix is a namespace, and the refusal must say so").toContain("namespace");
  });

  it("lists the first ten colliding ids and counts the ones it leaves out", async () => {
    const published = typedEntries(BUILT_IN_MATRIX.skills)
      .slice(0, 12)
      .map(([id, skill]) => {
        const category = typedValues(BUILT_IN_MATRIX.categories).find(
          ({ id: categoryId }) => categoryId === skill.category,
        );
        if (!category?.domain)
          throw new Error(`no domain for catalogue category '${skill.category}'`);
        return createTestSkill(id, `Published as '${id}'`, {
          slug: skill.slug,
          category: skill.category,
          domain: category.domain,
        });
      });
    const collidingIds = published.map((skill) => skill.id);
    sourceDirs = await createTestSource({ skills: published });

    const refusal = await refusalLoading(sourceDirs.sourceDir, tempDir);

    expect(refusal).toContain(
      `Marketplace '${sourceDirs.sourceDir}' ships 12 skill id(s) the public catalogue already owns:\n`,
    );
    // Ten of the twelve, in whatever order the skills were read, then the count of the rest.
    expect(refusal).toMatch(
      new RegExp(
        `already owns:\\n(?:  (?:${collidingIds.join("|")})\\n){10}  \\.\\.\\. and 2 more\\n`,
      ),
    );
    expect(refusal).toContain(
      "\n  ... and 2 more\nA skill id is the directory the skill installs into, so these would shadow the public catalogue's own skills. Every id must carry its marketplace's name as a namespace — '<marketplace>-<id>'. Rename each skill and the 'name' in its SKILL.md, then re-run 'build marketplace', which refuses the same ids before they are published.",
    );
  });

  it("lists every colliding id when there are ten or fewer", async () => {
    sourceDirs = await createTestSource({ skills: skillsUnderCatalogueIds() });

    const refusal = await refusalLoading(sourceDirs.sourceDir, tempDir);

    expect(refusal).toContain(
      `Marketplace '${sourceDirs.sourceDir}' ships 2 skill id(s) the public catalogue already owns:\n`,
    );
    for (const id of CATALOGUE_OWNED_IDS) expect(refusal).toContain(`\n  ${id}\n`);
    expect(refusal).not.toContain("... and");
    // The last id is followed by the remedy itself, with no line between them.
    expect(refusal).toMatch(/\n {2}\S+\nA skill id is the directory the skill installs into/);
  });

  it("loads a marketplace whose skill ids all carry its own namespace", async () => {
    sourceDirs = await createTestSource({ skills: skillsUnderAuthorNamespace() });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDirs.sourceDir,
      projectDir: tempDir,
    });

    expect(Object.keys(result.matrix.skills).sort()).toStrictEqual(AUTHOR_NAMESPACED_IDS);
  });

  it("loads the public catalogue itself, read from a checkout of its own repository", async () => {
    sourceDirs = await createTestSource({ skills: skillsUnderCatalogueIds() });
    await writeSourcePackageJson(sourceDirs.sourceDir, PUBLIC_CATALOGUE_PACKAGE);

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDirs.sourceDir,
      projectDir: tempDir,
    });

    expect(Object.keys(result.matrix.skills).sort()).toStrictEqual([...CATALOGUE_OWNED_IDS].sort());
  });

  it("refuses a marketplace that only calls itself the public one", async () => {
    sourceDirs = await createTestSource({ skills: skillsUnderCatalogueIds() });
    await writeSourceMarketplaceJson(sourceDirs.sourceDir, DEFAULT_PUBLIC_SOURCE_NAME);
    await writeSourcePackageJson(sourceDirs.sourceDir, AUTHOR_PACKAGE_NAME);

    const refusal = await refusalLoading(sourceDirs.sourceDir, tempDir);

    expect(
      refusal,
      "the name in marketplace.json is a claim the author writes, never a credential",
    ).not.toBeNull();
  });

  it("leaves the default public marketplace loading the whole built-in catalogue", async () => {
    const result = await loadSkillsMatrixFromSource({
      projectDir: tempDir,
      skipExtraSources: true,
      matrixOnly: true,
    });

    expect(
      Object.keys(result.matrix.skills),
      "the source every default install uses must not be refused by its own ids",
    ).toStrictEqual(Object.keys(BUILT_IN_MATRIX.skills));
  });
});

/**
 * A plugin leaves no catalogue entry on disk, so it is seated from its own marketplace; the
 * controls read nothing more.
 */
describe("source-loader: a global plugin installation from another marketplace", () => {
  const GLOBAL_MARKETPLACE_NAME = "global-marketplace";
  const GLOBAL_SKILL = firstElement(
    inTestMarketplace([createTestSkill("web-state-zustand", "Bear necessities state management")]),
  );
  const GLOBAL_SKILL_ID = GLOBAL_SKILL.id;

  let globalSource: TestDirs;
  let projectSource: TestDirs;
  let projectDir: string;

  beforeAll(async () => {
    globalSource = await createTestSource({ skills: [GLOBAL_SKILL] });
    projectSource = await createTestSource({
      skills: FIXTURE_SKILLS.filter((skill) => skill.id !== GLOBAL_SKILL_ID),
    });
  });

  afterAll(async () => {
    await cleanupTestSource(globalSource);
    await cleanupTestSource(projectSource);
  });

  beforeEach(async () => {
    projectDir = await createTempDir("cc-source-loader-project-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  async function installGloballyFrom(marketplaceDir: string, origin: string): Promise<void> {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        skills: buildSkillConfigs([GLOBAL_SKILL_ID], { scope: "global", origin }),
        marketplace: marketplaceDir,
        marketplaceName: GLOBAL_MARKETPLACE_NAME,
      }),
    );
  }

  it("seats the global skill as the global installation's own marketplace describes it", async () => {
    await installGloballyFrom(globalSource.sourceDir, GLOBAL_MARKETPLACE_NAME);

    const { matrix: loaded } = await loadSkillsMatrixFromSource({
      sourceFlag: projectSource.sourceDir,
      projectDir,
    });

    expect(
      loadedSkill(loaded, GLOBAL_SKILL_ID),
      "seated as its own catalogue places it, under its own marketplace's name",
    ).toStrictEqual(
      expect.objectContaining({
        id: GLOBAL_SKILL_ID,
        category: GLOBAL_SKILL.category,
        availableSources: [
          { name: GLOBAL_MARKETPLACE_NAME, type: "private", installed: false, primary: true },
        ],
        activeSource: {
          name: GLOBAL_MARKETPLACE_NAME,
          type: "private",
          installed: false,
          primary: true,
        },
      }),
    );
  });

  it("does not count the seated skill among the loaded marketplace's own, whose folder holds none of its files", async () => {
    await installGloballyFrom(globalSource.sourceDir, GLOBAL_MARKETPLACE_NAME);

    const { marketplaceSkillIds } = await loadSkillsMatrixFromSource({
      sourceFlag: projectSource.sourceDir,
      projectDir,
    });

    expect([...marketplaceSkillIds].sort()).toStrictEqual(
      FIXTURE_SKILLS.map((skill) => skill.id)
        .filter((id) => id !== GLOBAL_SKILL_ID)
        .sort(),
    );
  });

  it("leaves an ejected global skill to the local-skill merge, which finds no copy here", async () => {
    await installGloballyFrom(globalSource.sourceDir, EJECT_SOURCE);

    const { matrix: loaded } = await loadSkillsMatrixFromSource({
      sourceFlag: projectSource.sourceDir,
      projectDir,
    });

    expect(loadedSkill(loaded, GLOBAL_SKILL_ID)).toBeUndefined();
  });

  it("seats nothing when the global installation's marketplace is the one loaded", async () => {
    await installGloballyFrom(projectSource.sourceDir, GLOBAL_MARKETPLACE_NAME);

    const { matrix: loaded } = await loadSkillsMatrixFromSource({
      sourceFlag: projectSource.sourceDir,
      projectDir,
    });

    expect(
      loadedSkill(loaded, GLOBAL_SKILL_ID),
      "a skill the global's own marketplace no longer carries stays absent",
    ).toBeUndefined();
  });
});
