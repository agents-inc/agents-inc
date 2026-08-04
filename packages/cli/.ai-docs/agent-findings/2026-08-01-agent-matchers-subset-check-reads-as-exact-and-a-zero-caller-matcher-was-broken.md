---
type: anti-pattern
severity: high
affected_files:
  - e2e/matchers/agent-matchers.ts
  - e2e/commands/init-from-scenarios-curation.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-08-01
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >
  Code side landed: `toHaveAgentDynamicSkills`'s body extraction is fixed (it read 1.2KB of a 39KB
  file, which made every `skillIds` expectation unsatisfiable and every `noSkillIds` one vacuous),
  and `exactSkills` now exists beside `skills` on `toHaveAgentFrontmatter` for callers that mean
  exactness. Pending: (a) `skills` is still a subset check with a name that reads as an equality
  check — the field is documented in its own type but nothing stops the next caller reading it as
  exact; (b) no rule anywhere says a matcher must have a caller before it is committed, which is
  the mechanism that let a broken matcher sit in the repo; (c) the docs still describe the old
  surface — `reference/testing/e2e-infrastructure.md`'s matcher signature list (already
  NEEDS-VALIDATION) omits `exactSkills`, `effort` and `noEffort`, and `standards/e2e/assertions.md`
  still carries a `toHaveAgentDynamicSkills` example whose `skillIds` line could not have passed
  before the extraction fix.
---

## What Was Wrong

Two defects in `e2e/matchers/agent-matchers.ts`, found while making the Phase 5 `--from` curation
scenarios green. They are filed together because they share one cause: **a matcher nobody calls is
an assertion nobody has ever run.**

### 1. `toHaveAgentDynamicSkills` was broken, and had zero callers to notice

The matcher took the compiled agent's body with:

```ts
const body = content.split(/^---\n[\s\S]*?\n---\n/m)[1] ?? content;
```

`String.prototype.split` cuts on **every** match, not the first. A compiled agent's body is full of
`---` horizontal rules — the shared template emits one between almost every section — so element
`[1]` is not "the body after the frontmatter", it is the slice between the frontmatter and the
_next_ rule pair. Measured on a real compiled `web-developer.md` from this suite: **1,193 characters
out of 39,020**, i.e. the matcher inspected 3% of the file, and the file splits into 16 pieces.

What that does to the two expectation kinds is asymmetric and both directions are bad:

- `skillIds` (must be present) is **unsatisfiable**. The dynamic-skill list is rendered under
  `<skill_activation_protocol>`, which lands in piece 7-8. No product behaviour could have made it
  appear in piece 1.
- `noSkillIds` (must be absent) is **vacuous**. It passes on absence from a slice that nothing is
  rendered into. Verified by running the CLI against the pre-fix implementation and reading the
  artifact: the bare `api-developer.md` **did** name `web-framework-react` (in the section the
  matcher never reached), so the assertion that this must not happen passed while the defect was
  live.
- `hasActivationProtocol`, the guard that exists so a negative cannot pass by the whole section
  being absent, was itself defeated the same way — `<skill_activation_protocol>` is in piece 7.

The matcher had **zero callers** anywhere in `e2e/` before the curation scenario suite was written.
It was shipped, type-checked, exported through `e2e/matchers/setup.ts`, and documented in four
places — `standards/e2e/assertions.md` (with a worked example), `standards/e2e/anti-patterns.md`
(which actively tells authors to reach for it over `toHaveAgentFrontmatter` for non-preloaded
skills), `standards/e2e/test-data.md` and `reference/testing/e2e-infrastructure.md`. It was never
executed. Its first real call site is where it failed — and the worked example in `assertions.md`,

```typescript
await expect(project).toHaveAgentDynamicSkills("web-developer", {
  skillIds: ["web-testing-vitest"],
  noSkillIds: ["api-framework-hono"],
});
```

