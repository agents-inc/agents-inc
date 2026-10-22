/**
 * `agent.liquid` emits `isolation:`, `experimental:` and `hooks:`, and the `.strict()` frontmatter
 * schema must accept them. The strictness is equally the subject: a loosened schema would strip a
 * user's typo silently.
 */

import { describe, expect, it } from "vitest";

import { agentFrontmatterValidationSchema } from "../schemas.js";
import { AGENT_ISOLATIONS, CACHE_TTLS } from "../../types/matrix.js";
import { AGENT_DEFS } from "./mock-data/mock-agents.js";
import type { AgentFrontmatter } from "../../types/index.js";

const TOOLS_SEPARATOR = ", ";

/** The control every case below is one key away from; an object, as the readers hand it. */
const COMPILED_FRONTMATTER: AgentFrontmatter = {
  name: AGENT_DEFS.webDev.name,
  description: AGENT_DEFS.webDev.description,
  tools: AGENT_DEFS.webDev.tools.join(TOOLS_SEPARATOR),
};

/** Stated, not read off the schema: the claim is that template and schema agree. */
const ISOLATION_KEY = "isolation";
const EXPERIMENTAL_KEY = "experimental";
const HOOKS_KEY = "hooks";

const HOOK_EVENT = "SubagentStop";

/** As `{{ agent.hooks | json }}` decodes; a real command, as an empty definition is refused. */
const DECLARED_HOOKS = {
  [HOOK_EVENT]: [{ matcher: "Write", hooks: [{ type: "command", command: "npm run lint" }] }],
} as const satisfies NonNullable<AgentFrontmatter["hooks"]>;

/** The `hooks:` wrapper forgotten: each key suits an action, so only strictness refuses it. */
const ACTIONS_WITHOUT_A_DEFINITION = {
  [HOOK_EVENT]: [{ type: "command", command: "npm run lint" }],
};

const UNRECOGNIZED_KEY = "unrecognized_keys";
const INVALID_VALUE = "invalid_value";
const INVALID_TYPE = "invalid_type";

/** Guarded against `AGENT_ISOLATIONS` so it cannot silently become legal. */
const UNDOCUMENTED_ISOLATION_MODE = "sandbox";

/** A near miss of `cacheTtl`: a mistyped option is what the strictness exists to report. */
const UNDOCUMENTED_EXPERIMENTAL_KEY = "cacheTtlSeconds";

const KEY_NO_AGENT_CARRIES = "telemetry";

describe("agent frontmatter validation and the keys the agent template emits", () => {
  it("accepts a compiled agent's frontmatter that declares neither key", () => {
    const result = agentFrontmatterValidationSchema.safeParse(COMPILED_FRONTMATTER);

    expect(
      result.error?.issues,
      "the control fixture is refused, so no refusal below can be attributed to the key it adds",
    ).toBeUndefined();
    expect(result.data).toStrictEqual(COMPILED_FRONTMATTER);
  });

  it("accepts every isolation mode the frontmatter vocabulary documents", () => {
    const refused = AGENT_ISOLATIONS.filter(
      (isolation) =>
        !agentFrontmatterValidationSchema.safeParse({
          ...COMPILED_FRONTMATTER,
          [ISOLATION_KEY]: isolation,
        }).success,
    );

    expect(
      refused,
      "agent.liquid emits these into frontmatter, and both readers parse that frontmatter through this schema — a refused mode makes the compiled agent unvalidatable and unpackageable",
    ).toStrictEqual([]);
  });

  it("accepts every cache TTL the experimental options document", () => {
    const refused = CACHE_TTLS.filter(
      (cacheTtl) =>
        !agentFrontmatterValidationSchema.safeParse({
          ...COMPILED_FRONTMATTER,
          [EXPERIMENTAL_KEY]: { cacheTtl },
        }).success,
    );

    expect(
      refused,
      "agent.liquid emits `experimental` as a JSON map whenever the agent declares one — a refused TTL makes the compiled agent unvalidatable and unpackageable",
    ).toStrictEqual([]);
  });

  it("accepts the hooks block the template emits", () => {
    const result = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      [HOOKS_KEY]: DECLARED_HOOKS,
    });

    expect(
      result.error?.issues,
      "agent.liquid emits `hooks` as a JSON map whenever the agent declares one — a refused block makes the compiled agent unvalidatable and unpackageable",
    ).toBeUndefined();
    expect(
      result.data?.[HOOKS_KEY],
      "the block came back changed, so what the reader validates is not what the template wrote",
    ).toStrictEqual(DECLARED_HOOKS);
  });

  it("refuses a hook definition that declares no actions", () => {
    const result = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      [HOOKS_KEY]: ACTIONS_WITHOUT_A_DEFINITION,
    });

    expect(
      result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      "a definition with nothing to fire is accepted — the agent compiles with a hooks key that does nothing, and the command its author wrote is nowhere in the file",
    ).toStrictEqual([{ code: INVALID_TYPE, path: [HOOKS_KEY, HOOK_EVENT, 0, HOOKS_KEY] }]);
  });

  it("still refuses a key neither the template nor the schema names", () => {
    const result = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      [KEY_NO_AGENT_CARRIES]: true,
    });

    expect(
      result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      "the schema stopped being strict — a mistyped frontmatter key is now waved through instead of reported",
    ).toStrictEqual([{ code: UNRECOGNIZED_KEY, path: [] }]);
  });

  it("refuses an isolation mode the vocabulary does not document", () => {
    expect(
      AGENT_ISOLATIONS,
      "the fixture names a documented mode, so this case no longer describes an illegal value",
    ).not.toContain(UNDOCUMENTED_ISOLATION_MODE);

    const result = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      [ISOLATION_KEY]: UNDOCUMENTED_ISOLATION_MODE,
    });

    expect(
      result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      "the value was not judged against the isolation vocabulary — the key is either unknown to the schema or typed loosely enough to take any string",
    ).toStrictEqual([{ code: INVALID_VALUE, path: [ISOLATION_KEY] }]);
  });

  it("refuses an experimental option the vocabulary does not document", () => {
    const result = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      [EXPERIMENTAL_KEY]: { [UNDOCUMENTED_EXPERIMENTAL_KEY]: CACHE_TTLS[0] },
    });

    expect(
      result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      "the experimental map is not strict — a mistyped option name is stripped in silence, and the agent compiles carrying no cache setting at all",
    ).toStrictEqual([{ code: UNRECOGNIZED_KEY, path: [EXPERIMENTAL_KEY] }]);
  });
});
