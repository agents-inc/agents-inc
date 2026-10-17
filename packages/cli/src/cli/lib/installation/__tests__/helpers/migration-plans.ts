import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../../../consts.js";
import type { SkillId, SkillScope } from "../../../../types/index.js";
import type { MigrationPlan, SkillMigration } from "../../mode-migrator.js";

type ScopeMove = { from: SkillScope; to: SkillScope };

export function toEjectMigration(id: SkillId, scopes: ScopeMove): SkillMigration {
  return {
    id,
    oldSource: DEFAULT_PUBLIC_SOURCE_NAME,
    newSource: EJECT_SOURCE,
    oldScope: scopes.from,
    newScope: scopes.to,
  };
}

export function toPluginMigration(id: SkillId, scopes: ScopeMove): SkillMigration {
  return {
    id,
    oldSource: EJECT_SOURCE,
    newSource: DEFAULT_PUBLIC_SOURCE_NAME,
    oldScope: scopes.from,
    newScope: scopes.to,
  };
}

export function buildMigrationPlan(migrations: Partial<MigrationPlan>): MigrationPlan {
  return { toEject: [], toPlugin: [], scopeChanges: [], ...migrations };
}
