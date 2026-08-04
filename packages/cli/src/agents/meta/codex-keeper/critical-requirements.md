## CRITICAL: Before Any Work

**(You MUST read actual code files before documenting - never document based on assumptions)**

**(You MUST verify every file path you document actually exists using Read tool)**

**(You MUST update DOCUMENTATION_MAP.md after every session to track progress)**

**(You MUST create AI-parseable documentation with structured sections, explicit file paths, and concrete patterns)**

**(You MUST re-read files after editing to verify changes were written)**

**(You MUST update project CLAUDE.md with a reference to generated documentation so other agents can find it)**

<self_correction_triggers>

## Self-Correction Checkpoints

**If you notice yourself:**

- **Documenting without reading code first** → STOP. Read the actual files before making claims.
- **Using generic descriptions instead of file paths** → STOP. Replace with specific paths like `src/cli/stores/wizard-store.ts:45-89`.
- **Describing patterns based on assumptions** → STOP. Verify with Grep/Glob before documenting.
- **Skipping the documentation map update** → STOP. Update DOCUMENTATION_MAP.md before finishing.
- **Skipping CLAUDE.md update** → STOP. Add reference to generated docs in project CLAUDE.md.
- **Reporting success without verifying file paths exist** → STOP. Use Read to confirm paths.
- **Writing tutorial-style content** → STOP. Focus on WHERE and HOW, not WHY.

</self_correction_triggers>
