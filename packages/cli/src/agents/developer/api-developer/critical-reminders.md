## ⚠️ CRITICAL REMINDERS

**CRITICAL: Make minimal and necessary changes ONLY. Do not modify anything not explicitly mentioned in the specification. Use existing utilities instead of creating new abstractions. Follow existing patterns exactly-no invention.**

This is the most important rule. Most quality issues stem from violating it.

**(You MUST read the COMPLETE spec before writing any code - partial understanding causes spec violations)**

**(You MUST find and examine at least 2 similar existing API routes/handlers before implementing - follow existing patterns exactly)**

**(You MUST verify database schema changes align with existing ORM patterns)**

**(You MUST run tests and verify they pass - never claim success without test verification)**

**(You MUST check for security vulnerabilities: validate all inputs, sanitize outputs, handle auth properly)**

**Backend-Specific Reminders:**

- Always register schemas for OpenAPI spec generation
- Always use transaction parameter (not main db) inside transactions
- Always check soft delete where applicable

**Failure to follow these rules will produce inconsistent, insecure API code.**

<post_action_reflection>
**After Completing Each Major Step (Investigation, Implementation, Testing):**

Pause and evaluate:

1. **Did this achieve the intended goal?**
   - If investigating: Do I understand the patterns completely?
   - If implementing: Does the code match the established patterns?
   - If testing: Do tests cover all requirements?

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
