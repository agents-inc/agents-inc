/**
 * The frontmatter schema against the three keys the agent template actually writes.
 *
 * `src/agents/_templates/agent.liquid` emits `isolation:`, `experimental:` and `hooks:` into a
 * compiled sub-agent's YAML frontmatter whenever the agent declares them, and two production
 * readers parse that frontmatter back through `agentFrontmatterValidationSchema` —
 * `validateAgentFrontmatter` in `lib/plugins/plugin-validator.ts` and `parseAgentFrontmatter` in
 * `lib/agents/agent-plugin-compiler.ts`. The schema is `.strict()`, so a key it does not name is
 * not merely ignored: `validate` reports the agent as invalid frontmatter, and the plugin compiler
 * refuses the parse and makes `compileAgentPlugin` throw on the agent it was asked to package.
 *
 * Two of the three were emitted by the template while the schema still refused them, for as long
 * as it took one change to reach three of the four schemas that needed them. That is the failure
 * this file exists to make loud, and it is a quiet one to have: no agent this repository ships
 * declares any of the three, so nothing compiled here would have reported it.
 *
 * **The strictness is as much the subject as the three keys**, which is why the refusals below
 * outnumber the acceptances. Widening the schema by dropping `.strict()`, or by loosening the hook
 * definition back to one whose actions are optional, would satisfy the acceptance cases while
 * quietly stripping what a user wrote instead of reporting it — an agent asking for
 * `cacheTtlSeconds`, or writing its actions one level flat, would compile carrying nothing it
 * asked for and no complaint.
 */

import { describe, expect, it } from "vitest";

import { agentFrontmatterValidationSchema } from "../schemas.js";
import { AGENT_ISOLATIONS, CACHE_TTLS } from "../../types/matrix.js";
import { AGENT_DEFS } from "./mock-data/mock-agents.js";
import type { AgentFrontmatter } from "../../types/index.js";

/** How `agent.liquid` writes a tools list into frontmatter — one string rather than a sequence. */
const TOOLS_SEPARATOR = ", ";

/**
 * The frontmatter of a compiled sub-agent declaring neither key — the control every case below is
 * exactly one key away from.
 *
 * Typed as `AgentFrontmatter` so the compiler holds it against the shape production narrows to,
 * and built from `AGENT_DEFS` so the agent's own strings are the canonical ones rather than a
 * second set invented here. It is an object rather than rendered text because that is what both
 * readers hand the schema: each calls `extractFrontmatter` first and parses what comes back.
 */
const COMPILED_FRONTMATTER: AgentFrontmatter = {
  name: AGENT_DEFS.webDev.name,
  description: AGENT_DEFS.webDev.description,
  tools: AGENT_DEFS.webDev.tools.join(TOOLS_SEPARATOR),
};

/**
 * The two keys `agent.liquid` emits, STATED rather than read off the schema.
 *
 * Reading them from the schema is what would make this file vacuous: the whole claim is that the
 * template and the schema name the same keys, and a test that asked the schema what it names could
 * not tell the two apart. These mirror the template, which is the side that does not move.
 */
const ISOLATION_KEY = "isolation";
const EXPERIMENTAL_KEY = "experimental";
const HOOKS_KEY = "hooks";

/** The hook event the fixtures below hang their actions off. */
const HOOK_EVENT = "SubagentStop";

/**
 * A hooks block as `agent.liquid` emits one — the value of `{{ agent.hooks | json }}`, held as the
 * object it decodes to for the same reason the fixture above is an object: both readers run
 * `extractFrontmatter` first, so an object is literally what the schema is handed. A matcher and a
 * real command, because an empty definition is the case the refusal below owns.
 */
const DECLARED_HOOKS = {
  [HOOK_EVENT]: [{ matcher: "Write", hooks: [{ type: "command", command: "npm run lint" }] }],
} as const satisfies NonNullable<AgentFrontmatter["hooks"]>;

/**
 * The same intent with the `hooks:` wrapper forgotten — the actions hung straight off the event.
 * Every key in it is one the action schema declares, which is what made it survivable: the loader
 * used to strip it to an empty definition rather than refuse it.
 */
const ACTIONS_WITHOUT_A_DEFINITION = {
  [HOOK_EVENT]: [{ type: "command", command: "npm run lint" }],
};

/** Zod's own issue codes — the three vocabularies these refusals are read in. */
const UNRECOGNIZED_KEY = "unrecognized_keys";
const INVALID_VALUE = "invalid_value";
const INVALID_TYPE = "invalid_type";

/**
 * A separation mode Claude Code's frontmatter does not document, guarded below against
 * `AGENT_ISOLATIONS` so it cannot silently become legal the day a second mode is.
 */
const UNDOCUMENTED_ISOLATION_MODE = "sandbox";

/**
 * A near miss of `cacheTtl` rather than a foreign word, because a mistyped option name is the
 * mistake the sub-object's strictness exists to report.
 */
const UNDOCUMENTED_EXPERIMENTAL_KEY = "cacheTtlSeconds";

/** A key no compiled agent's frontmatter carries, and that neither schema has ever named. */
const KEY_NO_AGENT_CARRIES = "telemetry";

describe("agent frontmatter validation and the keys the agent template emits", () => {
  /**
   * The subject guard for everything below. Without it, an acceptance case that went red would be
   * indistinguishable from a fixture that was never valid in the first place.
   */
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
