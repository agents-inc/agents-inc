---
last_validated: 2026-08-18
---

# E2E Testing Standards (Pointer)

> **Pointer.** The rules live in `standards/e2e/`. This path is kept because inbound links (agent
> findings, `reference/testing/harness-decisions.md`, `DOCUMENTATION_MAP.md`) still use it — do not
> delete it without sweeping those references first.

This file used to be the monolith the `standards/e2e/` directory was split out of, and
`standards/e2e/anti-patterns.md` § "Rules Carried Forward from the Old Bible" is where the split
recorded which of its rules survived. It kept its full text afterwards, so every rule existed in two
writable copies — the condition
[documentation-bible.md § "A Count Lives in Exactly One Document"](./documentation-bible.md) forbids,
widened from count to membership. The two copies had already diverged: this file stated that
spacebar is inert on **any** globally-backed row, while `patterns.md` states — correctly, per the
dual-scope arms of `toggleTechnology` and `toggleAgent` in `src/cli/stores/wizard-store.ts` — that a
skill row collapses to its inherited `[G]` and only an agent row is inert. It also still described a
single `include` with smoke tests excluded, which `e2e/vitest.config.ts` replaced with two named
projects, and called `createE2ESource()` a 9-skill fixture in one section and a 10-skill one in
another.

`CLAUDE.md` has pointed authors at [`e2e/README.md`](./e2e/README.md) rather than here for as long as
the split has existed.

## Where each section went

| Was                                          | Now                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1. Test Organization                         | [e2e/README.md](./e2e/README.md) — Architecture, Directory Structure, File Naming, Vitest Configuration             |
| 2. Test Categories                           | [e2e/README.md](./e2e/README.md) § Test Categories                                                                  |
| 3. CLI Execution (`CLI.run`, launchers, PTY) | [e2e/page-objects.md](./e2e/page-objects.md), [e2e/test-data.md](./e2e/test-data.md)                                |
| 4. Interactive Testing, the keypress rule    | [e2e/page-objects.md](./e2e/page-objects.md), [e2e/README.md](./e2e/README.md) § Critical Rules                     |
| 5. File System, project and source factories | [e2e/test-data.md](./e2e/test-data.md)                                                                              |
| 6. Assertions and matchers                   | [e2e/assertions.md](./e2e/assertions.md)                                                                            |
| 7. Timing & Reliability                      | [e2e/README.md](./e2e/README.md) § Constants Quick-Reference, [e2e/page-objects.md](./e2e/page-objects.md)          |
| 8. Source & Marketplace Setup                | [e2e/test-data.md](./e2e/test-data.md)                                                                              |
| 9. Scope Testing                             | [e2e/patterns.md](./e2e/patterns.md), [e2e/anti-patterns.md](./e2e/anti-patterns.md) § Choosing the Wizard Launcher |
| 10. Anti-Patterns                            | [e2e/anti-patterns.md](./e2e/anti-patterns.md)                                                                      |
| 11. Additional exports from `test-utils.ts`  | `reference/testing/e2e-infrastructure.md` § E2E Helpers — an API inventory, which is reference, not a standard      |
| 12. What a Real E2E Test Must Do             | [e2e/test-structure.md](./e2e/test-structure.md) § What Makes a Test E2E, § No Production Imports in Tests          |
| The journeys the suite must cover            | [e2e/user-journeys.md](./e2e/user-journeys.md)                                                                      |
