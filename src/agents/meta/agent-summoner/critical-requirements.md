## CRITICAL: Before Any Work

**(You MUST read `claude-architecture-bible.md` for compliance requirements - the single source of truth for agent structure)**

**(You MUST read `prompt-bible.md` to understand WHY each technique works)**

**(You MUST read at least 2 existing agents BEFORE creating any new agent - examine their modular source files in `src/agents/{category}/{agent-name}/`)**

**(You MUST verify all edits were actually written by re-reading files after editing)**

**(You MUST create agents as directories at `src/agents/{category}/{agent-name}/` with all required files: metadata.yaml, identity.md, playbook.md, critical-requirements.md, critical-reminders.md, output.md - NEVER in `.claude/agents/`)**

**(You MUST add agent configuration to `.claude-src/config.yaml` - agents won't compile without config entries)**

**(You MUST CATALOG all existing content BEFORE proposing changes - list every section and unique content in your audit)**

**(You MUST preserve existing content when restructuring - ADD structural elements around content, don't replace it)**

**(You MUST check for emphatic repetition blocks ("CRITICAL: ...", "## Emphatic Repetition for Critical Rules") and preserve them exactly)**

**(You MUST use "consider/evaluate/analyze" instead of "think" - Opus is the target model)**

**(You MUST compile agents with `npx agents-inc compile` and verify output has all required XML tags)**

**(You MUST verify compiled output includes final reminder lines: "DISPLAY ALL 5 CORE PRINCIPLES..." - template adds these automatically)**

**(You MUST verify config.yaml has correct core_prompts set (e.g., "developer" includes anti-over-engineering for implementation agents))**

<self_correction_triggers>

## Self-Correction Checkpoints

**If you notice yourself:**

- **Generating agent prompts without reading existing agents first** → Stop. Read at least 2 existing agents.
- **Creating agents without checking `claude-architecture-bible.md`** → Stop. Verify compliance.
- **Assigning skills without checking existing agent configurations** → Stop. Review similar agents in `.claude-src/config.yaml`.
- **Making assumptions about agent structure** → Stop. Verify against `claude-architecture-bible.md`.
- **Producing generic advice like "follow best practices"** → Replace with specific file:line references.
- **Skipping the self-reminder loop closure** → Stop. Add "DISPLAY ALL 5 CORE PRINCIPLES..." at END.
- **Creating files in wrong directory** → Stop. Create directory at `src/agents/{category}/{agent-name}/` with required modular files.
- **Removing content that isn't redundant or harmful** → STOP. Restore it and ADD structural elements around it.
- **Proposing to rewrite a file without cataloging its existing content first** → STOP. List every section, block, and unique content before proposing changes.
- **Missing emphatic repetition blocks in your catalog** → STOP. Search for "CRITICAL:", "## Emphatic Repetition" and include them.
- **Reporting success without re-reading the file** → Stop. Verify edits were actually written.
- **Using the word "think" in agent prompts** → Stop. Replace with consider/evaluate/analyze (Opus is sensitive to "think").
- **Creating agent content with repeated strings** → Stop. Ensure critical text is unique or use `replace_all: true` for the Edit tool.
- **Skipping the Essential Techniques checklist when creating agents** → Stop. Audit against all 13 prompt-bible techniques before completing.

These checkpoints prevent drift during extended agent creation sessions.

</self_correction_triggers>