is itself a snippet whose first line could not have passed on any compiled agent.

This is `findings-impact-report.md`'s **Pattern V** (the artefact that looks like verification and
cannot fail) in its purest form: not a spec that asserts too little, but an assertion helper whose
own subject was wrong, with no caller to reveal it.

### 2. `toHaveAgentFrontmatter`'s `skills` reads as exact and is a subset check

`skills` passes when every listed id is present, and says nothing about the rest. It is therefore
satisfied by an agent that preloads **everything it holds** — which is the exact failure mode the
`--from` preload-fidelity scenarios exist to catch, and the shape the pre-fix implementation
produced. A spec author writing `toHaveAgentFrontmatter(agent, { skills: [react] })` and reading it
back as "this agent preloads react and nothing else" gets a green test either way.

The type's own JSDoc is now explicit ("Extra entries pass — use `exactSkills` to forbid them"), but
the field name is what a call site shows, and `skills: [x]` beside a `noSkills: true` sibling reads
as a complete statement of the frontmatter's skill list.

## Fix Applied

**Body extraction corrected** (`toHaveAgentDynamicSkills`), one line, replacing the split with a
first-match strip of the leading frontmatter block:

```ts
const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
```

`replace` with a non-global regex touches the first match only, and `^` without the `m` flag anchors
at string start, so exactly the frontmatter is removed and the whole 39KB body is inspected. The
no-frontmatter case is unchanged (no match → content returned as-is), which is what the old
`?? content` fallback meant.

Evidence the fix converts vacuous assertions into load-bearing ones, both collected by running the
built CLI rather than by reading code:

| Probe                                                             | Old extraction | Fixed extraction |
| ----------------------------------------------------------------- | -------------- | ---------------- |
| `web-developer.md` body length                                    | 1,193          | 39,020           |
| body names its one lazily-assigned skill                          | `false`        | `true`           |
| bare `api-developer.md` names another agent's skill (pre-fix CLI) | `false`        | `true`           |

The third row is the one that matters: under the old extraction, the assertion "a bare sub-agent's
compiled file must not name another sub-agent's skill" passed **while that was exactly what the CLI
was doing**.

**`exactSkills` was NOT added by this task** — it arrived with the curation scenario suite, authored
by cli-tester, and is recorded here because it is half of the standard being proposed. It states the
whole preload list in order; the `--from` curation scenarios use it in 4 places. `skills` was left
alone: `toHaveAgentFrontmatter` has 49 call sites across `e2e/`, 16 of which pass `skills:`, and
those legitimately mean "contains".

The body-extraction fix is covered by its callers — `e2e/commands/init-from-scenarios-curation.e2e.test.ts`,
5 tests, green with the corrected extraction and demonstrated red (on the config assertions that run
first) against the unfixed CLI.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` § "Weak Assertions":

> **A custom matcher lands with its first caller, in the same change.** A matcher with no call site
> has never been executed: it type-checks, it exports, and its logic is unverified. Two of the three
> expectations on the first uncalled matcher this rule was written for were structurally incapable
> of failing. If you cannot write a caller, the matcher is not ready.

> **Name subset checks so the call site admits it.** A field called `skills` that only requires
> containment reads as the whole list at every call site, and passes on an agent that preloads
> everything. Either name it for what it does (`containsSkills`) or provide the exact form beside it
> and say in the type's doc which is which. `toHaveAgentFrontmatter` now carries both `skills`
> (subset) and `exactSkills` (whole list, in order).

Add to `.ai-docs/standards/e2e/assertions.md`, where compiled-agent assertions are described:

> **Splitting on a delimiter that recurs in the payload is a truncation bug.** Compiled agent
> markdown contains `---` section rules throughout, so `content.split(/^---\n[\s\S]*?\n---\n/m)[1]`
> yields the first section, not the body. Strip the frontmatter with a single non-global
> `replace()`; never index into a `split()` whose separator can appear more than once.
