---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/new/marketplace.ts
  - src/cli/lib/__tests__/commands/new/marketplace.test.ts
  - e2e/commands/new-marketplace.e2e.test.ts
standards_docs: []
date: 2026-04-14
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: --output references removed from new/marketplace.ts
---

## What Was Wrong

The recent flag cleanup pass deleted `--output` / `-o` from the `new skill` command. However, `src/cli/commands/new/marketplace.ts` (in `createMarketplaceFiles()`) still invokes `new:skill` internally with `--output`:

```ts
const skillArgs = [skillName, "--output", skillsDir, "--domain", LOCAL_DEFAULTS.DOMAIN];
if (force) skillArgs.push("--force");
await this.config.runCommand("new:skill", skillArgs);
```

This causes every happy-path test for `new:marketplace` to fail with `Nonexistent flag: --output`. The wizard fails to scaffold the dummy skill, so the command exits non-zero and downstream assertions about created files (`SKILL.md`, `metadata.yaml`, `marketplace.json`, `dist/plugins/`, etc.) do not hold.

13 tests in `src/cli/lib/__tests__/commands/new/marketplace.test.ts` are currently failing because of this. The E2E suite at `e2e/commands/new-marketplace.e2e.test.ts` will also fail for the same reason.

The flag cleanup was incomplete: removing a flag from the public API requires sweeping internal callers as well.

## Fix Applied

None — discovery only. As CLI tester I do not modify implementation. The CLI tester passes for unrelated tests in the affected files; the 13 failing tests are caused by the implementation bug, not by the test changes.

The test file at `src/cli/lib/__tests__/commands/new/marketplace.test.ts` was intentionally left unchanged because:

- It does not reference any of the flags that were removed in the cleanup pass
- All failures stem from the impl calling a removed flag, not from outdated test expectations

## Proposed Standard

1. **Pre-commit checklist for flag removal:** When deleting a flag from a command, grep the entire repo for `runCommand(..., [..., "--<flag>", ...])` and `<flag>:` (in oclif test args) before merging. Add this to `.ai-docs/standards/clean-code-standards.md` under a new "Flag lifecycle" section.

2. **Replacement path for `new:marketplace` calling `new:skill`:** The `new:skill` command should either (a) re-add `--output` since `new:marketplace` legitimately needs it for marketplace-internal scaffolding, or (b) extract the skill-scaffolding logic into a shared function (`scaffoldSkillFiles` already exists at the bottom of `src/cli/commands/new/skill.ts`) that `new:marketplace` calls directly without going through `runCommand`. Option (b) is cleaner and avoids re-introducing the removed flag.

3. **Findings discipline reminder:** When a flag-removal commit lands, the same commit (or an immediately following one) should run `npm test` and `npm run e2e` to catch this class of bug before it ships.
