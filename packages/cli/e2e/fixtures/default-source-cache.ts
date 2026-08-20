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
import { computeFileHash } from "../../src/cli/lib/versioning.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import { DEFAULT_PLUGIN_NAME, SOURCE_SRC_DIR, STANDARD_FILES } from "../../src/cli/consts.js";
import { isCategory } from "../../src/cli/utils/type-guards.js";
import { typedKeys } from "../../src/cli/utils/typed-object.js";
import type { CategoryPath, SkillId } from "../../src/cli/types/index.js";

/**
 * A checkout of the DEFAULT public marketplace, seeded into the cache a run would fetch it into.
 *
 * It exists because nothing else can reach the default-source path. Every other source a spec names
 * is a directory on disk, and for those the matrix is BUILT FROM the directory — so the matrix and
 * the files agree by construction and can never disagree. The default source is the one where they
 * are two artefacts: the matrix is the vendored `BUILT_IN_MATRIX`, the files are whatever the fetch
 * brought back, and a user whose CLI predates a marketplace change holds a pair that disagrees.
 * `omitting` is how a spec produces exactly that state.
 *
 * Offline by construction, twice over. The copy is written where `fetchFromSource` looks, so no
 * download is attempted; and the record beside it carries a `tar` with NO `etag`, which is the one
 * shape `classifyCachedCopy` answers `current` to without asking the network anything. A seeded
 * copy with no record at all reads as `unrecorded` and is re-downloaded — the exact failure this
 * fixture exists to avoid — which is why `fetchRecordPath` is imported rather than spelled here.
 */
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

  await mkdir(path.dirname(cacheDir), { recursive: true });
  await writeFile(
    fetchRecordPath(cacheDir),
    JSON.stringify({ tar: `https://example.invalid/${DEFAULT_PLUGIN_NAME}.tar.gz` }),
  );

  return cacheDir;
}

/**
 * One skill where the copy path reads it from: `<checkout>/src/<skill.path>/`.
 *
 * BOTH files, because a copy is not finished when the directory lands: `injectForkedFromMetadata`
 * reads the copy's own `metadata.yaml` to stamp provenance into it, so a skill written with only a
 * SKILL.md fails at the destination — a failure no checkout of a real marketplace can produce, and
 * one that would have filled this fixture's refusal with 200 lines that are the fixture's fault.
 *
 * Its taxonomy is READ from the catalogue entry rather than derived from the id, and the hash is
 * the file's own — the two things a published `metadata.yaml` actually carries.
 */
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
      // A skill's domain is its CATEGORY's, stated once in the catalogue's own category table.
      domain: domainOfCategory(skill.category),
    }),
  );
}

function domainOfCategory(category: CategoryPath): string {
  const declared = isCategory(category) ? BUILT_IN_MATRIX.categories[category]?.domain : undefined;
  if (declared === undefined) throw new Error(`seedDefaultSourceCache: no category '${category}'`);

  return declared;
}
