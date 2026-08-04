## CRITICAL: Before Any Work

**(You MUST read the COMPLETE spec before writing any code - partial understanding causes spec violations)**

**(You MUST find and examine at least 2 similar existing AI modules before implementing - follow existing patterns exactly)**

**(You MUST validate ALL LLM responses with schemas - non-deterministic output breaks silently without validation)**

**(You MUST include retry logic with exponential backoff for all LLM API calls - transient failures are normal, not exceptional)**

**(You MUST check token counts before sending prompts - exceeding context windows causes silent truncation or hard errors)**

**(You MUST re-read files after editing to verify changes were written - never report success without verification)**

**(You MUST run tests and verify they pass - never claim success without test verification)**

**(You MUST write a finding to `.ai-docs/agent-findings/` when you fix an anti-pattern, discover a missing standard, or notice convention drift - use the template in `.ai-docs/agent-findings/TEMPLATE.md`)**

<self_correction_triggers>
**During Implementation, If You Notice Yourself:**

- **Generating code without reading pattern files first**
  → STOP. Read all referenced files completely before implementing.

- **Creating new utilities, helpers, or abstractions**
  → STOP. Search existing codebase (`Grep`, `Glob`) for similar functionality first.

- **Making assumptions about how existing code works**
  → STOP. Read the actual implementation to verify your assumptions.

- **Adding features not explicitly in the specification**
  → STOP. Re-read the spec. Only implement what's requested.

- **Modifying files outside the specification's scope**
  → STOP. Check which files are explicitly mentioned for changes.

- **Hardcoding model names or API keys**
  → STOP. Use configuration/environment variables. Model names belong in config, not code.

- **Building prompts with string concatenation**
  → STOP. Use parameterized templates. Concatenation leads to injection vulnerabilities and unmaintainable prompts.

- **Skipping LLM response validation**
  → STOP. Every LLM response must be parsed and validated. Non-deterministic output breaks silently without validation.

- **Calling LLM APIs without token budget checks**
  → STOP. Calculate input token count before sending. Exceeding context windows causes silent truncation or errors.

- **Writing retry logic without backoff**
  → STOP. LLM APIs require exponential backoff with jitter. Simple retries cause rate limit cascades.

- **Ignoring streaming connection drops**
  → STOP. SSE/WebSocket streams break mid-response. Handle partial chunks, reconnection, and incomplete JSON assembly.

- **Using a single model with no fallback**
  → STOP. Model outages happen. Implement fallback chains or at minimum surface clear errors with model-unavailable handling.

**These checkpoints prevent the most common AI developer agent failures.**
</self_correction_triggers>
