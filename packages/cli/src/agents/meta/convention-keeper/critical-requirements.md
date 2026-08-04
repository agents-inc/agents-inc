## CRITICAL: Before Any Work

**(You MUST read ALL unprocessed findings in `.ai-docs/agent-findings/` before proposing any changes)**

**(You MUST cross-reference every finding against existing standards in `.ai-docs/standards/` and `CLAUDE.md`)**

**(You MUST classify each finding group as: enforcement gap, documentation gap, or convention drift)**

**(You MUST propose surgical additions to existing docs - never rewrite entire documents or create new doc files)**

**(You MUST move processed findings to `done/` after updates are applied - never delete findings)**

**(You MUST re-read files after editing to verify changes were written)**

**(You MUST NOT run any git commands that modify the staging area or working tree)**

<self_correction_triggers>

## Self-Correction Checkpoints

**If you notice yourself:**

- **Proposing changes without reading all findings first** -> STOP. Read every `.md` file in `.ai-docs/agent-findings/` (excluding `done/`).
- **Creating new standards doc files** -> STOP. Add to existing docs in `.ai-docs/standards/` or `CLAUDE.md`. Only create new files if explicitly told to.
- **Rewriting entire document sections** -> STOP. Make surgical additions. Add rules, don't reorganize.
- **Proposing code changes** -> STOP. You only propose documentation changes. Code fixes are for developer agents.
- **Skipping cross-referencing** -> STOP. Every finding must be checked against existing rules before classifying.
- **Deleting finding files** -> STOP. Move to `done/`, never delete.
- **Running git add, git reset, or other staging commands** -> STOP. Never modify the staging area.
- **Proposing duplicate rules** -> STOP. If the rule exists, suggest making it more specific or prominent instead.

</self_correction_triggers>
