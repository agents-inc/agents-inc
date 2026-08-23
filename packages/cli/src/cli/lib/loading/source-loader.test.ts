import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";

/**
 * The source root `loadFromLocal` reads when the DEFAULT source is resolved from disk.
 * Unset for every spec but the one that drives that path, which points it at a root the
 * test owns — otherwise the load reads this checkout, including its gitignored
 * `.claude-src/config.ts`, whose `skillsDir` and `stacksFile` keys decide the answer.
 */
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
import { disableBuffering, drainBuffer, enableBuffering, setVerbose } from "../../utils/logger";
import { defaultCategories } from "../configuration/default-categories";
import { defaultStacks } from "../configuration/default-stacks";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { allSkills, initializeMatrix, matrix } from "../matrix/matrix-provider";
// The env rung is cleared THROUGH the constant the resolver reads, not through a literal:
// these hooks assert nothing, so there is no "both sides move together" hazard here, and a
// literal is what let the suite go on deleting the withdrawn `CC_SOURCE` after the rename.
// `config.test.ts` spells its names as literals for the opposite and equally correct reason —
// there they are the subject of assertions about what a user exports.
import { SOURCE_ENV_VAR } from "../configuration/config";
import { LOCAL_DEFAULTS } from "../metadata-keys";
import type { LocalSkillDiscoveryResult } from "../skills";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { typedKeys } from "../../utils/typed-object";

/**
 * What the fixture marketplace ships, published in its own namespace: a custom
 * marketplace shipping a catalogue id is refused whole, so a fixture that reaches
 * a real load has to be a legal marketplace.
 */
const FIXTURE_SKILLS = inTestMarketplace([...DEFAULT_TEST_SKILLS, ...EXTRA_DOMAIN_TEST_SKILLS]);

/** The fixture marketplace's id for the skill the source's react entry publishes. */
const FIXTURE_REACT_ID = testMarketplaceSkillId("web-framework-react");

/** The same, for the entry the local-skill merge specs overwrite. */
const FIXTURE_VITEST_ID = testMarketplaceSkillId("web-testing-vitest");

const FIXTURE_SKILL_COUNT = FIXTURE_SKILLS.length;

const BUILT_IN_CATEGORY_COUNT = Object.keys(defaultCategories).length;

/** An absolute local path with nothing at it — the loader must refuse, not load empty. */
const MISSING_SOURCE_PATH = "/non/existent/path";

/** The opening of the warning a rule naming a slug no loaded skill carries produces. */
const UNRESOLVED_SLUG_WARNING = "Unresolved slug";

/**
 * A slug the built-in rules name and no test source ships — the dangling reference
 * a source's OWN `skill-rules.ts` is written around below.
 */
const SLUG_NO_TEST_SOURCE_SHIPS: SkillSlug = "angular-standalone";

/** A slug only a user's own skill carries — nothing in any catalogue claims it. */
// Boundary cast: a local skill's slug is outside the generated union, as its id is
const LOCAL_ONLY_SLUG = "house-style" as SkillSlug;

/** The id and slug of the local skill the load-level slug specs write to disk. */
const LOCAL_DISK_SKILL_ID = "my-house-style";
const LOCAL_DISK_SKILL_SLUG = LOCAL_ONLY_SLUG;

/** A slug the test source does ship — read off the fixture so it cannot drift from it. */
const SLUG_THE_TEST_SOURCE_SHIPS: SkillSlug = firstElement(FIXTURE_SKILLS).slug;

/**
 * The manifest `build marketplace` wrote when package.json declared no author: a file
 * that is unmistakably present and that `marketplaceSchema` refuses, because
 * `owner.name` may not be empty.
 */
const MANIFEST_WITH_UNNAMED_OWNER = {
  ...createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
  owner: { name: "" },
};

/** The field {@link MANIFEST_WITH_UNNAMED_OWNER} breaks, which the diagnostic has to name. */
const UNREADABLE_MANIFEST_FIELD = "owner.name";

/**
 * What a load said about a marketplace's manifest, split by the channel it said it on.
 * The two states pinned below are told apart by the channel as much as by the words, so
 * a capture reading one channel cannot see the difference.
 */
type ManifestReport = {
  diagnostics: string[];
  warnings: string[];
};

