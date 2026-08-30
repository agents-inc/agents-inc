---
type: convention-drift
severity: medium
affected_files:
  - packages/ui/src/styles/globals.css
  - apps/editor/src/features/configure/components/roster-panel.tsx
standards_docs:
  - .claude-design/README.md
date: 2026-08-26
reporting_agent: pm-architect
category: architecture
domain: web
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`packages/ui/src/styles/globals.css` declares two ink tokens whose names invert the design's own
vocabulary, and the mismatch has been invisible so far only because the one token that is wrong has
had a single consumer.

The design's palette table in `.claude-design/README.md` § "Visual language" names them:

| Design token | Value     | Design says it is for                               |
| ------------ | --------- | --------------------------------------------------- |
| `ink`        | `#161513` | Primary text                                        |
| `dark`       | `#242320` | Stuck filter bar, add-skill, Install, composer send |

`globals.css` binds the names the other way round:

```
--color-ink: #242320;        /* names, active nav, emphasis */
--color-roster-ink: #161513; /* an enabled agent's name */
```

So `--color-ink` is the design's `dark`, and the design's `ink` — its **primary text colour** — is
reachable only under a name that claims it belongs to one panel.

**Why it has not hurt yet, and why it is about to.** A census of `#161513` in the design's shipped
prototype finds **10 distinct selectors** (11 occurrences, one of which is the declaration of a
selector already counted):

```sh
grep -o '^\.[a-z0-9.: -]*{[^}]*#161513[^}]*}' \
  ".claude-design/design/Configurator v5.dc.html" | sed 's/{.*//' | sort -u
```

→ `.agef:hover`, `.agmd:hover`, `.agsc:hover`, `.agsm:hover`, `.fln`, `.grpi:hover`,
`.otr.dir .otn`, `.otr.root .otn`, `.plink:hover .pt`, `.dsg.on`

Six of those ten are inside the roster panel, which is why the token's name has held. **Three are
not, and all three are being built now** under EDITOR-09's phase programme
(`todo/plans/editor-v6/`):

- `.otr.dir .otn` and `.otr.root .otn` — the output preview **dialog**'s tree (Phase B / EDITOR-52)
- `.dsg.on` — the docked **composer**'s active mode chip, in the main column (Phase C / EDITOR-53)

The editor's own consumption is still narrow, which is the window this finding is filed in:

```sh
grep -rn "roster-ink" apps/editor/src apps/www/src packages/ui/src
```

→ four sites, all in `apps/editor/src/features/configure/components/roster-panel.tsx`.

Phase C's spec (`todo/plans/editor-v6/phase-c-spec.md`) rules that the composer uses
`--color-roster-ink` and carries a one-line comment saying it is the design's `ink` rather than a
roster-specific value. That is the smallest correct thing a single phase can do, and it is also the
moment the drift stops being containable: a token named for a panel, referenced from the main column
and from a modal dialog, is a name that actively misinforms whoever reads the call site next.

The adjacent risk, which is why the obvious fix is not free: `packages/ui/src/styles/globals.css` is
imported by `apps/www/src/styles/site.css`, whose docblock states that no colour is repeated there.
Any rename reaches the Astro site, and `todo/www.md`'s "Constraints already settled" is named by
EDITOR-09 as the list a redesign must not silently break.

**Nothing would catch this.** The name is a CSS custom property, so a wrong-but-existing token
type-checks, lints, builds and renders. There is no drift check binding `globals.css` to the design's
palette table — the file's own header claims one ("Source of truth: .claude-design/README.md § Design
tokens") and that section does not exist under that heading, which is a second, already-filed
symptom of the same absent binding.

## Fix Applied

None — discovery only. Renaming a token that `apps/www` also consumes is outside the scope of the
phase that surfaced it, and doing it inside one phase would put a cross-workspace rename in a diff
about a composer.

Phase C's spec records the decision it did take (use the token, comment the mismatch at the call
site) and carries this question in its "For the owner" list.

## Proposed Standard

Two parts, one of which is a rename and one of which is the rule that would have caught it.

**1. Rename, as its own change.** `--color-roster-ink` → `--color-ink-primary` (or `--color-text`),
leaving `--color-ink` as-is since it is the design's `dark` and has many consumers. Five call sites
today across two workspaces — four in `roster-panel.tsx` and the declaration — so the change is
mechanical; the reason it needs its own commit is that it crosses into `apps/www` and must be
verified there. Do it **before** Phase B and Phase C land their references, or it becomes a
seven-site change spanning three surfaces.

Worth stating plainly in the same change: `--color-ink` is the design's `dark`, not its `ink`. That
sentence belongs in the comment above the Ink block in `globals.css`, because it is the fact a
reader needs and the one the current names deny.

**2. A rule about namespacing a token by surface.** Proposed for
`packages/cli/.ai-docs/standards/` — or, if a design-system standards doc is created for
`packages/ui`, there instead:

> **Namespace a design token by surface only when the value is genuinely specific to that surface.**
> A token prefixed `roster-`, `band-` or `dialog-` is a claim that no other surface may use it, and
> that claim is unenforceable — nothing stops a second consumer and nothing reports one. Before
> prefixing, check the design source for how many distinct selectors carry the value: a value used
> once belongs to its surface, and a value the design uses across panels, dialogs and the main
> column is a ramp entry that happens to have been noticed in a panel first. The census is one
> command against the prototype and it is cheaper than the rename.

The `band-*` tokens are the counter-example that shows the rule is not a blanket ban and are
correctly namespaced: `globals.css` says so in as many words — _"The page's one dark surface, so it
is the one place the palette inverts"_ — and every one of them exists precisely because the shared
ramp reads as mud on `#242320`. That is a value specific to a surface. `#161513` is the design's
primary text colour, which is the opposite case.

**Cross-checked** against `packages/cli/CLAUDE.md`'s NEVER/ALWAYS rules: nothing there governs CSS
token naming, and the nearest neighbour — "No magic numbers or hardcoded strings — use
`STANDARD_FILES.*` …" — is about reaching for a named constant rather than about how the constant
is named. No conflict. It also does not conflict with the editor's own stated convention ("Never a
raw hex in a component"), which this proposal strengthens rather than contradicts: the whole point
of using the token is that its name should tell you what it is.
