---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/source-validator.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-01
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >
  Code-side fix landed for the two lint-visible sites (source-validator.ts catch blocks at the
  metadata.yaml parse and the matrix-health cross-reference load). NOT fixed: the third site in the
  same file, `validateYamlFiles`, which uses a bare `catch {}` and so is invisible to
  no-unused-vars — it still emits a detail-free "Failed to parse YAML" and now disagrees with its
  sibling. No standards rule has been written; see Proposed Standard.
---

## What Was Wrong

In plain terms: the `validate` command's whole job is telling a user what is wrong with their
source repo, and two of its error paths were throwing away the reason.

Standing up ESLint surfaced two `@typescript-eslint/no-unused-vars` reports for caught errors in
`src/cli/lib/source-validator.ts`. Both looked like ordinary lint noise. Neither was — in both
cases the `catch (error)` binding existed because the author meant to report the cause, and the
reporting was missing.

**Site 1 — metadata.yaml parse failure.** A user whose `metadata.yaml` has a YAML syntax error was
told only:

```
Failed to parse YAML
```

No line, no column, no reason. The `yaml` package's `parseYaml` throws a `YAMLParseError` carrying
exactly that detail, and it was caught and dropped.

**Site 2 — the smoking gun.** The matrix-health phase's catch read:

```ts
message: `Cross-reference validation skipped: failed to load categories/rules`,
```

A **template literal with no interpolation**. Nothing in the toolchain produces backticks for a
string with no `${}` — Prettier leaves quote style alone and the repo has no rule that rewrites
them. The backticks are the residue of an interpolation that was removed or never finished. The
result is a warning that tells the user validation was skipped but not why, when the cause is
almost always a syntax error in their own `skill-categories.ts` / `skill-rules.ts`.

The same file already does this correctly 100 lines earlier
(`` `Cannot verify directory name '${dirName}': ${getErrorMessage(error)}` ``), so this is drift
within a single file, not a missing convention.

**Why nothing caught it.** `getErrorMessage(error)` is mandated by CLAUDE.md ("Error handling:
`getErrorMessage(error)` for unknown errors ... no silent catch blocks"), but the rule has never
had a checker. A discarded catch binding is syntactically identical to a deliberate one, so until
`no-unused-vars` ran for the first time on 2026-07-30 there was no signal at all. Note the rule
only finds the subset that BINDS the error — a bare `catch {}` discards it just as thoroughly and
is invisible to the linter, which is exactly how the third site in this file survives.

## Fix Applied

Both flagged sites now interpolate the cause, matching the file's own existing convention:

- `Failed to parse YAML: ${getErrorMessage(error)}`
- `Cross-reference validation skipped: failed to load categories/rules: ${getErrorMessage(error)}`

`getErrorMessage` was already imported. No behaviour changed beyond message detail, and every
existing assertion on these strings is a substring match (`.includes(...)` in
`source-validator.test.ts` and `__tests__/commands/validate.test.ts`), so all remained green.

**Deliberately NOT fixed, and this leaves a real inconsistency:** `validateYamlFiles` in the same
file emits the identical `"Failed to parse YAML"` message from a bare `catch {}`. It is not a lint
error — there is no binding to be unused — so it fell outside the burndown task's mandate, and
changing it is a user-visible message change nobody asked for. The consequence is that the same
sentence now carries a cause when it comes from the metadata phase and no cause when it comes from
the stack/agent YAML phase. Closing that is a one-line change (`catch {` -> `catch (error) {`, plus
the interpolation) and should be done before this finding is marked resolved.

## Proposed Standard

1. **Add to `.ai-docs/standards/clean-code-standards.md` (error handling section):** a `catch` that
   produces a user-facing message MUST include `getErrorMessage(error)`. If a cause is genuinely
   irrelevant, use `catch {` with no binding **and a comment saying why** — a bare `catch {}` with
   no justification should read as a defect, not as a decision. State the failure mode: the linter
   can only see the bound-and-discarded variant, so the unbound variant is the one that needs a
   written rule.

2. **Treat `no-unused-vars` on a caught error as a bug report, not lint noise.** Worth a sentence
   in CLAUDE.md next to the existing "no silent catch blocks" bullet: the correct response is
   almost never `_error`, because renaming asserts "the cause does not matter", which for a
   diagnostic surface is rarely true. `_error` is for genuinely irrelevant causes only.

3. **Flag no-interpolation template literals as a review smell.** A backtick string with no `${}`
   is frequently a dropped interpolation. `quotes` / `prefer-template` do not catch it;
   `no-useless-concat` is unrelated. If a rule is wanted, `no-restricted-syntax` on
   `TemplateLiteral[expressions.length=0]` would do it, though the false-positive rate on
   multi-line strings makes it a judgement call — the review-checklist entry may be the better
   trade.
