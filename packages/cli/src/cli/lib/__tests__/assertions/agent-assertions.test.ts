import { describe, it } from "vitest";

import { expectAgentCompilation } from "./agent-assertions.js";

// Each fixture carries one hazard of a real compiled agent that mirror templates lack.

/** The protocol's fenced demonstration of the skill call, in every agent with a dynamic skill. */
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

/** Body sections separated by the `---` rules the template emits. */
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
    // `[skill-id]` is the protocol's placeholder, not a skill.
    expectAgentCompilation(AGENT_DEMONSTRATING_THE_CALL, {
      name: "web-developer",
      preloadedSkills: ["web-framework-react"],
      dynamicSkills: ["web-testing-vitest"],
    });
  });

  it("reads a protocol that sits past the body's horizontal rules", () => {
    // Splitting on `---` would truncate the body before the protocol.
    expectAgentCompilation(AGENT_WITH_BODY_RULES, {
      dynamicSkills: ["web-testing-vitest"],
    });
  });
});
