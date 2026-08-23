import { describe, expect, it } from "vitest";

import { compactedStackIn } from "./compacted-stack.js";
import type { CompactedStack } from "./compacted-stack.js";

/**
 * The writer's own layout, verbatim in shape from `generateStandaloneConfig`
 * (`configuration/config-writer.ts`): `JSON.stringify(stack, null, 2)` inside a
 * `const stack: … = …;` declaration, with the skills and agents sections above it and the
 * `export default` table of contents below.
 *
 * Both compactions are here because they are what every caller asserts on. An exclusive
 * category holds its assignment BARE — as the id alone when nothing else is being said, as an
 * object when a flag is — while a non-exclusive one keeps its array at length one. The nesting
 * is the other half of the fixture: three inner closing braces stand between the declaration
 * and its own terminator, and a reader that stops at the first of them answers with
 * `api-developer` alone and looks entirely credible doing it.
 */
const CONFIG_SOURCE_WITH_TWO_AGENTS = `const skills: SkillConfig[] = [
  { "id": "web-framework-react", "scope": "project", "origin": "eject" },
];

const agents: AgentScopeConfig[] = [
  { "name": "web-developer", "scope": "project" },
];

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "api-developer": {
    "api-api": "api-framework-hono"
  },
  "web-developer": {
    "web-framework": {
      "id": "web-framework-react",
      "preloaded": true
    },
    "web-testing": [
      "web-testing-vitest"
    ]
  }
};

const selectedDomains: Domain[] = ["web", "api"];

export default {
  name: "fixture",
  skills,
  agents,
  stack,
  selectedDomains,
} satisfies ProjectConfig;
`;

const CONFIG_SOURCE_WITH_ONE_AGENT = `const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "api-developer": {
    "api-api": "api-framework-hono"
  }
};
`;

/**
 * A stack declared and left empty. The writer never emits this — `generateStandaloneConfig`
 * omits the declaration entirely once the stack has no agents — but a hand-written config can,
 * and the pair it makes with {@link CONFIG_SOURCE_WITHOUT_STACK} is what tells a caller which
 * of the two answers it is holding: an empty declaration reads as an empty stack, an absent
 * one throws.
 */
const CONFIG_SOURCE_WITH_EMPTY_STACK = `const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {};
`;

const CONFIG_SOURCE_WITHOUT_STACK = `const skills: SkillConfig[] = [
  { "id": "web-framework-react", "scope": "project", "origin": "eject" },
];
`;

const CONFIG_SOURCE_WITH_UNTERMINATED_STACK = `const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "api-developer": {}
`;

/**
 * A stack assigned from a name rather than written out. The `export default` below supplies the
 * `};` that ends the section, so the slice that follows the `=` is that block rather than any
 * stack — the plausible-looking fragment this reader must refuse instead of answering with.
 */
const CONFIG_SOURCE_WITH_STACK_BY_REFERENCE = `const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = SHARED_STACK;

export default {
  name: "fixture",
  stack,
};
`;

/** The same assignment with nothing after the `=` that opens an object at all. */
const CONFIG_SOURCE_WITH_UNOPENED_STACK = `const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = SHARED_STACK;
};
`;

const TWO_AGENT_STACK = {
  "api-developer": {
    "api-api": "api-framework-hono",
  },
  "web-developer": {
    "web-framework": { id: "web-framework-react", preloaded: true },
    "web-testing": ["web-testing-vitest"],
  },
} satisfies CompactedStack;

const ONE_AGENT_STACK = {
  "api-developer": {
    "api-api": "api-framework-hono",
  },
} satisfies CompactedStack;

const EMPTY_STACK = {} satisfies CompactedStack;

describe("compactedStackIn", () => {
  it("reads every agent past the inner braces, each category in the form it was written", () => {
    expect(compactedStackIn(CONFIG_SOURCE_WITH_TWO_AGENTS)).toStrictEqual(TWO_AGENT_STACK);
  });

  it("reads a single-agent stack", () => {
    expect(compactedStackIn(CONFIG_SOURCE_WITH_ONE_AGENT)).toStrictEqual(ONE_AGENT_STACK);
  });

  it("reads a declared but empty stack as an empty stack", () => {
    expect(compactedStackIn(CONFIG_SOURCE_WITH_EMPTY_STACK)).toStrictEqual(EMPTY_STACK);
  });

  it("throws naming the declaration marker when no stack is declared", () => {
    expect(() => compactedStackIn(CONFIG_SOURCE_WITHOUT_STACK)).toThrow(
      'Marker "const stack:" not found in config source.',
    );
  });

  it("throws naming the closing marker when the declaration is unterminated", () => {
    expect(() => compactedStackIn(CONFIG_SOURCE_WITH_UNTERMINATED_STACK)).toThrow(
      'Marker "};" not found in the "stack" section.',
    );
  });

  it("refuses the block below rather than answering with it when the stack is a reference", () => {
    expect(() => compactedStackIn(CONFIG_SOURCE_WITH_STACK_BY_REFERENCE)).toThrow(SyntaxError);
  });

  it("throws when nothing after the assignment opens an object literal", () => {
    expect(() => compactedStackIn(CONFIG_SOURCE_WITH_UNOPENED_STACK)).toThrow(
      "No object literal is assigned in the stack declaration:",
    );
  });
});
