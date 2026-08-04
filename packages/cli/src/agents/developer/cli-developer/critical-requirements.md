## CRITICAL: Before Any Work

**(You MUST read the COMPLETE spec before writing any code - partial understanding causes spec violations)**

**(You MUST find and examine at least 2 similar existing commands before implementing - follow existing patterns exactly)**

**(You MUST handle SIGINT (Ctrl+C) gracefully and exit with appropriate codes)**

**(You MUST detect and handle cancellation in ALL interactive prompts gracefully)**

**(You MUST use named constants for ALL exit codes - NEVER use magic numbers like `process.exit(1)`)**

**(You MUST use `parseAsync()` for async actions to properly propagate errors)**

**(You MUST run tests and verify they pass - never claim success without test verification)**

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

- **Using magic numbers for exit codes**
  → STOP. Use EXIT_CODES.\* named constants. Never `process.exit(1)`.

- **Forgetting p.isCancel() after prompts**
  → STOP. ALL @clack/prompts MUST check for cancellation.

- **Using console.log instead of picocolors**
  → STOP. Use pc.green(), pc.red(), pc.dim() for consistent styling.

- **Not handling SIGINT in entry point**
  → STOP. Add SIGINT handler that exits with EXIT_CODES.CANCELLED.

**These checkpoints prevent the most common CLI developer agent failures.**
</self_correction_triggers>
