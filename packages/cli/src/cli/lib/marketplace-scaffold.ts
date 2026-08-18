import path from "path";

import {
  DEFAULT_VERSION,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../consts.js";
import { writeFile } from "../utils/fs.js";

/** One file of a scaffolded marketplace: where it goes, and what it holds. */
type ScaffoldFile = {
  /** Path relative to the marketplace root. */
  relPath: string;
  contents: string;
};

/**
 * The bare id of the one skill a scaffold ships. The marketplace's own name is
 * prefixed onto it by {@link exampleSkillId} — this half is the same for every
 * marketplace, and on its own it belongs to none of them.
 */
const EXAMPLE_SKILL_SUFFIX = "example-skill";

/**
 * The domain the scaffolded category sits under.
 *
 * `web` rather than a placeholder of its own: a domain is a member of a generated
 * union, and one invented for the scaffold appears in no wizard domain view and
 * reaches no sub-agent. It is also one of the domains a from-scratch selection
 * opens with, so the example skill is visible without the author choosing anything.
 */
const EXAMPLE_DOMAIN = "web";

/**
 * The category the scaffold declares and places its example skill in, named by the
 * `<domain>-<name>` convention every category in the public catalogue follows. No
 * built-in category holds this key, so declaring it adds one rather than redefining
 * somebody else's.
 */
const EXAMPLE_CATEGORY = `${EXAMPLE_DOMAIN}-example`;

/**
 * The slug the example skill answers to.
 *
 * Deliberately NOT namespaced: the marketplace-namespace rule governs skill ids,
 * and a marketplace's matrix is built from its own skills alone, so nothing in it
 * can collide with this. Prefixing it would settle a question nobody has ruled on.
 */
const EXAMPLE_SLUG = "example-skill";

/** Where the scaffolded category sorts among the categories a marketplace grows later. */
const EXAMPLE_CATEGORY_ORDER = 1;

/** The version a marketplace starts at — pre-release, because nothing is published yet. */
const INITIAL_PACKAGE_VERSION = "0.1.0";

/** The sub-agent the scaffolded stack hands its skill to. */
const EXAMPLE_STACK_AGENT = "web-developer";

/**
 * Composes the id of a scaffolded marketplace's example skill.
 *
 * Every skill id a marketplace publishes begins with that marketplace's name, so an
 * author who edits the scaffold rather than starting from a blank directory falls
 * into the namespace instead of having to remember it — `build marketplace` refuses
 * an id that lacks the prefix, and so does the load side.
 */
export function exampleSkillId(marketplaceName: string): string {
  return `${marketplaceName}-${EXAMPLE_SKILL_SUFFIX}`;
}

/**
 * Writes a complete marketplace into `marketplaceDir` and returns every path it
 * wrote, relative to that directory.
 *
 * What it writes is exactly what `docs/guides/creating-a-marketplace.md` promises a
 * marketplace holds — no more. It deliberately writes no `.claude-src/` pair: a
 * marketplace is a repository of skills, and a config manifest there would make
 * `doctor` diagnose an installation that does not exist.
 */
export async function writeMarketplaceScaffold(
  marketplaceDir: string,
  marketplaceName: string,
): Promise<string[]> {
  const files = scaffoldFiles(marketplaceName);

  await Promise.all(
    files.map((file) => writeFile(path.join(marketplaceDir, file.relPath), file.contents)),
  );

  return files.map((file) => file.relPath);
}

function scaffoldFiles(marketplaceName: string): ScaffoldFile[] {
  const skillId = exampleSkillId(marketplaceName);
  const skillDir = path.join(SKILLS_DIR_PATH, skillId);

  return [
    { relPath: STANDARD_FILES.PACKAGE_JSON, contents: packageJson(marketplaceName) },
    { relPath: SKILL_CATEGORIES_PATH, contents: skillCategoriesModule() },
    { relPath: SKILL_RULES_PATH, contents: skillRulesModule() },
    { relPath: STACKS_FILE_PATH, contents: stacksModule(marketplaceName, skillId) },
    { relPath: path.join(skillDir, STANDARD_FILES.SKILL_MD), contents: skillMd(skillId) },
    {
      relPath: path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      contents: metadataYaml(marketplaceName),
    },
  ];
}

/**
 * A `config/*.ts` module the CLI's loader can read.
 *
 * The loader unwraps a DEFAULT export and treats a module without one as no config
 * at all, so the export form here is load-bearing rather than stylistic.
 */
function configModule(comment: string, data: unknown): string {
  return `${comment}\nexport default ${JSON.stringify(data, null, 2)};\n`;
}

/**
 * `build marketplace` reads a marketplace's whole identity out of package.json and
 * refuses a file missing any of name, version or description.
 *
 * `author` is the field this command cannot know, and it is written anyway —
 * omitting it is not the neutral choice it looks like. The build turns an absent
 * author into `owner: { name: "" }`, and the schema the CLI parses a
 * `marketplace.json` back with requires a non-empty owner name, so a scaffold with
 * no author builds a marketplace that then loads as no marketplace at all. The
 * marketplace's own handle is the least-wrong default: it is derived from what the
 * author typed rather than invented, and the next steps say to replace it.
 */
function packageJson(marketplaceName: string): string {
  return `${JSON.stringify(
    {
      name: marketplaceName,
      version: INITIAL_PACKAGE_VERSION,
      description: `Skills curated for ${marketplaceName}'s conventions`,
      author: { name: authorHandle(marketplaceName) },
    },
    null,
    2,
  )}\n`;
}

/** The placeholder handle the marketplace publishes itself and its example skill under. */
function authorHandle(marketplaceName: string): string {
  return `@${marketplaceName}`;
}

function skillCategoriesModule(): string {
  return configModule("// The categories this marketplace's skills fall into.", {
    version: DEFAULT_VERSION,
    categories: {
      [EXAMPLE_CATEGORY]: {
        id: EXAMPLE_CATEGORY,
        displayName: "Example",
        description: "Replace this with a category of your own",
        domain: EXAMPLE_DOMAIN,
        exclusive: false,
        required: false,
        order: EXAMPLE_CATEGORY_ORDER,
      },
    },
  });
}

/**
 * A rules file with a version and nothing else.
 *
 * Relationship rules name skills by slug, and that slug reference is the CLI's own
 * generated union — so a marketplace cannot yet name its OWN skills in a rule, and
 * one that tries fails to load. A marketplace works fully without them; what it
 * loses is the wizard's incompatibility hints between its own skills.
 */
function skillRulesModule(): string {
  return configModule(
    [
      "// Relationships between skills — conflicts, requires, alternatives.",
      "//",
      "// Rules may only name skills the public catalogue carries; this marketplace's own",
      "// skills cannot be named here yet, and a rule that names one will not load. The",
      "// file still has to exist, so it ships with a version and no relationships.",
    ].join("\n"),
    { version: DEFAULT_VERSION },
  );
}

function stacksModule(marketplaceName: string, skillId: string): string {
  return configModule("// The stacks this marketplace offers the wizard.", {
    stacks: [
      {
        id: `${marketplaceName}-starter`,
        name: `${marketplaceName} starter`,
        description: `Every skill ${marketplaceName} ships`,
        agents: {
          [EXAMPLE_STACK_AGENT]: {
            [EXAMPLE_CATEGORY]: [{ id: skillId }],
          },
        },
      },
    ],
  });
}

/**
 * The skill's content, headed by the frontmatter the loader reads its machine id
 * out of. That id is also the directory name — `doctor` compares the two — so both
 * come from {@link exampleSkillId} rather than being spelled twice.
 */
function skillMd(skillId: string): string {
  return `---
name: ${skillId}
description: A placeholder skill — replace it with one of your own
---

# Example Skill

This is where a skill's content goes: the conventions, patterns and rules you want
every sub-agent carrying it to follow.

Replace this file and the \`${STANDARD_FILES.METADATA_YAML}\` beside it, and rename the
directory to the id your skill should publish under.
`;
}

function metadataYaml(marketplaceName: string): string {
  return [
    "custom: true",
    `domain: ${EXAMPLE_DOMAIN}`,
    `author: "${authorHandle(marketplaceName)}"`,
    "displayName: Example Skill",
    `category: ${EXAMPLE_CATEGORY}`,
    `slug: ${EXAMPLE_SLUG}`,
    'cliDescription: "A placeholder skill to replace with your own"',
    'usageGuidance: "Use when you need a worked example of this marketplace\'s skill shape"',
    "",
  ].join("\n");
}
