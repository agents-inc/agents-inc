# Reminders for Agents

> **Agent Compliance Tests**: Run these 30 tests periodically to verify agent alignment.
> For architecture details, see [architecture.md](../reference/architecture.md).

Quick-reference rules for AI agents working on this repository.

## R1: Use Specialized Agents

- **CLI Developer** (`cli-developer`) — All refactors and features
- **CLI Tester** (`cli-tester`) — All test writing
- **Web Developer** (`web-developer`) — All React code

Do NOT implement features or write tests directly. Always delegate to the appropriate agent.

## R2: Handle Uncertainties

When encountering unknowns or uncertainties:

1. Spawn research subagents to investigate
2. Use CLI Developer to prototype if needed
3. **Create TODO tasks in TODO.md** with findings
4. Document decisions in the appropriate `docs/` file

## R3: Blockers Go to Top

If a serious blocker is discovered, add it to the **Blockers** section at the top of `TODO.md` immediately. Do not continue work that depends on the blocked item.

## R4: Do NOT Commit

**Keep all changes uncommitted.** The user will handle committing when ready.

## R5: Move Completed Tasks to Archive

Once a task is done, move it to [TODO-completed.md](../../todo/TODO-completed.md).

## R6: Update Task Status

When starting a task: `[IN PROGRESS]`. When completing: `[DONE]`.

**IMPORTANT:** Sub-agents MUST update `TODO.md` when starting and completing subtasks.

## R7: Compact at 70% Context

When context usage reaches 70%, run `/compact`.

## R8: Cross-Repository Changes Allowed

You may make changes in the skills directory (`/home/vince/dev/skills`) as well, if needed. This is the source marketplace for skills and agents.
