import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { DEFAULT_SOURCE } from "../../src/cli/lib/configuration/config.js";
import {
  fetchRecordPath,
  sanitizeSourceForCache,
} from "../../src/cli/lib/loading/source-fetcher.js";
import {
  renderMetadataYaml,
  renderSkillMd,
} from "../../src/cli/lib/__tests__/content-generators.js";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../../src/cli/lib/__tests__/factories/plugin-factories.js";
import { computeFileHash } from "../../src/cli/lib/versioning.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import {
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  LOCAL_PSEUDO_CATEGORY,
  marketplaceManifestPath,
  SOURCE_SRC_DIR,
  STANDARD_FILES,
} from "../../src/cli/consts.js";
import { typedKeys } from "../../src/cli/utils/typed-object.js";
import type { CategoryPath, SkillId } from "../../src/cli/types/index.js";

// Seeds the default marketplace's fetch cache, the one source whose matrix (BUILT_IN_MATRIX) and files
// can disagree; `omitting` produces that state. A record with a `tar` and no `etag` keeps it offline.
// The manifest is seeded too, as the real catalogue ships one: an unnamed project's plugin key reads
// its name.
export async function seedDefaultSourceCache(
  home: string,
  { omitting }: { omitting: SkillId },
): Promise<string> {
  const cacheDir = path.join(
    home,
    ".cache",
    DEFAULT_PLUGIN_NAME,
    "sources",
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );

  const carried = typedKeys<SkillId>(BUILT_IN_MATRIX.skills).filter((id) => id !== omitting);
  await Promise.all(carried.map(async (id) => writeCatalogueSkill(cacheDir, id)));
  await writeCatalogueManifest(cacheDir, carried);

  await mkdir(path.dirname(cacheDir), { recursive: true });
  await writeFile(
    fetchRecordPath(cacheDir),
    JSON.stringify({ tar: `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz` }),
  );

  return cacheDir;
}

async function writeCatalogueManifest(cacheDir: string, carried: SkillId[]): Promise<void> {
  const manifestPath = marketplaceManifestPath(cacheDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace(carried.map((id) => createMockMarketplacePlugin(id))),
      name: DEFAULT_PUBLIC_SOURCE_NAME,
    }),
  );
}

// Writes metadata.yaml too: the copy stamps provenance into it and fails without one.
async function writeCatalogueSkill(cacheDir: string, skillId: SkillId): Promise<void> {
  const skill = BUILT_IN_MATRIX.skills[skillId];
  if (skill === undefined) throw new Error(`seedDefaultSourceCache: no skill '${skillId}'`);

  const skillDir = path.join(cacheDir, SOURCE_SRC_DIR, skill.path);
  await mkdir(skillDir, { recursive: true });

  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
  await writeFile(skillMdPath, renderSkillMd(skillId, skill.description));
  await writeFile(
    path.join(skillDir, STANDARD_FILES.METADATA_YAML),
    renderMetadataYaml({
      contentHash: await computeFileHash(skillMdPath),
      displayName: skill.displayName,
      slug: skill.slug,
      category: skill.category,
      domain: domainOfCategory(skill.category),
    }),
  );
}

function domainOfCategory(category: CategoryPath): string {
  // `local` is the one category path the catalogue's table has no slot for.
  if (category === LOCAL_PSEUDO_CATEGORY) throw undeclaredCategory(category);

  const declared = BUILT_IN_MATRIX.categories[category]?.domain;
  if (declared === undefined) throw undeclaredCategory(category);

  return declared;
}

function undeclaredCategory(category: CategoryPath): Error {
  return new Error(`seedDefaultSourceCache: no category '${category}'`);
}
