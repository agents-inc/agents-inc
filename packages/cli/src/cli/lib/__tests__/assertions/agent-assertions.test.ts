import { describe, it } from "vitest";

import { expectAgentCompilation } from "./agent-assertions.js";

/**
 * The shared assertion nobody opens, held against text in the shape a compiled agent really
 * arrives in rather than the mirror template its call sites render.
 *
 * Both fixtures below carry one hazard of that shape and nothing else. A mirror template has
 * neither, which is why a reader that trips over both can sit under twenty green call sites: the
 * assertion is only ever as strict as the text it is handed, and the text it is handed in a unit
 * test is written by the same person as the assertion.
 */

/**
 * The protocol's own fenced demonstration of the call it is teaching, which is a real part of
 * every compiled agent that has a dynamic skill at all.
 */
const AGENT_DEMONSTRATING_THE_CALL = `---
name: web-developer
skills:
  - web-framework-react
---
# Web Developer Agent

<skill_activation_protocol>
### Step 2 - ACTIVATE

\`\`\`
skill: "[skill-id]"
\`\`\`

## Available Skills (Require Loading)

### web-testing-vitest
- Description: Vitest test runner
- Invoke: \`skill: "web-testing-vitest"\`
- Use when: when working with web-testing

</skill_activation_protocol>

---

<critical_reminders>
Check your work.
</critical_reminders>
`;

/** An agent whose prose separates its sections with the horizontal rules the template emits. */
const AGENT_WITH_BODY_RULES = `---
name: web-developer
skills:
  - web-framework-react
---
# Web Developer Agent

---

<skill_activation_protocol>
## Available Skills (Require Loading)

### web-testing-vitest
- Description: Vitest test runner
- Invoke: \`skill: "web-testing-vitest"\`
- Use when: when working with web-testing

</skill_activation_protocol>

---

<critical_reminders>
Check your work.
</critical_reminders>
`;

describe("expectAgentCompilation", () => {
  it("reports the protocol's skills and not the invocation it demonstrates", () => {
    // `[skill-id]` is the placeholder the protocol teaches the call with. Reported as a skill, it
    // makes every exact dynamic-skill expectation unsatisfiable — and every `noDynamicSkills`
    // one pass for a reason that has nothing to do with the agent under test.
    expectAgentCompilation(AGENT_DEMONSTRATING_THE_CALL, {
      name: "web-developer",
      preloadedSkills: ["web-framework-react"],
      dynamicSkills: ["web-testing-vitest"],
    });
  });

  it("reads a protocol that sits past the body's horizontal rules", () => {
    // A reader that splits the frontmatter off rather than replacing it cuts on every rule as
    // well, and hands back the fragment before the first one — so the protocol is simply absent,
    // and an absence assertion over it passes for free.
    expectAgentCompilation(AGENT_WITH_BODY_RULES, {
      dynamicSkills: ["web-testing-vitest"],
    });
  });
});