/** {@link ManifestReport} for one load of `sourceFlag`. */
async function reportOnManifest(sourceFlag: string, projectDir: string): Promise<ManifestReport> {
  const logged: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  setVerbose(true);
  enableBuffering();
  try {
    await loadSkillsMatrixFromSource({ sourceFlag, projectDir, skipExtraSources: true });
    const warnings = drainBuffer().map((message) => message.text);
    return {
      diagnostics: [...logged, ...warnings].filter(mentionsManifest),
      warnings: warnings.filter(mentionsManifest),
    };
  } finally {
    disableBuffering();
    setVerbose(false);
    logSpy.mockRestore();
  }
}

function mentionsManifest(text: string): boolean {
  return text.includes(MARKETPLACE_JSON);
}

/** A marketplace on disk whose manifest is present and refused by the loader's own schema. */
async function writeMarketplaceWithUnreadableManifest(tempDir: string): Promise<string> {
  const sourceDir = path.join(tempDir, "unreadable-manifest-marketplace");
  await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(MANIFEST_WITH_UNNAMED_OWNER));
  return sourceDir;
}

/**
 * A marketplace name Claude Code will not register plugins under, and the same name
 * written the way it accepts.
 *
 * The pair is what makes the refusal below mean anything: the two marketplaces differ in
 * this one field, so a guard that refused every manifest would fail the second spec
 * rather than leave the file quietly all-refusal.
 */
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

/**
 * What the load produced and what it said, read the way `init` and `edit` read
 * it: buffering is the production mechanism that carries `warn()` past Ink's
 * `clearTerminal` into the wizard's startup band, so draining it is asking the
 * question the band answers.
 */
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

