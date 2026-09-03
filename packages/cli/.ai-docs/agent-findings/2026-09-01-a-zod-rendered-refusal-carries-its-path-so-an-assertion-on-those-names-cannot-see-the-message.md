---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/e2e/commands/share-stdin.e2e.test.ts
  - packages/cli/src/cli/lib/schemas.test.ts
  - packages/cli/src/cli/lib/schema-validator.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-09-01
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The one live instance in `share-stdin.e2e.test.ts` now asserts the Zod path AND a sentence
  fragment the path cannot supply, and was mutation-checked red by rendering issues as
  `path + "Invalid input"`. The three sibling assertions in `schemas.test.ts` were censused and
  left alone with reasons — see "Census" below. The proposed standard is not yet written into
  `assertions.md`; that edit is outside the lane that found this.
---

## What Was Wrong

`formatZodIssue` in `src/cli/lib/schema-validator.ts` renders every issue as
`${issue.path.join(".")}: ${issue.message}`. **The path is therefore part of every rendered
refusal, and it is supplied by the schema's own structure rather than by anything an author
wrote.** An assertion naming a field, a key or an id that appears in that path is satisfied
whether or not the message exists.

The live instance was in `share-stdin.e2e.test.ts`, pinning the refusal for a project-scoped skill
assigned to a sub-agent resting at global:

```ts
// The message has to name the pair, or the producer cannot tell which of its own
// assignments to change — which is the whole difference from a bare HTTP 400.
expect(output).toContain("web-developer");
```

The comment states the claim exactly: the message must name the pair. The assertion cannot check
it. `installableSeedPayloadSchema`'s refinement raises its issue at
`path: ["skills", skillId, "assignments", agent]`, so `web-developer` is in the path already — and
the skill id is too, which means asserting _both_ halves would still not have reached the message.

**Reproduction.** Re-render the same refusal with the message blanked and nothing else changed:

```
skills.e2e-test-fixture-web-framework-react.assignments.web-developer: Invalid input
```

`toContain("web-developer")` is `true`. Measured a second way, end to end: replacing
`formatZodErrors(result.error)` in `read-piped-payload.ts` with
`result.error.issues.map((i) => \`${i.path.join(".")}: Invalid input\`)` and rebuilding leaves the
old assertion green — the whole user-facing explanation deleted, six of six specs passing.

This is the same shape as `assertions.md` § "A Sentinel Must Name the Substantive Claim", which
says a sentinel goes in the clause a reader would dispute rather than in the lead-in that
introduces it. What that section does not cover is that **a Zod path is a lead-in the schema
generates for free**, at the front of every issue, containing exactly the identifiers an author
reaches for when trying to prove a message is specific. The rule was right and one step too
narrow, so an author following it faithfully still lands here.

## Fix Applied

`share-stdin.e2e.test.ts` now asserts both halves through the path, and then the sentence:

```ts
const said = flattenCliOutput(output);
expect(said).toContain(`skills.${E2E_SKILL.react.id}.assignments.${WEB_DEV}`);
expect(said).toContain(`nowhere to be written on '${WEB_DEV}', which rests at global scope`);
```

`flattenCliOutput` is required rather than incidental: oclif hard-wraps at the terminal width, so
any fragment longer than a word straddles a line break in captured output. The helper already
exists in `src/cli/lib/__tests__/helpers/` and reaches e2e specs through `e2e/helpers/test-utils.ts`.

Mutation-checked: with issues rendered as path-only, the new assertion is red on
`nowhere to be written on 'web-developer', which rests at global scope` while the path assertion
above it stays green — which is the finding restated as a test result.

## Census

Two test files in the package assert on a Zod-rendered refusal:

```
grep -rln "formatZodErrors\|formatZodIssue" packages/cli/src packages/cli/e2e \
  --include='*.test.ts' --include='*.test.tsx'
```

`share-stdin.e2e.test.ts` (fixed above) and `schemas.test.ts`. In the second, three assertions name
only a path segment:

```
packages/cli/src/cli/lib/schemas.test.ts:673:    expect(warnings[0]).toContain("cliDescription");
packages/cli/src/cli/lib/schemas.test.ts:688:    expect(errors[0]).toContain("cliDescription");
packages/cli/src/cli/lib/schemas.test.ts:704:    expect(errors[0]).toContain("author");
```

**Left as they are, deliberately.** Their subject is which BUCKET an issue is routed to — error
versus warning — not the wording, and each sits beside a `toStrictEqual([])` or `toHaveLength(1)`
on the other bucket that carries the real claim. Line 673 also has `toContain("75 characters")`
beside it, which the path cannot supply. They are named here so that a later reader can tell a
considered exemption from an unexamined one; the count is a census of the two files above, not a
sample.

## Proposed Standard

Add to `.ai-docs/standards/e2e/assertions.md`, as a paragraph under § "A Sentinel Must Name the
Substantive Claim" rather than as a new section — it is that rule applied to one generated prefix:

> **A Zod-rendered refusal carries its own path, so the identifiers in it prove nothing about the
> message.** `formatZodIssue` renders `${issue.path.join(".")}: ${issue.message}`, and a custom
> refinement chooses that path — `["skills", skillId, "assignments", agent]` names both halves of
> a pair before the sentence starts. An assertion naming a field, a key, a skill id or a sub-agent
> is therefore satisfied by the schema's structure alone and holds against a blanked message. Where
> a spec's claim is that the refusal EXPLAINS something, pin a fragment of the sentence that the
> path cannot supply, and use `flattenCliOutput` so oclif's wrapping does not force that fragment
> back down to a single word.

Cross-checked against CLAUDE.md § Test Assertions: this does not conflict with the rule at line 81
("never bind a RENDERING assertion to the constant the product renders"). The sentence fragment
stays a literal in the spec — importing it from `packages/matrix/src/seed.ts` would move both sides
together and reintroduce the vacuum — while the skill id and sub-agent name stay bound to
`E2E_SKILL` / `E2E_AGENT`, because those name symbols whose deletion should break the test.
