---
type: convention-drift
severity: low
affected_files:
  - packages/ui/src/components/divider.tsx
  - packages/ui/src/components/divider.stories.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: web-developer
category: typescript
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  Landed as two plainly-named optional slots (`action`, `control`) with the arm
  each belongs to stated in the component's docblock, and with the rejected
  union and its reason recorded there so the next author does not re-attempt
  it. `packages/ui` typecheck and lint are clean and all 84 storybook tests
  pass.
---

## What Was Wrong

Phase A's spec asked `Hinge` to grow two slots that belong to different
variants — an out-of-flow `action` square on the `column` arm, and an in-flow
`control` between label and rule on the `panel` arm — and said explicitly: "do
not leave a prop that means two things."

The obvious way to enforce that in this codebase's idiom is to make the invalid
pairing unrepresentable, which is what CLAUDE.md asks for elsewhere ("Model it
as the list of directories that actually hold content … so an empty scope is
structurally unrepresentable"):

```ts
type HingeProps = Omit<ComponentProps<"div">, "children"> & {
  label: string;
  emphasis?: ReactNode;
} & (
    | { variant?: "column"; action?: ReactNode; control?: never }
    | { variant: "panel"; control?: ReactNode; action?: never }
  );
```

That compiles, and the component is correct. It breaks the **stories file**,
which nothing in the component's own gates would have told me:

```
divider.stories.tsx(23,14): TS2322: Type '{}' is not assignable to type
  'StoryAnnotations$1<ReactRenderer, never, never>'.
  Property 'args' is missing in type '{}' but required in type '{ args: never; }'.
divider.stories.tsx(27,3): TS2322: Type '{ label: string; emphasis: string; }'
  is not assignable to type 'never'.
```

Five errors, and the two at the top are on `LabelledHinge` and `PlainRule` —
stories that predate this change and pass no new prop at all. Storybook's
`Meta<typeof Hinge>` resolves the component's props to a single args type; over
a union it intersects the arms, `action?: ReactNode` meets `action?: never`,
and every story in the file collapses to `never`. The blast radius is the whole
file, not the story that uses the new prop.

The general shape: **a props union on a design-system component is not a local
decision.** Every tool that reflects over the component's props as one object —
Storybook args, autodocs, any prop-table generator — sees the intersection.

## Fix Applied

Two plainly-named optional props, each documented as belonging to one arm, with
the union and its failure recorded in the docblock so the next author does not
spend the same hour:

```ts
// The two arms take DIFFERENTLY NAMED slots rather than sharing one, because a
// prop that means two things is a trap — and each name belongs to exactly one
// arm, which is stated here because it is not enforced by the type. A
// discriminated union WOULD enforce it, and was tried: Storybook intersects
// the arms and collapses `Meta<typeof Hinge>`'s args to `never`, taking every
// story in this file's neighbour down with it.
```

The safety that was given up is small and bounded: four call sites in the
repository, two per arm, and a misused slot renders visibly wrong rather than
silently — `action` on the `panel` arm would absolutely position against a
container that is not `relative`.

## Proposed Standard

Into `.ai-docs/standards/clean-code-standards.md`, in the TypeScript section:

> **A discriminated union on a component's PROPS costs its Storybook args.**
> Making an invalid prop pairing unrepresentable is the right instinct and the
> right default for a plain data type, but a component's props are also read as
> one flat object by Storybook's `Meta<typeof C>` and by every prop-table
> generator. Those intersect the arms, so `x?: T` meets `x?: never`, the args
> type becomes `never`, and **every** story in the file stops compiling —
> including ones written before the union existed and passing none of its
> props. For a component with a stories file, prefer distinctly named optional
> slots plus a docblock naming which arm each belongs to, and record the
> rejected union so it is not re-attempted.

This does not conflict with CLAUDE.md's "structurally unrepresentable"
guidance, which is about persisted and reported DATA shapes
(`InstallationInfo.agentDirs`); it names the one place that guidance has a
mechanical cost. Note that the cost is invisible to the component's own file:
`tsc` on `divider.tsx` alone is clean, and only the workspace-wide
`bun run typecheck` reports it — so a change made without running the package
gate looks correct.
