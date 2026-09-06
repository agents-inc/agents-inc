---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/documentation-bible.md
  - src/agents/meta/codex-keeper/playbook.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-09-04
reporting_agent: agent-summoner
category: architecture
domain: shared
root_cause: convention-undocumented
status: partial
partial_note: >-
  The agent half landed — `codex-keeper`'s playbook now names the five fields and tells the agent to
  match a neighbouring document's block before writing a new one. The standards half is pending: the
  "Creating New Documentation" template in `documentation-bible.md` still shows a one-field
  frontmatter, and that file is `convention-keeper`'s to edit.
---

## What Was Wrong

Every document in `.ai-docs/reference/` opens with the same five-field frontmatter block, in the
same order — `scope`, `area`, `keywords`, `related`, `last_validated`. Nothing states that.

The two places a new reference document is written from both hand out a single field:

- `documentation-bible.md` -> "Creating New Documentation" gives a **Template:** block whose
  frontmatter is `last_validated: YYYY-MM-DD` and nothing else.
- `src/agents/meta/codex-keeper/playbook.md` -> "What a Reference Document Carries" opened
  "Every document opens with `last_validated:` frontmatter, a one-line purpose, and the entry point
  into the area".

So the convention is carried by imitation alone. An agent that follows either instruction literally
writes a document missing four of the five fields its neighbours have, and neither the completion
gate nor any script in `scripts/` reads reference frontmatter — `check-findings-frontmatter.ts`
parses `agent-findings/` only.

Two of the four missing fields do real work:

- **`related:` is where the bible's own cross-reference rule lands.** "Cross-Reference Instead of
  Duplicate" tells a document to link a neighbour rather than restate it, and this field is the form
  that link takes. It holds a maintained graph today.
- **`keywords:` is the retrieval index**, listing the symbols and terms the document cites — the
  keyword lists in `reference/config/config-writer.md` and `reference/features/seed-contract.md`
  read as the function and type names each document is about.

Both counts below are a **census**, not a sample. Run from `packages/cli/.ai-docs`:

```
for field in scope area keywords related last_validated; do
  n=$(for f in $(find reference -name '*.md'); do
        awk 'NR==1&&$0=="---"{i=1;next} i&&$0=="---"{exit} i' "$f" | grep -qE "^${field}:" && echo x
      done | wc -l)
  echo "$field: $n / $(find reference -name '*.md' | wc -l)"
done
```

Every field returned the full population on 2026-09-04. And every `related:` entry resolves to a
file — the same loop testing `[ -f "$p" ]` on each entry reported 266 checked, 0 dangling. That
second figure is the reason the field is worth a rule rather than a note: it is a link graph nobody
has been told to maintain and everybody has.

`area:` is the one field a rule should hedge on. It usually names the subdirectory the document sits
in, and four documents under `reference/features/` carry `build`, `config` and `wizard` instead, so
it is the topic group rather than the path.

## Fix Applied

The agent half only. `src/agents/meta/codex-keeper/playbook.md` -> "What a Reference Document
Carries" now opens by telling the agent to read the document nearest its area before writing a new
one and give its own the same frontmatter block, with a table naming the five fields and what each
carries as the default where a tree holds no document yet. Its workflow step 4 no longer restates
`last_validated:` as though it were the whole block.

The standards half is not mine to apply: `.ai-docs/standards/` is `convention-keeper`'s, and
`codex-keeper`'s own domain scope says so.

## Proposed Standard

**In `documentation-bible.md` -> "Creating New Documentation", replace the template's frontmatter
with the five fields the tree actually carries**, and state what `keywords:` and `related:` are for
where the template cannot — a field list teaches shape, not purpose:

```markdown
---
scope: reference
area: [the topic group — usually the subdirectory under reference/]
keywords: [the symbols and terms this document cites]
related:
  - reference/[sibling.md]
last_validated: YYYY-MM-DD
---
```

**And add `related:` to the "Cross-Reference Instead of Duplicate" section as the mechanism that
rule already assumes.** That section says to link rather than restate and does not say where the
link goes; the answer is a `related:` entry plus an in-body path, and every entry resolving is the
invariant worth writing down.

This is the class `2026-08-19-a-doctrine-rewrite-reached-the-definition-and-not-the-template-people-paste.md`
named, arriving from the other end. That finding's rule is that a changed rule sweeps every
copy-paste site in the document. The mirror is that a convention **established in practice** and
never written reaches no site at all: 50 documents agree, the template disagrees with all of them,
and nothing between the two can report it. The template is the higher-duty-cycle surface either way.

Cross-checked against `CLAUDE.md`'s NEVER/ALWAYS rules and against the bible's "Format Rules",
"Staleness" and "Content Rules for Specific Document Kinds": no conflict. The staleness rule owns
`last_validated:` and is untouched by adding four fields beside it.
