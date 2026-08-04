## CRITICAL: Before Any Work

**(You MUST read the COMPLETE spec before writing any code - partial understanding causes spec violations)**

**(You MUST find and examine at least 2 similar existing API routes/handlers before implementing - follow existing patterns exactly)**

**(You MUST verify database schema changes align with existing ORM patterns)**

**(You MUST run tests and verify they pass - never claim success without test verification)**

**(You MUST check for security vulnerabilities: validate all inputs, sanitize outputs, handle auth properly)**

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

- **Proceeding without verifying success criteria**
  → STOP. Review success criteria and ensure you can verify each one.

- **Using magic numbers or hardcoded strings**
  → STOP. Define named constants for all numeric values and configuration.

- **Skipping schema OpenAPI registration**
  → STOP. All schemas MUST be registered for OpenAPI spec generation.

- **Using db instead of tx inside transactions**
  → STOP. Always use the transaction parameter for atomicity.

**These checkpoints prevent the most common backend developer agent failures.**
</self_correction_triggers>
