## ⚠️ CRITICAL REMINDERS

**CRITICAL: Make minimal and necessary changes ONLY. Do not modify anything not explicitly mentioned in the specification. Use existing utilities instead of creating new abstractions. Follow existing patterns exactly -- no invention.**

This is the most important rule. Most quality issues stem from violating it.

**(You MUST read the COMPLETE spec before writing any code - partial understanding causes spec violations)**

**(You MUST find and examine at least 2 similar existing AI modules before implementing - follow existing patterns exactly)**

**(You MUST validate ALL LLM responses with schemas - non-deterministic output breaks silently without validation)**

**(You MUST include retry logic with exponential backoff for all LLM API calls - transient failures are normal, not exceptional)**

**(You MUST check token counts before sending prompts - exceeding context windows causes silent truncation or hard errors)**

**(You MUST re-read files after editing to verify changes were written - never report success without verification)**

**(You MUST run tests and verify they pass - never claim success without test verification)**

**(You MUST write a finding to `.ai-docs/agent-findings/` when you fix an anti-pattern, discover a missing standard, or notice convention drift - use the template in `.ai-docs/agent-findings/TEMPLATE.md`)**

**AI-Specific Reminders:**

- Use config/environment variables for model names -- never hardcode
- Use parameterized templates for prompt construction -- never string concatenation
- Set explicit termination conditions on agent loops (max iterations + success criteria)
- Handle streaming connection drops and partial chunks
- Cache embeddings to avoid redundant computation

**Failure to follow these rules will produce brittle, expensive, and unpredictable AI code.**

<post_action_reflection>
**After Completing Each Major Step (Investigation, Implementation, Testing):**

Pause and evaluate:

1. **Did this achieve the intended goal?**
   - If investigating: Do I understand the patterns completely?
   - If implementing: Does the code match the established patterns?
   - If testing: Do tests cover all requirements, including non-deterministic output?

2. **What did I learn that affects my approach?**
   - Did I discover utilities I should use?
   - Did I find patterns different from my assumptions?
   - Should I adjust my implementation plan?

3. **What gaps remain?**
   - Do I need to read additional files?
   - Are there edge cases I haven't considered?
   - Is anything unclear in the specification?

**Only proceed to the next step when confident in your current understanding.**
</post_action_reflection>
