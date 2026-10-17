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

type ScaffoldFile = {
  /** Path relative to the marketplace root. */
  relPath: string;
  contents: string;
};

const EXAMPLE_SKILL_SUFFIX = "example-skill";

/** `web` rather than an invented domain, which would reach no sub-agent. */
const EXAMPLE_DOMAIN = "web";

/** No built-in category holds this key, so declaring it adds one rather than redefining another. */
const EXAMPLE_CATEGORY = `${EXAMPLE_DOMAIN}-example`;

/** Not namespaced: the namespace rule governs ids, not slugs. */
const EXAMPLE_SLUG = "example-skill";

/** Where the scaffolded category sorts among the categories a marketplace grows later. */
const EXAMPLE_CATEGORY_ORDER = 1;

const INITIAL_PACKAGE_VERSION = "0.1.0";

const EXAMPLE_STACK_AGENT = "web-developer";

/** Prefixed with the marketplace name, which `build marketplace` requires of every id. */
export function exampleSkillId(marketplaceName: string): string {
  return `${marketplaceName}-${EXAMPLE_SKILL_SUFFIX}`;
}

/** Writes exactly what the marketplace guide promises; a config pair would look installed. */
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

/** The loader reads only a default export, so the export form is load-bearing. */
function configModule(comment: string, data: unknown): string {
  return `${comment}\nexport default ${JSON.stringify(data, null, 2)};\n`;
}

/** `author` is the marketplace's own handle, a placeholder the next steps say to replace. */
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
        order: EXAMPLE_CATEGORY_ORDER,
      },
    },
  });
}

/** Version only: rules name skills by the CLI's slug union, which a marketplace's own lack. */
function skillRulesModule(): string {
  return configModule(
    [
      "// Relationships between skills — conflicts, requires, alternatives.",
      "//",
      "// Rules may only name skills the public catalogue carries; this marketplace's own",
      "// skills cannot be named here yet, and a rule that names one will not load.",
    ].join("\n"),
    { version: DEFAULT_VERSION },
  );
}

function stacksModule(marketplaceName: string, skillId: string): string {
  return configModule("// The stacks this marketplace offers.", {
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

/** The frontmatter id is also the directory name (`doctor` compares them). */
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