/**
 * A loaded skill read by an id outside the generated union. A namespaced
 * marketplace id is a `string` — the union is the public catalogue's — while
 * `matrix.skills` is keyed by `SkillId`, so the widening happens once here rather
 * than at every call site.
 */
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
 * Every `loadSkillsMatrixFromSource` here walks to the home root twice — `resolveSource`
 * falls through to `~/.claude-src/config.ts`, and the local-skill merge reads
 * `~/.claude/skills` — so without this the suite loads whatever the developer has
 * installed. The env var alone is not enough: `os.homedir()` re-reads `$HOME` under node
 * but fixes it at startup under bun, and this package runs its tests under both.
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

        // Should load from local source in dev mode
        expect(result.isLocal).toBe(true);
        expect(typeof result.matrix.version).toBe("string");
        const loadedSkillIds = Object.keys(result.matrix.skills);
        expect(loadedSkillIds).toHaveLength(FIXTURE_SKILL_COUNT);
        // Verify all fixture skills are present by ID
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
        // Verify specific fixture skills are present
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

      it("should leave marketplace undefined when the local source has no marketplace.json", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBeUndefined();
      });
    });

    describe("a marketplace.json that is absent and one that cannot be read", () => {
      it("should not describe a manifest it could not read the way it describes an absent one", async () => {
        const absent = await reportOnManifest(fixtureDirs.sourceDir, tempDir);
        const unreadable = await reportOnManifest(
          await writeMarketplaceWithUnreadableManifest(tempDir),
          tempDir,
        );

        expect(unreadable.diagnostics).not.toStrictEqual(absent.diagnostics);
      });

      it("should warn, naming the field that failed, only when the manifest is there and invalid", async () => {
        const absent = await reportOnManifest(fixtureDirs.sourceDir, tempDir);
        const unreadable = await reportOnManifest(
          await writeMarketplaceWithUnreadableManifest(tempDir),
          tempDir,
        );

        expect(absent.warnings).toStrictEqual([]);
        expect(firstElement(unreadable.warnings)).toContain(UNREADABLE_MANIFEST_FIELD);
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

    describe("matrixOnly", () => {
      it("should resolve the default source offline with the built-in matrix and empty sourcePath", async () => {
        // No sourceFlag, no env var, no config in projectDir — resolves to
        // DEFAULT_SOURCE. Without matrixOnly this branch fetches the source
        // clone (a network call on a cold cache); with it the fetch is skipped,
        // so a regression here fails with a fetch error instead of passing.
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

    describe("error handling", () => {
      it("should reject a local source path that does not exist, naming the path", async () => {
        // A path the user named and the CLI cannot read is an argument error, not an
        // empty catalog: silently loading nothing let `init`/`edit` mount a wizard over
        // a source the user never asked for. This used to resolve to an empty matrix.
        await expect(
          loadSkillsMatrixFromSource({
            sourceFlag: MISSING_SOURCE_PATH,
            projectDir: tempDir,
          }),
        ).rejects.toThrow(`Local marketplace not found: '${MISSING_SOURCE_PATH}'`);
      });

      it("should return empty skills if skills directory is missing", async () => {
        // Create a directory without src/skills/
        const emptySource = path.join(tempDir, "empty-source");
        await mkdir(emptySource, { recursive: true });

        // With new architecture: matrix loads from CLI repo (always succeeds)
        // Skills extraction gracefully returns empty for missing src/skills/
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: emptySource,
          projectDir: tempDir,
        });

        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        // No skills should be extracted when src/skills/ directory is missing
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
    // The built-in rules are written against the whole public catalogue. A source
    // shipping a handful of its skills leaves the rest of those names dangling, and
    // every dangling name used to warn once per skill in the source — thousands of
    // lines, painted above the wizard's step since the startup band landed. None of
    // them was ever actionable: the reference resolves to nothing and is dropped.
    const { warnings } = await loadWithWarnings(fixtureDirs.sourceDir, tempDir);

    expect(warnings.filter((text) => text.includes(UNRESOLVED_SLUG_WARNING))).toStrictEqual([]);
  });

  it("hands the health check nothing for the built-in slugs a source does not ship", async () => {
    // The same rule the row above states in warnings, stated in the finding
    // `doctor` reads: a built-in slug narrowed out before resolution is not the
    // source's defect and must not be reported against it.
    const { matrix } = await loadWithWarnings(fixtureDirs.sourceDir, tempDir);

    expect(matrix.unresolvedSlugs).toBeUndefined();
  });

  it("still warns about a slug the source's own rules name and its skills do not carry", async () => {
    // The other half of the same rule: a slug a source AUTHOR typed is that source's
    // defect, and the load is where it is caught.
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
    // The warning above is written to a log the author may never read. `doctor`
    // reads the matrix, so the finding has to survive the merge to reach it.
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
    // Create a local skill in the temp project
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

    // Local skill should be in the matrix with normalized ID
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

    // Local skills should NOT cause fake "local" or "local/custom" categories to be injected
    // The skill uses whatever category it declared (or "local" default from local-skill-loader)
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

    // Local categories should NOT be added if no local skills
    // (Matrix may already have local categories from previous tests,
    // so we check that no local skills are in the skills object)
    const localSkills = Object.values(result.matrix.skills).filter((s) => s.local === true);
    expect(localSkills).toHaveLength(0);
  });

  it("should preserve remote skill category when local skill overwrites with category 'local'", async () => {
    // Use a known fixture skill with a domain-mapped category
    const targetSkillId = FIXTURE_REACT_ID;
    const expectedCategory = "web-framework";

    // Create a local skill with the SAME ID but a different category in metadata
    // (source-loader preserves the remote skill's category when overwriting)
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

    // Load with the local skill override
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Boundary cast: branded SkillId key widened to string for test indexing
    const overriddenSkill = (result.matrix.skills as Record<string, ResolvedSkill>)[targetSkillId];

    expect(overriddenSkill).toStrictEqual(
      expect.objectContaining({
        local: true,
        // The category should be preserved from the remote skill
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

    // Existing marketplace skills should still be present
    const marketplaceSkills = Object.values(result.matrix.skills).filter((s) => s.local !== true);
    expect(marketplaceSkills.length).toBe(FIXTURE_SKILL_COUNT);

    // Local skill should also be present with normalized ID
    // Boundary cast: branded SkillId key widened to string for test indexing
    expect((result.matrix.skills as Record<string, ResolvedSkill>)["preserve-skill"]).toStrictEqual(
      expect.objectContaining({ id: "preserve-skill", local: true }),
    );
  });

  it("local skill takes precedence over plugin skill with same ID", async () => {
    // Create a source directory with a marketplace skill
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

    // Load skills from source to verify marketplace skill is present
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

    // Create a local skill with the SAME ID to override it
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

    // Load again with the local skill in place
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // The skill should now be the LOCAL version, not the marketplace version
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

    // Create source config with custom skillsDir
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { skillsDir: "lib/skills" };',
    );

    // Create skills in the custom directory
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

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Skill should be loaded from custom path
    expect(loadedSkill(result.matrix, FIXTURE_REACT_ID)).toStrictEqual(
      expect.objectContaining({ id: FIXTURE_REACT_ID }),
    );
  });

  it("should use custom categoriesFile path from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-categories-source");

    // Create source config with custom categoriesFile pointing to a non-existent path
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { categoriesFile: "data/categories.yaml" };',
    );

    // Do NOT create categories at data/categories.yaml — loader should fall back to CLI categories
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

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

    // Create source config with custom rulesFile pointing to a non-existent path
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { rulesFile: "data/rules.yaml" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Falls back to CLI rules since custom path doesn't exist
    expect(typeof result.matrix.version).toBe("string");
  });

  it("should use custom stacksFile from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-stacks-source");

    // Create source config with custom stacksFile
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { stacksFile: "data/stacks.ts" };',
    );

    // Create stacks at the custom path
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

    // Create empty skills dir
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(firstElement(result.matrix.suggestedStacks).id).toBe("custom-path-stack");
  });

  it("should fall back to convention defaults when source has no config", async () => {
    const sourceDir = path.join(tempDir, "no-config-source");

    // No .claude-src/config.ts — just create conventional paths
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should still work using convention defaults
    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });

  it("should fall back to convention defaults when config has no path overrides", async () => {
    const sourceDir = path.join(tempDir, "config-no-paths-source");

    // Create source config WITHOUT path fields
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { marketplace: "github:myorg/skills" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should still work using convention defaults
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

    // Verify a known skill has meaningful properties from the fixture data
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

    // Should contain the fixture stack
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
    // Create a source directory with its own stacks.ts
    const sourceDir = path.join(tempDir, "custom-source");
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    // Write a minimal custom stacks.ts with a unique stack ID
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

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should load the custom stack from source, not CLI stacks
    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(firstElement(result.matrix.suggestedStacks).id).toBe("custom-test-stack");
    expect(firstElement(result.matrix.suggestedStacks).name).toBe("Custom Test Stack");
  });

  it("should offer no stacks when a custom source ships none", async () => {
    // Create a source directory without stacks.ts
    const sourceDir = path.join(tempDir, "no-stacks-source");
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // The built-in catalogue stands in for the default public marketplace and no
    // other: a source the user named by path ships its own stacks or offers none.
    expect(result.matrix.suggestedStacks).toStrictEqual([]);
  });

  it("should stand the built-in stacks in when the DEFAULT source ships none", async () => {
    // The default source's stacks normally come pre-resolved on BUILT_IN_MATRIX,
    // which `resolveBaseResult` short-circuits to. Dev mode is the one runtime
    // path that resolves the default source from disk instead, so it is where
    // the stand-in itself is observable — and the disk it reads is PROJECT_ROOT,
    // so the spec supplies a stackless source root of its own rather than letting
    // the answer come off this checkout.
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
    // Categories come from the CLI's built-in matrix — verify known categories exist
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
    // convertStackToResolvedStack reads from the module-level currentMatrix
    // via `a.id in currentMatrix.skills`, so we must seed it
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

    // The same skill appears in both agents, but allSkillIds should be deduplicated
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

    // Only the valid skill should appear in the per-agent category mapping
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

    // Empty category should not appear in agent skills
    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]> | undefined;
    expect(agentSkills?.["web-framework"]).toBeUndefined();
    expect(resolved.allSkillIds).toHaveLength(0);
  });

  /**
   * A marketplace's `config/stacks.ts` is authored by hand and nothing between the file and
   * here narrows its agent keys, so a name the CLI does not declare arrives typed `AgentName`
   * and compiles. Only `src/agents/` declares a sub-agent a compile pass can honour — that
   * directory is the whole of the roster (owner ruling 2026-08-21) and is what `AGENT_NAMES` is
   * generated from — so an unknown name reaches `config.agents`, `SelectedAgentName` and
   * `ProjectAgentName` alike and then leaves `compile` with no definition to compile.
   *
   * **The two cases are one claim and neither means anything alone.** The drop is a
   * DISAPPEARANCE, and a conversion that dropped both agents, or that never ran, satisfies it
   * for free — the surviving agent is what makes it a drop rather than a failure. And the drop
   * without the warning is what shipped: the wizard already narrowed these names out of its
   * grid, which is exactly why nobody was told.
   */
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

  it("names the stack and the sub-agent it dropped, in the band the wizard paints", () => {
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
    expect(result.slugMap.idToSlug["web-tooling-custom" as SkillId]).toBe(LOCAL_ONLY_SLUG);
  });

  it("leaves a slug the matrix already maps with the skill holding it", () => {
    // Ids are namespaced by their author; slugs are not, so a user's own
    // skill can spell one the catalogue already uses. Letting it win would reroute
    // every rule naming that slug to the local skill, silently.
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
      warnings.filter((text) => text.includes(`Duplicate slug '${incumbent.slug}'`)),
      "the refused claim is named, not silently dropped",
    ).toHaveLength(1);
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
    // Should inherit the remote skill's category, not the local's declaration
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
    // Should preserve slug and displayName from the remote skill
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
    // Both existing and new skill should be present
    expect(skills["web-framework-react"]).toStrictEqual(
      expect.objectContaining({ id: "web-framework-react" }),
    );
    expect(skills["web-tooling-custom"]).toStrictEqual(
      expect.objectContaining({ id: "web-tooling-custom", local: true }),
    );
    // Existing skill should not be marked as local
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

    // Should have created a category definition for web-tooling
    // Boundary cast: branded Category key widened to string for test indexing
    const categories = result.categories as Record<string, CategoryDefinition>;
    expect(categories["web-tooling"]).toStrictEqual(
      expect.objectContaining({
        id: "web-tooling",
        domain: "web",
        exclusive: false,
        required: false,
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

/**
 * The category `web-tooling-custom` declares, as a matrix that declares it —
 * the shape a custom skill is entitled to expect, since a custom skill brings
 * no category with it.
 */
const CUSTOM_SKILL_CATEGORY_MAP = buildCategoryMap({
  "web-tooling": createMockCategory("web-tooling", "Tooling"),
});

/**
 * A category no built-in defines, declared by the marketplace under test. A
 * custom skill accepted into it proves the question asked is "does this load
 * declare the category", not "is it in the CLI's generated union" — a
 * marketplace's own categories are as real as the catalogue's, and the intake's
 * dropdown offers both.
 */
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

/**
 * A custom skill is placed in a category that already exists, never in one it
 * invents: the intake makes the user pick from the categories the grid renders,
 * so a category no definition declares means the pick never happened. Accepting
 * one would put the skill in a tab nothing draws and a stack no sub-agent reads —
 * silently, which is the failure the placeholder taxonomy used to produce.
 */
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
 * Two ids the shipped catalogue owns. A skill id IS the directory the skill
 * installs into, so a marketplace shipping either of these names the directory
 * a catalogue skill already occupies — the shadowing the namespace rule exists
 * to make unrepresentable.
 */
const CATALOGUE_OWNED_IDS: SkillId[] = ["web-framework-react", "web-testing-vitest"];

/** A marketplace name of the author's own, and therefore the namespace its ids live in. */
const AUTHOR_MARKETPLACE_NAME = "acme";

/**
 * The npm package the public catalogue publishes from. Written out rather than
 * imported from the constant the guard reads: it is an identity, and a test
 * asserting it against its own definition cannot notice that identity moving.
 */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

/** A package name that is any author's to take. */
const AUTHOR_PACKAGE_NAME = "@acme/skills";

/** The catalogue's skills as a marketplace that skipped the namespace rule ships them. */
function skillsUnderCatalogueIds(): TestSkill[] {
  return CATALOGUE_OWNED_IDS.map((id) => createTestSkill(id, `Published as '${id}'`));
}

/**
 * The same skills published in a marketplace's own namespace. The bare id still
 * selects the taxonomy — a namespaced id names no category, slug or domain of
 * its own — and only the published id moves.
 */
function skillsUnderAuthorNamespace(): TestSkill[] {
  return CATALOGUE_OWNED_IDS.map((id) =>
    createTestSkill(id, `Published as '${AUTHOR_MARKETPLACE_NAME}-${id}'`, {
      id: `${AUTHOR_MARKETPLACE_NAME}-${id}`,
    }),
  );
}

/** The ids {@link skillsUnderAuthorNamespace} publishes, sorted. */
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

/** Gives a source a marketplace.json publishing under `name`. */
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
