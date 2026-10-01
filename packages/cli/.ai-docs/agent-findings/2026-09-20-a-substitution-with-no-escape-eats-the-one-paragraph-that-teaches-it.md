---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/agents/meta/agent-summoner/playbook.md
  - packages/cli/src/agents/meta/agent-summoner/output.md
  - packages/cli/.ai-docs/reference/features/agent-system.md
  - packages/cli/src/cli/lib/__tests__/partials-are-prose-and-one-token-is-not.test.ts
  - packages/compile/src/agent-source.ts
  - packages/cli/.ai-docs/reference/features/compilation-pipeline.md
  - packages/compile/src/agent-source.test.ts
  - packages/compile/src/generated/corpus.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/reference/features/compilation-pipeline.md
date: 2026-09-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  `SOURCE_FOLDER_ESCAPE` in `packages/compile/src/agent-source.ts` — a backslash in front of the
  token compiles to the token — plus the summoner paragraph rewritten to use it, and two specs that
  hold both halves. The compiled `agent-summoner` now reads "The one exception is
  `@@SOURCE_FOLDER@@`, which the compile step replaces with ...". CLI 7722 unit and 966 e2e green;
  compile package 78 green.
---

## What Was Wrong

A compile step that substitutes one token in otherwise-verbatim prose has a second requirement
nobody writes down: **the prose that teaches the token has to be writable.** Without an escape it is
not, and the first casualty is always the one document whose job is to teach it.

`@@SOURCE_FOLDER@@` was introduced so `agent-summoner`'s playbook could name the folder THIS install
writes rather than a literal that is wrong on half of all installs. The paragraph introducing it
spelled the token out — so the substitution rewrote the lesson, and every compiled
`agent-summoner.md` read:

```
The one exception is `.agents-inc/claude`, which the compile step replaces with the
source folder the install being compiled for actually uses — write it wherever an
instruction has to name that folder, and nowhere else.
```

The token is named nowhere in that sentence. The one agent whose job is authoring partials was
being told to hard-code the folder literal, which is exactly what the token exists to prevent, in
the voice of the rule forbidding it.

**The pinning spec had made the correct sentence unwritable.** `partials-are-prose-and-one-token-is-
not.test.ts` asserted `expect(compiled).not.toContain("@@SOURCE_FOLDER@@")` over the compiled
summoner. That negative claimed "no occurrence survives anywhere" as a proxy for "every occurrence
meant to become a folder did" — and once a partial may deliberately NAME the token, the only two
ways to satisfy it are the two defects it was written against: spell the folder literally, or delete
the lesson. A guard that goes red when the defect is fixed is worse than no guard: it reads as the
regression the change caused.

## Fix Applied

- **An escape**: `\@@SOURCE_FOLDER@@` compiles to the token itself. `substituteSourceFolder` splits
  on the escape, substitutes inside the pieces and rejoins with the literal token, so the escape
  composes the way every author expects — `\\@@SOURCE_FOLDER@@` compiles to the escape, which is how
  a partial teaches the escape. A backslash rather than a second token spelling, because an author
  reaching for an escape reaches for that one.
- **The refusal narrowed to what it is about.** A partial that ASKS for the folder under an engine
  naming none still throws `NO_SOURCE_FOLDER`; one that only NAMES the token asks for no folder and
  compiles.
- **The summoner paragraph rewritten to use it**, and to teach both forms by demonstrating them.
- **Two specs.** The compiled summoner must CONTAIN the teaching sentence, and no PATH in it may be
  rooted at the raw token — which is the shape every instruction occurrence has
  (`grep -rn '@@SOURCE_FOLDER@@' packages/cli/src/agents | grep -v '@@SOURCE_FOLDER@@/'`). The
  controlled fixture keeps the blanket negative, because its partials opt in and never escape.
  `packages/compile/src/agent-source.test.ts` gained the refusal and its permitted twin —
  `NO_SOURCE_FOLDER` had no test at all — both mutation-proved.

## Proposed Standard

**A substitution over author-written prose ships with an escape, and a spec that the escape is
reachable from the document that teaches it.** The general shape, which is not specific to this
token: any mechanism that rewrites text an author typed makes one sentence unwritable — the sentence
about the mechanism — and the place that sentence belongs is the authoring guide, so the defect
lands on the one reader who most needs it right.

The runnable half is the pair now in
`src/cli/lib/__tests__/partials-are-prose-and-one-token-is-not.test.ts`: assert the compiled
artefact NAMES the token, alongside asserting that no unsubstituted token survives where it should
not. A blanket "the token appears nowhere" is the form to avoid, and its tell is that fixing the
defect turns it red.

Documented in `.ai-docs/reference/features/agent-system.md` -> "The One Token in a Partial", which
is where the token was documented for the first time — it had been described in source docblocks
and in the compiled prompt, and on no `.ai-docs` page.
