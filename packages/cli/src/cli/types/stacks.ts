// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts.
// ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli;
// `generate:matrix:check` is the gate.

import type { AgentName } from "./agents";
import type { SkillAssignment } from "./skills";
import type { Category } from "./matrix";

/** Maps category IDs to skill assignments — always arrays (normalized at parse boundary in loadStacks) */
export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;

/** Stack definition from config/stacks.ts */
export type Stack = {
  id: string;
  name: string;
  description: string;
  /** Agent configurations mapping agent IDs to their technology selections */
  agents: Partial<Record<AgentName, StackAgentConfig>>;
  philosophy?: string;
};

/** Top-level structure of config/stacks.ts */
export type StacksConfig = {
  stacks: Stack[];
};
