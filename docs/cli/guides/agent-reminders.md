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
3. **Create tasks in [todo/cli.md](../../../todo/cli.md)** with findings
4. Document decisions in the appropriate `docs/` file

## R3: Blockers Go to Top

If a serious blocker is discovered, add it to the top of [todo/cli.md](../../../todo/cli.md) immediately. Do not continue work that depends on the blocked item.

## R4: Do NOT Commit

**Keep all changes uncommitted.** The user will handle committing when ready.

## R5: Delete Landed Tasks, Record One Line

Once a task is done, **delete its row from [todo/cli.md](../../../todo/cli.md)** and append one line to [todo/archive.md](../../../todo/archive.md). A ticked box is not a record; the changelog and git history are.

## R6: Update Task Status

Use the tracker's `Status` column — `Ready for Dev`, `Investigate`, `Needs Assistance`, `Refined`, `Deferred`.

**IMPORTANT:** Sub-agents MUST update [todo/cli.md](../../../todo/cli.md) when starting and completing subtasks.

## R7: Compact at 70% Context

When context usage reaches 70%, run `/compact`.

## R8: Cross-Repository Changes Allowed

You may make changes in the skills directory (`/home/vince/dev/skills`) as well, if needed. This is the source marketplace for skills and agents.
