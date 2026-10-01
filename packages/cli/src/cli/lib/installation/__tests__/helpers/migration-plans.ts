/**
 * Migration plans for `mode-migrator.test.ts`, built from what each case names: which skill moves,
 * which way, and between which scopes.
 *
 * `executeMigration` reads a migration's sources for one thing only — which side of it is
 * `EJECT_SOURCE` — so the direction is the factory's NAME and the two scopes are its argument,
 * while the marketplace's own name, which no branch reads, lives here once. Every plugin half is
 * the public marketplace's, which is the one a case in that file ever moved a skill to or from.
 */
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../../../consts.js";
import type { SkillId, SkillScope } from "../../../../types/index.js";
import type { MigrationPlan, SkillMigration } from "../../mode-migrator.js";

/** The scope a skill is installed at before the migration, and the one it is installed at after. */
type ScopeMove = { from: SkillScope; to: SkillScope };

/** A skill leaving its marketplace plugin for an ejected copy. */
export function toEjectMigration(id: SkillId, scopes: ScopeMove): SkillMigration {
  return {
    id,
    oldSource: DEFAULT_PUBLIC_SOURCE_NAME,
    newSource: EJECT_SOURCE,
    oldScope: scopes.from,
    newScope: scopes.to,
  };
}

/** An ejected copy leaving for the marketplace's plugin. */
export function toPluginMigration(id: SkillId, scopes: ScopeMove): SkillMigration {
  return {
    id,
    oldSource: EJECT_SOURCE,
    newSource: DEFAULT_PUBLIC_SOURCE_NAME,
    oldScope: scopes.from,
    newScope: scopes.to,
  };
}

/** A plan holding exactly the migrations named. A kind the caller leaves out holds none. */
export function buildMigrationPlan(migrations: Partial<MigrationPlan>): MigrationPlan {
  return { toEject: [], toPlugin: [], scopeChanges: [], ...migrations };
}
