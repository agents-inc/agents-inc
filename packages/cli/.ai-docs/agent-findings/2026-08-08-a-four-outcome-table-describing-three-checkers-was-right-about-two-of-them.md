---
type: standard-gap
severity: low
affected_files:
  - packages/cli/scripts/check-shared-tsconfig.ts
  - packages/cli/.ai-docs/reference/monorepo-layout.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-436(b). The three per-axis subsections in monorepo-layout.md now state their OWN exit
  behaviour rather than a shared one: the tsconfig subsection says deleting the config is a
  failure and not an exit, and the Vitest and ESLint subsections say it is an exit and name the
  membership pins that guard it. The generalisation itself is recorded here rather than corrected
  in the finding that made it, because that finding's fix was right and only its framing was wide.
---

## What Was Wrong

`2026-08-08-a-workspace-leaves-a-shared-config-check-by-deleting-its-config-and-only-a-name-pin-notices.md`
opens with a table it presents as common to all three cross-workspace checks:

> All three cross-workspace checks sort a workspace into one of four outcomes, and only one of them
> is a failure: `bound` / `opted-out` / `no-suite`|`no-config` / `diverged`.

**Two of the three do. The tsconfig check has no such outcome.** Its `WorkspaceVerdict` union is
three-armed, and `judgeWorkspace` treats a missing config as a defect rather than an exemption:

```ts
if (!existsSync(configPath)) {
  return { workspace, outcome: "diverged", problems: [MISSING_TSCONFIG, ...undeclared] };
}
```

So the hole the finding identified — a workspace leaves the rule by deleting its config — is real
for Vitest and ESLint and **impossible** for tsconfig, where deletion is the loudest failure the
check has. The finding's actual fix (name pins in the two suites that need them) was correct and
complete; only the sentence framing it reached one checker too far.

The reason this matters more than a wording slip: the finding's Proposed Standard asked
`monorepo-layout.md` to "keep saying that `no-suite` / `no-config` is an exit as well as an
exemption" across **the three subsections**. Written from the table, that instruction would have
put a false sentence into the tsconfig subsection — a document asserting an escape route that its
own checker forecloses, which is worse than the silence it replaced.

This is the same class as the sweep finding filed the same day
(`2026-08-08-the-masking-helpers-were-not-the-only-thing-that-left-local-installer.md`): a property
was read off one instance and asserted of the set. There the set was documents naming a module;
here it is checkers sharing a shape. Three sibling scripts written from one template, with one
deliberate difference in the middle of them, is precisely the shape that invites it.

## Fix Applied

The three subsections were written per axis rather than once, from each checker's own verdict
union: the tsconfig subsection states that deletion is `diverged` and that this axis is the one
where the absence of a config is itself the failure; the Vitest and ESLint subsections state the
exit and name the suites' membership lists as what guards it.

## Proposed Standard

**A claim made about "all N" of anything must be checked against N, not against the instance in
front of you — and the check is cheap when N is a union type.** Each of these three scripts declares
its outcomes as a discriminated union at the top of the file; reading all three takes less time than
writing the sentence that generalised over them. For `documentation-bible.md`, beside the
symbol-in-file rule:

> Where a document generalises across a set of modules, tests or scripts, the generalisation is
> verified against every member. A sentence beginning "all three" or "every one of these" is a claim
> with a cardinality in it, and a cardinality is checkable — so an unchecked one is a count in
> disguise, subject to the same rule as any other.
