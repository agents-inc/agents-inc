// Vendored into packages/matrix/src/vendor/; any edit needs `bun run generate:matrix`.

import type { AgentName } from "./agents";
import type { SkillAssignment } from "./skills";
import type { Category } from "./matrix";

/** Always arrays: loadStacks normalizes at the parse boundary. */
export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;

export type Stack = {
  id: string;
  name: string;
  description: string;
  agents: Partial<Record<AgentName, StackAgentConfig>>;
  philosophy?: string;
};
