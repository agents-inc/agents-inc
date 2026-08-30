# Phase C — the docked natural-language composer, UI only

**Tracker row:** EDITOR-53 in [`../../editor.md`](../../editor.md). Programme:
[`README.md`](./README.md). The AI backend this composer will eventually talk to is Phase D
(EDITOR-54), specified in [`decisions.md`](./decisions.md) §3 and **parked on the owner** — read §3
before building, because it tells you the shape the UI has to be ready to receive, and nothing in
this document may foreclose it.

---

## Goal

A natural-language composer docked to the foot of the main column: **one field, one button, no
modes, and no model behind it.** Every submit returns a **proposal** — a reviewable block that
changes nothing until it is applied.

**User story:** As someone configuring a stack, I want to describe what I want in a sentence
instead of hunting the grid — and I want to see exactly what that sentence would do to my stack
before any of it happens.

---

## THE COMPOSER HAS NO MODES

**This is the third shape and it is a simplification, not an addition.** Read this section before
anything else in this document, and before opening `.claude-design/`.

The mode count went three → two → **none**, all on 2026-08-26. The owner's reason is that `build`
and `adjust` _"essentially do the same thing"_, and the Phase D spec had already hit the same wall
from the other end: the output schema **as it then stood** — `{ skillIds, agentPins?, prose }` — had
**no field** for the properties `adjust` was supposed to edit. **A distinction neither the UI nor the
schema could carry was not a distinction.**

**That schema is superseded and this paragraph is history, not a constraint.** Owner ruling 2b, the
same day, made the emitted shape `skillEntrySchema` itself, so `load` is on every assignment entry
and `install` and `scope` are on the entry. **The mode removal stands** — it was a product decision
about one field and one button, and it does not depend on the schema argument that happened to agree
with it. See [§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting).

What that means concretely:

- **No segmented track, no mode state, no auto-selection, no per-mode copy.** One placeholder, one
  send label, one hint.
- **Intent comes from the prompt text.** The model reads what the user wrote. Nothing else tells it
  anything.
- **Suggestion chips prefill the field** with openers the user finishes. They are a **writing aid,
  not a mode**: nothing downstream may branch on which chip was used, and typing the same sentence
  by hand must reach exactly the same place. See
  [The suggestion chips](#4-the-suggestion-chips--the-only-new-surface-in-this-phase). **If you find
  yourself storing which chip was clicked, you have rebuilt modes.**
- **A proposal is ALWAYS shown before anything is applied.** Never a silent mutation.

### THE DESIGN FILE DRAWS THREE MODES. THEY WERE DELIBERATELY REMOVED

`.claude-design/design/Configurator v5.dc.html`'s `DOCK` constant has three keys — `build`,
`adjust`, `ask` — each with its own placeholder, send verb and hint, and
`.claude-design/screens/11-dock-ask.png` is a screenshot of one of them. The assembled screen draws
the `.dseg` / `.dsg` mode track between the hint and the send button. **All of it is dead.**

An implementer reading the design source and not this section will put the modes back, because the
design gives every appearance of being complete. It is not — the rulings post-date it, and **this
redirection has now happened three times.** The greps that catch a restoration are
[T12](#technical).

```sh
grep -n 'const DOCK' -A 5 ".claude-design/design/Configurator v5.dc.html"   # what NOT to build
grep -nE '^\.(dseg|dsg)' ".claude-design/design/Configurator v5.dc.html"    # the track, also dead
```

Nothing else in the design's dock is superseded: `.dock`, `.dcmp`, `.dta`, `.dctl`, `.dhint`,
`.dsend` and `.kb` are all built exactly as drawn.

---

## The owner rulings this document was rewritten around

**Six rulings were made on 2026-08-26, after the first draft of this spec, and rulings 1 and 2 were
then rewritten the same day.** [`README.md`](./README.md) § "Owner rulings, 2026-08-26 (second
round)" is the authority; this section says what each one did to this document, because a reader who
skips it will rebuild what was cut.

| #   | Ruling                                                                            | What it did here                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **THERE ARE NO MODES. One field, one button.**                                    | The mode table, the mode track, the mode state and the mode-auto-selection rule are all **deleted**. See [THE COMPOSER HAS NO MODES](#the-composer-has-no-modes). This ruling replaced an earlier "two modes, `ask` is cut" |
| 2   | **Intent comes from the prompt text, and suggestion chips prefill it**            | New: [The suggestion chips](#4-the-suggestion-chips--the-only-new-surface-in-this-phase). This ruling replaced an earlier "`adjust` is auto-selected", which is gone with the modes                                         |
| 3   | **A proposal is ALWAYS shown before anything is applied**                         | The biggest open item in the design is settled. The proposal is **required work**, not a fenced-off exploration                                                                                                             |
| 4   | **"Recommended" is dead** — a prohibition, not a removal                          | See [The `recommended` chip is prohibited](#the-recommended-chip-is-prohibited). It has no code subject; do not build it from the design                                                                                    |
| 5   | **The marketplace button floats**, keeping its sticky-inside-the-column mechanism | [The slot conflict](#the-slot-conflict)'s arrangement is confirmed as the mechanism. Where the control belongs is still an owner question                                                                                   |
| 6   | **`MenuTrigger` carries the focus ring**                                          | **Already landed** — `menu.tsx` carries `outline-none focus-visible:ring-1 focus-visible:ring-ring`. Nothing owed here                                                                                                      |

**Where the design source and this document disagree, this document wins.** That was already the
rule; the mode removal is now the largest instance of it.

---

## Context

### Why this matters

**Business problem.** Item 7 of the owner brief. The grid is 238 skills across 102 categories; a
newcomer who knows what they are building does not know what any of them are called. The composer
is the front door for that person. The owner ruled it can ship as UI only for now.

**User impact.** In Phase C, no configuration changes — nothing is generated and nothing is
written. What ships is the surface, its keyboard contract, its accessibility contract, the
suggestion chips, **and the proposal itself in its zero-change state**. That is the point: Phase D is parked on
three things only the owner can supply (an Anthropic key, a Cloudflare AI Gateway, Turnstile keys),
and the UI must not be blocked behind them.

**Ruling 3 moved the proposal into this phase.** The first draft fenced it off as "the biggest open
item in the whole design" and shipped a one-line status message in its place. That is no longer
available: a proposal is always shown, so the proposal surface is Phase C's to build. What Phase C
cannot build is the thing that fills it, and a proposal with nothing in it is a real state that has
to exist regardless — see
[The zero-change proposal](#12-the-zero-change-proposal-and-what-phase-c-actually-renders).

**Priority.** Medium. It is the last of the seven owner items and the only one with a parked
dependency.

### Current state

- **There is no composer and no code that mentions one.**
  `grep -rni "composer\|dockMode" apps/editor/src` returns nothing. With the modes gone this phase
  adds no store field either, so it stays a whole-app grep rather than a diff check.
- `ConfigureScreen` (`apps/editor/src/features/configure/components/configure-screen.tsx`) renders
  the main column: an optional alert line, `Hinge` / `StackGrid`, `Hinge` / `FilterBar`, the
  `DomainSection` list, and last `MarketplaceButton`.
- `MarketplaceButton` (`apps/editor/src/features/configure/components/marketplace-dialog.tsx`) is
  `sticky bottom-5 z-40 w-fit` — **it already owns the slot this composer needs.** See
  [The slot conflict](#the-slot-conflict), which is real work rather than a detail.
- `useUiStore` (`apps/editor/src/stores/ui-store.ts`) holds ephemeral UI state and persists exactly
  three fields. **This phase does not touch it** — see [State](#state).

### Desired state

The main column ends in a docked composer that reads as a row of the grid rather than a card over
it. One field takes a sentence; two suggestion chips above it offer openers to finish; one black
button sends it. The button is reachable by keyboard and by pointer, states what it does, and
answers with a **proposal** — which, until Phase D, is honestly empty and says so.

---

## Pattern files to reference

**Read these before implementing, in this order.**

| #   | File                                                                   | What it shows                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `apps/editor/src/features/configure/components/filter-bar.tsx`         | The full-bleed sticky band in this codebase: `sticky top-0 z-60 -mx-gutter` with `px-gutter` re-inset. The composer is the same idiom upside down. Also: why the gutter is never a literal |
| 2   | `apps/editor/src/features/configure/components/marketplace-dialog.tsx` | `MarketplaceButton` and its docblock — the EDITOR-35 reasoning that constrains where anything floats in this column                                                                        |
| 3   | `apps/editor/e2e/specs/marketplace.spec.ts`                            | The `railGap` helper — the exact shape of the geometry assertion this phase owes                                                                                                           |
| 4   | `apps/editor/e2e/README.md`                                            | "A floating control needs a geometry assertion, not a visibility one", and why `position: fixed` is unavailable here                                                                       |
| 5   | `apps/editor/src/features/configure/components/add-skill-dialog.tsx`   | `disabled` on a not-yet-ready confirm button; `aria-disabled` + `title` where a reason must be legible                                                                                     |
| 6   | `packages/ui/src/components/chip.tsx`                                  | **Read it to confirm the suggestion chips are NOT this.** `Chip` is an `uppercase` mono toggle that hardcodes `aria-pressed`; a suggestion is a sentence-case action. See §4               |
| 7   | `packages/ui/src/components/button.tsx`                                | `buttonVariants`, and `variant="block"` / `"outline"` / `"primary"` — what the send button composes from and what the proposal's footer uses verbatim                                      |

**Four files this document used to list are gone from it**, and their absence is the mode removal:
`segmented.tsx` and `skill-options-panel.tsx` (there is no mode track to reuse `Segmented` for),
`search.ts` and `use-catalog-first.ts` (nothing derives a mode from the configuration any more), and
`ui-store.ts` / `ui-store.test.ts` (**this phase adds no store field at all**). Do not go looking for
what they were for.

**Design sources.**

| Source                                                                                                                                                         | What it is for                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude-design/design/Configurator v5.dc.html` — `.dock`, `.dcmp`, `.dta`, `.dctl`, `.dhint`, `.dsend`, `.kb`                                                 | The dock, built exactly as drawn                                                                                                                                |
| The same file's `DOCK` constant, `.dseg`, `.dsg`, and `.claude-design/screens/11-dock-ask.png`                                                                 | **Dead.** Listed so they are recognised, not so they are built from — see [THE COMPOSER HAS NO MODES](#the-composer-has-no-modes)                               |
| `Chat Composer Lab.dc.html` option `91g` — `.prop` / `.prh` / `.prq` / `.prm` / `.prb` / `.prg` / `.prr` / `.prs` / `.prn` / `.prw` / `.prf` / `.dfn` / `.btn` | The only drawing of a proposal that exists anywhere, and a required source after ruling 3                                                                       |
| `Chat Composer Lab.dc.html` option `91a` — `.sugs` / `.sug` / `.sugg` / `.sugt`                                                                                | **The only drawing of a suggestion affordance that exists.** The suggestion chips take its type and its amber mark, turned from a column into a row. See §4     |
| `Chat Composer Lab.dc.html` option `91j`                                                                                                                       | Where the single placeholder comes from, byte-exact: `grep -on 'Describe your project, or ask for a change…' ".claude-design/design/Chat Composer Lab.dc.html"` |
| `.claude-design/README.md` § "Natural-language composer (docked)", `.claude-design/DECISIONS.md`                                                               | The rejected-alternatives record, with `Dock Float Lab.dc.html` turn 93 and `Dock Composer Lab.dc.html` turn 92                                                 |

**Where the design source and this document disagree, this document wins**, and each divergence
says why. Two are known besides the mode removal: `DECISIONS.md` writes the full-bleed margin as the
resolved `-60px` while the code uses `calc(-1 * var(--gut))` and adds a 26px top margin the log
omits; and the design draws a `recommended` filter chip that is now prohibited outright.

---

## Requirements

### Must have

#### 1. Placement and float treatment — "notched into the grid"

The dock is the last thing in the main column and is **sticky to its foot**.

| Property         | Value                                                                                                                                                    | Derived from                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Position         | `sticky`, `bottom: 0`                                                                                                                                    | `.dock`                       |
| Stacking         | `z-60` — the filter bar's layer, above pinned domain headers (`z-56`)                                                                                    | `.dock{z-index:60}`           |
| Top margin       | `1.625rem` (the design's 26px)                                                                                                                           | `.dock{margin:26px …}`        |
| Horizontal bleed | `-mx-gutter` — **derive from the gutter variable, never a literal**                                                                                      | `calc(-1 * var(--gut))`       |
| Dock background  | `bg-column` (`#fdfdfc`) — the main column's own colour                                                                                                   | `.dock{background:#fdfdfc}`   |
| Band background  | `bg-cell` (`#ffffff`) — one step brighter than the column                                                                                                | `.dcmp{background:#fff}`      |
| Band edges       | **top and bottom hairlines only, as insets** — `shadow-[inset_0_1px_0_var(--color-hairline),inset_0_-1px_0_var(--color-hairline)]`                       | `.dcmp`                       |
| Side borders     | **None.** A full-bleed element's sides would land on the column dividers                                                                                 | `.dcmp`, DECISIONS.md         |
| Drop shadow      | **None.** The only drop shadow in this design is on modal dialogs                                                                                        | README, DECISIONS.md          |
| Content inset    | `px-gutter` on the band, so the placeholder's left edge and the send button's right edge land on the same content edge the skill grid and filter bar use | `.dcmp{padding:0 var(--gut)}` |

**Do not hardcode the gutter.** `.claude-design/README.md` records four separate bugs from doing
exactly that, and the research found the prototype itself hardcoding it in two rules while five
others use the variable. The editor's Tailwind form of the variable is `-mx-gutter` / `px-gutter`,
backed by `--spacing-gutter` in `packages/ui/src/styles/globals.css`. Use those utilities. A raw
`-mx-[3.75rem]` or `-mx-[66px]` anywhere in this phase is a defect.

**Hairlines as insets rather than `border-y`**, because the design chose insets so they do not
affect box size, and because an inset cannot accidentally acquire a side.

**Nine float treatments were built and rejected** in `Dock Float Lab.dc.html` turn 93, and they
constrain future work: scrim fade (`93a`), hard band (`93b`), recessed well (`93c`), dark band
(`93d`), frosted blur (`93e`), proud outline (`93g`), lip edge (`93i`), dark field (`93j`) and a
non-floating column floor (`93f`). Do not reintroduce any of them. The winner's own recorded
weakness, worth knowing before someone reopens it: `93h` is "weakest at signalling that content
continues underneath."

#### 2. The band has exactly two children and **no divider between them**

```
band (.dcmp)
├── the text area   (.dta)
└── the control row (.dctl)
```

Nothing between them: no `border-top` on the control row, no `border-bottom` on the text area, no
rule, no spacer element. This is an **explicit removal** — the lab's base rule carried
`.ctlrow{border-top:1px solid #ece9e0}` and the shipped variant `92i` sets `.cmp.flush
.ctlrow{border-top:0;padding-top:0}`. DECISIONS.md: _"No divider between the text area and the
control row — one field, not two stacked things."_ Do not reintroduce it when the field gains a
real textarea.

**Vertical rhythm**, in `rem` because everything in this app scales with the root sizing knob:

| Element              | Padding                                             | px in the design    |
| -------------------- | --------------------------------------------------- | ------------------- |
| Text area            | `pt-[0.9375rem]`, no bottom padding                 | 15px 0 0            |
| Text area min-height | `min-h-[1.1875rem]`                                 | 19px                |
| Control row          | `pt-[0.5625rem] pb-[0.8125rem]`, `gap-2` (`0.5rem`) | 9px 0 13px, gap 8px |

#### 3. One field, one button — the copy

**There are no modes, so there is one of each string.** The three-mode table in `DOCK` and the
two-mode table this document used to carry are both dead; what follows replaces them.

| Slot              | String                                        | Status                                                                  |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| Field placeholder | `Describe your project, or ask for a change…` | **Byte-verified** — `Chat Composer Lab.dc.html` option `91j`, line 364  |
| Send button label | `Send`                                        | **Byte-verified** — the same lab draws it at `91b`, `91d` and `91j`     |
| Hint              | `nothing changes until you apply`             | **NEW.** Proposed by this document, verified against nothing. See below |

Re-derive the first two rather than trusting them, because both were read on 2026-08-26:

```sh
grep -on 'Describe your project, or ask for a change…' ".claude-design/design/Chat Composer Lab.dc.html"
grep -on 'class="send[^"]*">[^<]*' ".claude-design/design/Chat Composer Lab.dc.html" | sort -u
```

**The ellipsis is a single U+2026 HORIZONTAL ELLIPSIS**, not three dots — confirmed as the bytes
`e2 80 a6` in the design source.

##### Why the placeholder is that one, and why it is not new copy

The two mode placeholders were `Describe the stack you want to build…` and `Change what is already
selected…`. **Their union is already drawn**: `91j`'s single-field composer carries `Describe your
project, or ask for a change…`, which names both intents in one sentence and is exactly what a
no-modes field has to say. Taking it costs nothing and invents nothing, and it is the only place in
the whole design folder where one field is asked to cover both.

##### Why the send label is `Send`

`Build stack` and `Apply` were the two mode verbs and they died with the modes. The lab's own label
for an un-moded single button is `Send`, drawn three times, and it is honest: pressing it sends the
sentence — the **proposal** is what comes back, and the proposal has its own `Apply`. Naming the
send button `Apply` or `Build stack` would claim a consequence the press does not have (ruling 3:
pressing send never mutates anything).

**It also dissolves a collision this document used to spend a criterion on.** With a per-mode label,
`adjust` mode put a send button named `Apply` on screen beside the proposal's own `Apply`, which
`getByRole("button", { name: "Apply" })` resolves to two elements — a Playwright strict-mode
failure. There is no such collision now, and **there is no button named `Apply`, `Send` or `Discard`
anywhere else in the editor today**:

```sh
grep -rn '>Apply\|"Apply\|>Send\|"Send\|Discard' apps/editor/src --include='*.tsx'
```

##### Why the hint is new, and why there is still a hint

The two mode hints (`selects skills and creates sub-agents`, `edits scope, preload and install
mode`) each described **a mode**, so both lost their subject. `.dhint` itself is not dead — it is a
drawn part of `.dctl` and the field and the button both point at it with `aria-describedby`.

What is worth saying in it now is the thing ruling 3 settled and that nothing else on screen states:
**pressing send changes nothing.** Proposed copy, lowercase and unpunctuated to match the two dead
hints exactly:

```
nothing changes until you apply
```

**This is one of only two new strings in this phase** — the other is `no changes` in §12 — and both
are called out again for the reviewer. It stays true in Phase D, so it is not a placeholder to
un-write later.

##### There is no mode state, and nothing derives one

Deleted from this document with the rulings, and listed so nobody reconstructs them: the
`ComposerMode` type, the ordered mode tuple, the `DOCK` copy table, `composerMode` /
`setComposerMode` in `ui-store`, the `composerMode ?? (hasConfiguration(config) ? "adjust" :
"build")` derivation, the `hasConfiguration` predicate and its unit spec, the keystroke pin, and
the write-permission table saying what each mode may and may not write.

**The permission table is the one worth understanding rather than merely deleting**, because it is
what Phase D would have implemented. It said `adjust` may write _"scope, preload and install
mode"_ and may never add or remove a skill. The output schema **as it then stood** —
`{ skillIds, agentPins?, prose }` — had no field for any of those three. The table described a
capability the wire could not carry, and it is not deferred; it is gone.

**The wire has since changed and the table is still gone.** Ruling 2b puts `load` on every
assignment entry, so `lazy → preloaded` is expressible today — which does not resurrect a permission
table, because there is no mode left to hold one, and the composer's single field needs no statement
of what it may write beyond what the schema carries and
[§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting)'s clamp removes.

**A `find` mode was cut and stays cut** — the filter bar two inches above already searches the
marketplace. Anything that only reads the marketplace belongs on the bar, not here.

#### 4. The suggestion chips — the only new surface in this phase

**Ruling 2.** Openers that prefill the field for the user to finish. Clicking one puts its text in
the field; typing the same sentence by hand must reach exactly the same place.

##### They are a writing aid, not a mode. Say it in the code

**Nothing records which chip was used, and nothing branches on it.** No state field, no
`lastChip`, no `source: "chip" | "typed"`, no analytics tag, no different placeholder afterwards,
no different button, and — when Phase D lands — **nothing on the wire.** The chip's entire effect is
a string in the textarea, which the user is then free to delete, rewrite or ignore.

This is the exact thing that will drift back into a mode, so it is a constraint rather than a
preference:

- **The chip's `onClick` writes the draft and nothing else.** If it writes a second piece of state,
  that state is a mode.
- **The submit handler cannot tell a chip apart from typing**, because it only ever sees `draft`.
- **[T17](#technical) is the grep**, and [F29](#functional) is the behavioural half: the same
  sentence typed by hand produces a byte-identical outcome.

##### The copy — two openers, and a fence against a third

| Order | Label (also the accessible name) | Status                      |
| ----- | -------------------------------- | --------------------------- |
| 1     | `Change my setup to…`            | **Owner's words**, ruling 2 |
| 2     | `Create a new setup with…`       | **Owner's words**, ruling 2 |

Both ellipses are a single **U+2026 HORIZONTAL ELLIPSIS**, matching the field's placeholder.

**The order is the owner's**, taken as written in [`README.md`](./README.md) ruling 2 rather than
re-argued. The one argument for flipping it is recorded so the change is a single line if it is
wanted: the cut mode track ordered `build` before `adjust` because _you add before you edit_, and
that reason survives the track even though the track did not.

**Exactly two, and a third does not get added casually.** Two openers is not an arbitrary number —
it is the entire information content of the two cut modes, re-expressed as prose the model reads
instead of a flag the UI carries. There is no third intent: the axis that existed was add / edit,
and it was cut precisely because both ends _"essentially do the same thing"_.

**The specific way a third chip goes wrong is by restoring `ask`.** An `Explain…` or
`Tell me about…` opener is the cut third mode wearing a chip, and it arrives looking like a
harmless addition. Any third chip is a design decision with a written reason, not a free slot.

##### Above the field, not below — and why

**They are a child of the dock, above the band**, in the same region as the outcome slot:

```
dock (.dock)                        ← sticky, bottom: 0, -mx-gutter, bg-column, mt-[1.625rem]
├── the suggestion chips            ← ABSENT from the DOM unless the draft is blank
├── the outcome slot                ← Proposal | null; ABSENT from the DOM when null
└── band (.dcmp)                    ← exactly two children, no divider between them
    ├── the text area   (.dta)
    └── the control row (.dctl)
```

The owner said _"above or below"_. **Above**, on five grounds, the first two of which are the
locked rules this had to be defended against:

1. **The two-children rule survives untouched.** The band holds the text area and the control row
   and nothing else — that is an explicit removal recorded in `DECISIONS.md` and it is locked. The
   chips are outside the band either way, so this rule does not choose between above and below; it
   only rules out the third option, which is putting them in the control row beside the hint. **That
   option is rejected here**: `.dctl` is drawn with exactly three children, the chips are prose in
   Inter while everything in that row is mono, and a chip in the control row would sit level with
   the send button and read as a second action.
2. **"Notched into the grid" survives only above.** The float treatment's whole claim is that the
   band is a row of the grid: full-bleed, a hairline at the top and a hairline at the bottom, the
   bottom one flush with the viewport edge because the band is the dock's last child. Put a row of
   chips below it and a full-bleed strip of `bg-column` sits between that bottom hairline and the
   viewport edge — which reads as a second band, and directly worsens `93h`'s own recorded weakness:
   _"weakest at signalling that content continues underneath."_ Nine float treatments were built
   and rejected to arrive at this one; a row below the band is a tenth by accident.
3. **The dock never has more than two visible children, because the chips and the proposal are
   mutually exclusive by construction.** Not by a rule anyone has to remember — by the mechanics
   already specified. The chips are present only while the draft is blank ([below](#when-they-are-on-screen));
   a proposal only exists after submitting a **non-empty** draft; submit does not clear the draft
   (§9) and `Discard` does not clear it (§12), so the draft is non-empty for a proposal's whole
   life; editing the draft clears the proposal (§9); and `Apply` clears both at once (§12). There is
   no reachable state with both on screen. **[F30](#functional) asserts it in both directions.**
4. **Reading and tab order put the aid before the thing it fills.** Above: chips → text area →
   send. Below: text area → send → chips, so a keyboard user meets the writing aid one stop after
   the button that consumes what they wrote.
5. **The geometry criterion already generalises.** [G8](#geometry--the-assertion-e2ereadmemd-mandates)
   makes the marketplace button clear the **dock** rather than the band, for exactly the reason that
   the dock can grow a child above the band. The chips are the second such child and need no new
   mechanism; below the band they would grow the dock downward, into the viewport edge the sticky
   `bottom: 0` pins.

##### When they are on screen

**Present exactly while `draft.trim() === ""`. Absent from the DOM otherwise.**

**That is the same predicate that disables the send button** (§9), stated once and used twice: the
chips are the empty state of the field, and the button's `disabled` is the empty state of the
action. Two predicates that agree today and can drift tomorrow would be two bugs.

- **Absent rather than hidden**, so `getByRole("button", { name: … })` has count 0 and the chips
  are not tab stops that lead nowhere. This matches the outcome slot, which is also absent when null.
- **Absent rather than disabled.** A disabled chip states an unavailability nobody needs to be told
  about — you cannot be offered an opener for a sentence you have already started. §12's `Apply` is
  disabled rather than absent for the opposite reason (a footer that grows a button is a layout
  changing shape for an invisible reason); a chip row that appears and disappears with the field's
  emptiness is a direct response to something the visitor just did.
- **They come back.** Clear the field and they return, because the predicate is live rather than a
  one-shot dismissal. There is no "dismiss" affordance and none should be added.

##### What clicking one does

Four things, in this order, and **nothing else**:

1. **Sets the draft to the chip's label with the trailing `…` replaced by a single space** — so
   `Change my setup to…` puts `Change my setup to ` in the field and the visitor writes on from
   there. The ellipsis is the affordance, exactly as it is on a placeholder; it is not text anyone
   wants to delete. **This is a derivation of the label, not a second constant** — there is no
   parallel table of prefill strings to drift from the labels, and [F29](#functional) asserts the
   relationship rather than a literal.
2. **Focuses the text area.**
3. **Puts the caret at the end of the inserted text**, explicitly rather than by assuming a
   focus/value ordering — the visitor's next keystroke must land after the space.
4. **Records nothing.**

**It REPLACES the draft rather than appending**, and that is never destructive: the chips are absent
whenever the draft holds anything but whitespace, so the only thing a replace can ever discard is
stray whitespace. Replace is one rule with no branch; append would produce `"   Change my setup to "`
from a field holding three spaces.

##### The visual treatment — `91a`'s suggestion row, turned into a row

**They are not the filter bar's chips and they are not the segmented track.** Both are ruled out on
their own terms:

| Not this               | Why not                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Chip`                 | It hardcodes `aria-pressed={active ?? false}`, so a suggestion would announce as an unpressed toggle. It is also `uppercase` mono, and `CHANGE MY SETUP TO…` is not how a sentence reads |
| `Segmented`            | A radiogroup is a claim that the options are mutually exclusive and one of them is current. Neither is true of an opener — see §5 on why `Segmented` is untouched by this phase          |
| The `recommended` chip | Prohibited outright by ruling 4. These are not it, and adding a `recommended` mark to one would be the prohibition broken by the back door                                               |

**What they are: `Chat Composer Lab.dc.html` option `91a`'s `.sug` row, laid out horizontally.**
That is the only suggestion affordance the design draws anywhere, and it is already the same
vocabulary as the proposal — an amber mark, then Inter prose — which matters because **the proposal
occupies the same slot.** Two things that alternate in one position should not speak two languages.

Re-derive before writing:

```sh
grep -nE '^\.(sugs|sug|sugg|sugt)' ".claude-design/design/Chat Composer Lab.dc.html"
```

| Part        | Design CSS                                                                       | Editor classes                                                                                      |
| ----------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The row     | _(none — `91a` stacks them; `.sugs{margin-top:14px}` is its one figure)_         | `flex px-gutter pb-[0.875rem]`, `gap-[0.875rem]` between chips — **both figures chosen; see below** |
| A chip      | `.sug{display:flex;align-items:baseline;gap:9px;padding:7px 2px;cursor:pointer}` | `flex cursor-pointer items-baseline gap-[0.5625rem] px-[0.125rem] py-[0.4375rem]`                   |
| — the mark  | `.sugg{font:400 9px 'IBM Plex Mono';color:#b0762c}`                              | `font-mono text-9 font-normal text-brand`, `aria-hidden="true"`                                     |
| — the label | `.sugt{font:400 11px Inter;color:#5f5c52;line-height:1.4}`                       | `text-11 font-normal leading-[1.4] whitespace-nowrap` (Inter is the body face)                      |
| — hover     | `.sug:hover .sugt{color:#161513}`                                                | `text-matrix-ink hover:text-ink-primary` **on the button**, so the label inherits it                |
| — focus     | _(the design draws none anywhere in this surface)_                               | `outline-none focus-visible:ring-1 focus-visible:ring-ring` — the package's one ring                |
| — active    | _(none drawn)_                                                                   | **None.** No `active:` rule; the press is over before it could be seen                              |
| — disabled  | _(none drawn)_                                                                   | **Unreachable.** A chip is absent rather than disabled — see above                                  |

**The mark is U+2192 RIGHTWARDS ARROW `→`**, which is `.sugg`'s own glyph and is already this
project's notation for a transition (§11; `matrix-grid.tsx`'s `empty → lazy → preloaded`). It is
`aria-hidden`, exactly as the proposal's `＋` is, so two repetitions of "rightwards arrow" do not
precede two openers.

**Two figures are chosen rather than transcribed**, and both are the same number because the design
uses that number for this separation: `91a` puts **14px** between the composer and its suggestion
block (`.sugs{margin-top:14px}`). Here the block is above rather than below, so the 14px becomes the
row's bottom padding, and the same figure separates the two chips from each other. `91a` stacks its
suggestions in a column, so there is no drawn horizontal gap to copy.

**The one judgement call in this section is the amber mark, and a reviewer should challenge it
rather than wave it through.** `.claude-design/README.md`'s law is _"Amber means 'not the default.'
It is never decoration"_, and an arrow before an opener is arguably decoration. It is kept for two
reasons: `91a` draws it amber, so it is reproduced rather than invented; and `91g`'s `＋` is amber on
the row of the block that alternates with this one in the same slot, so dropping it here would make
the two occupants of one position disagree. **If the owner rules it decoration, the fallback is
`text-faint` (`#8b8778`) on the mark and nothing else changes.**

##### Keyboard and accessible names

| Element      | Role     | Accessible name                                    | Notes                                                   |
| ------------ | -------- | -------------------------------------------------- | ------------------------------------------------------- |
| The chip row | `group`  | `Prompt suggestions` (`aria-label`)                | The app's existing idiom for a labelled row of controls |
| Each chip    | `button` | `Change my setup to…` / `Create a new setup with…` | The visible label exactly; the `→` is `aria-hidden`     |

- **Each chip is its own tab stop.** No roving tabindex and no `role="toolbar"`. That is this app's
  existing convention for a row of chips — `filter-bar.tsx` renders six `Chip`s as six independent
  tab stops in a plain `flex` div — and two stops is cheaper than the six already shipped. A roving
  tabindex is the `Segmented` mechanism and it comes with the radiogroup semantics these chips must
  not claim.
- **`Enter` and `Space` activate them**, because they are real `<button>`s and nothing overrides it.
- **The accessible name is the visible label**, which is the same string that gets inserted (modulo
  the trailing ellipsis). One string, three duties, nothing to keep in step.
- **`role="group"` with an `aria-label`** rather than a bare `div`: `skill-contents-dialog.tsx`
  (`Files`), `stack-grid.tsx` (`Stacks`) and `domain-section.tsx` all do this, and it is what makes
  the row addressable in a spec without depending on its position.

#### 5. The hint, and why `Segmented` is untouched by this phase

The hint is a `<span>` in the control row, taking its `gap-2`. Mono, `text-9`, `text-roster-off`
(`#b4b0a2`), `whitespace-nowrap`, **lowercase and verbatim** — no `text-transform`, no `tracking`.

**Its copy is `nothing changes until you apply`, which is NEW** — see §3, which is also where the
two dead mode hints are recorded.

**The control row now holds two children, not three.** `.dctl` is
`display:flex;align-items:center;gap:8px;padding:9px 0 13px`, and with the mode track gone it holds
the hint and then the send button, which carries `margin-left:auto`. So the hint sits on the
column's left content edge and the button on its right — the same two edges the grid and the filter
bar use. Nothing about `.dctl` itself changes.

The hint carries the one claim ruling 3 settled, so it must reach assistive technology as well as
the eye — see [Accessibility](#accessibility), where both the field and the button point at it with
`aria-describedby`.

##### `Segmented` gets no `cva`, no `track` variant, and no story

**This is a deletion, and it is the largest single simplification the mode removal buys.** An
earlier draft of this document ruled `Segmented` reused for the mode track and specified a new `cva`
for it, a `track` variant, a `size: "mode"` arm on `chipVariants` with two compound arms, a
`--shadow-pill` token and a new story. **There is no track, so all of it is moot and none of it is
built.**

Verify the component is as this says before assuming, because it is the thing most likely to have
moved:

```sh
grep -n 'cva\|className={cn(' packages/ui/src/components/segmented.tsx
grep -n 'size: {' -A 5 packages/ui/src/components/chip.tsx
```

- **`packages/ui/src/components/segmented.tsx` is not modified.** It has no `cva` today — it
  hardcodes its class string — and that stays true. It is still the right component for a row of
  mutually exclusive options; this phase simply has no such row. Do not add a `cva` "while you are
  in there": it is the only component in the package without one, and the reason to give it one was
  a second call site that no longer exists.
- **`segmented.stories.tsx` is not modified**, because no variant is added.
- **`chipVariants` gains nothing.** Its three sizes stay `filter`, `segment` and `stage`. The
  suggestion chips are not `Chip` at all — §4 says why.
- **`--shadow-pill` is not added**, so `globals.css`'s comment that _"the app has only these two"_
  shadows stays true and is not edited. That token existed only to lift the active mode pill.
- **The two `skill-options-panel.tsx` call sites are untouched by construction**, rather than by a
  byte-identical-class-string argument. That is a stronger guarantee than the one this document used
  to make, and [T8](#technical) is now a one-line `git diff`.

#### 6. The send button

**One button, labelled `Send`, and it is BLACK.** The label is §3's; this section is the treatment.

The class string in the prototype is hardcoded `dsend` and never varied — the design's own send
button was black in every one of its three modes. Black is an explicit rejection of an alternative
recorded three times, in `DECISIONS.md`, in `README.md` and in `92i`'s own caption: _"The action
stays black in every mode; what changes is the verb on it and the sentence above it."_ The rejected
treatment (`.send.ghost`: no fill, `#4a473c` text, a `1px #cfcabb` inset outline) still exists in the
lab and is what **not** to build.

**The original argument for black rested on the modes, so here it is re-derived without them**, in
three lines, because it is the kind of decision an implementer reopens:

1. **There is exactly one action on this surface** and it is the surface's entire purpose. An
   outlined button is how you say _"this is the lesser of the two controls here"_, and there is no
   other control to be lesser than.
2. **The only argument the ghost treatment ever had was a read-only mode** — a mode whose press
   changed nothing and should therefore not look like a commit. `ask` is cut, so that argument has no
   subject at all.
3. **The proposal's own footer already uses both weights correctly**: `Discard` is
   `Button variant="outline"` and `Apply` is `variant="primary"`, which is black. A ghost send
   button would be an outlined affirmative sitting above a black one, which inverts the pair.

| Property        | Value                                                                                                    | Design source                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Fill            | `bg-ink` (`#242320`)                                                                                     | `.dsend{background:#242320}`                     |
| Hover           | `hover:bg-ink-2` (`#3a382f`)                                                                             | `.dsend:hover`                                   |
| Text            | `text-primary-foreground` (`#ffffff`), mono, `text-9_5`, `font-semibold`, `tracking-[.1em]`, `uppercase` | `.dsend`                                         |
| Border / radius | none / 0                                                                                                 | `.dsend{border:0}`, radius 0 everywhere          |
| Padding         | `px-[0.9375rem] py-[0.5625rem]`                                                                          | `padding:9px 15px`                               |
| Layout          | `ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap`                                             | `.dsend`                                         |
| Focus           | the package's one ring — `outline-none focus-visible:ring-1 focus-visible:ring-ring`                     | the app's idiom; the design draws no focus state |
| Disabled        | `disabled:pointer-events-none disabled:opacity-40`, which `Button` already carries                       | §9; the design draws no disabled state           |

`Button`'s existing `variant="block"` is `bg-ink px-[1.125rem] text-9_5 tracking-[.1em]` with no
vertical padding — it is stretched to the filter bar's height and has the wrong horizontal padding.
**Do not add a fifth `Button` variant for one call site.** Render the send button from
`buttonVariants({ variant: "block" })` composed with the composer's own padding and tracking through
`cn`, or as a plain `<button>` carrying the classes above — either is acceptable; what is not
acceptable is a new shared variant that nothing else uses, or a raw hex.

**The label no longer changes, so nothing about its width moves.** This document used to rule
against a `min-width` because `Apply` and `Build stack` are 5 and 11 characters and the button
visibly jumped between them. With one label there is no jump — **and there is still no `min-width`**,
because there is now nothing for one to reserve space for.

#### 7. The keyboard affordance

The design draws exactly two characters in one span after the label:

- **U+2318 PLACE OF INTEREST SIGN** `⌘`
- **U+21A9 LEFTWARDS ARROW WITH HOOK** `↩`

Adjacent, **no space, no plus sign, no brackets, no key caps**. Verified byte-exact:
`⌘` = `0xE2 0x8C 0x98`, `↩` = `0xE2 0x86 0xA9`. It is **not** U+23CE `⏎` and **not** U+21B5 `↵`.

Styling: `text-faint` (`#8b8778`), `font-normal`, `tracking-normal` — so it reads as an annotation
on the button rather than part of the verb. Separated from the label by the row's `gap-2` **plus a
literal space in the markup**, exactly as the design has it.

Rendered: `SEND ⌘↩` — the label uppercased by CSS, the glyph pair unaffected. **One
rendering, because there is one label.**

**The `Apply` collision this section used to resolve no longer exists.** With per-mode labels, the
send button read `Apply` in `adjust` mode while the proposal's own `Apply` was on screen, so
`getByRole("button", { name: "Apply" })` matched two elements and failed Playwright's strict mode.
The send button is `Send` now, and nothing else in the editor is named `Apply`, `Send` or `Discard`
(§3 carries the grep). The criterion that pinned the collision is deleted rather than left as
furniture — see [What is deliberately NOT a criterion](#what-is-deliberately-not-a-criterion).

**The proposal's buttons keep their fuller accessible names anyway**, and the reason is now the
app's own convention rather than a collision: `aria-label={"<verb> <subject>"}` is already how this
codebase names controls (`Remove ${name}`, `Contents of ${skill.displayName}`,
`Options for ${skill.displayName}`), and `Discard` alone does not say what is discarded. Visible
labels stay `Apply` and `Discard` exactly as `91g` draws them.

**Two things the design leaves open and this spec rules on:**

**(a) `⌘` is macOS-specific and nothing in the design addresses a Ctrl variant.** Detect the
platform once at module scope and render `⌘↩` on Apple platforms, `Ctrl↩` elsewhere. **Bind both
`metaKey+Enter` and `ctrlKey+Enter` on every platform** — a bound key that is not drawn costs
nothing, and a drawn key that is not bound is a lie. The prototype has no keydown handler anywhere
(`grep -n 'keydown\|onKeyDown' "Configurator v5.dc.html"` returns nothing), so `⌘↩` is currently
drawn and not bound; the real build must bind it.

**(b) Plain `Enter` inserts a newline. It does not submit.** The design draws a modifier
affordance, which would be pointless if plain Enter also submitted, and the field is a prose box
whose own placeholder invites a sentence.

The original third reason — that an accidental submit could restructure the whole stack — **is
retired by ruling 3**: a submit produces a proposal that changes nothing, so an accidental one costs
a block on screen and a `Discard`, not a stack. The ruling stands anyway on the first two reasons,
and it stands on a third that survives: an accidental submit still throws away a half-written
sentence's momentum and, in Phase D, still costs a model call.

`Escape` has no handler. The design specifies none and there is nothing to cancel.

#### 8. The text area

A real `<textarea>`. There is no textarea anywhere in this codebase today
(`grep -rn "textarea" apps/editor/src packages/ui/src` returns nothing) and `Input` wraps
`@base-ui/react/input`, which is not one — so this is a new element rather than a reuse.

| Property           | Value                                                                                                                                        | Note                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Type               | Inter, `text-12_5`, `leading-[1.5]`, `text-ink` (`#242320`)                                                                                  | **The only Inter body text in this surface**, and larger than anything else in it |
| Placeholder colour | `placeholder:text-field-faint` (`#a19d90`) — **A0's name, not the one this document first proposed.** See [Tokens](#tokens-this-phase-needs) | `.dta.ph{color:#a19d90}`                                                          |
| Resting height     | `min-h-[1.1875rem]` — one line                                                                                                               | `.dta{min-height:19px}`                                                           |
| Chrome             | `w-full resize-none border-0 bg-transparent p-0 outline-none`                                                                                | The band owns the edges; the field contributes only type                          |
| Focus              | `focus-visible:ring-1 focus-visible:ring-ring` — the package's one ring                                                                      | See below                                                                         |
| Growth             | `field-sizing-content` with `max-h-[7.125rem]` (6 lines × 19px) and `overflow-y-auto` past it                                                | See below                                                                         |

**Focus.** The design has no focus treatment for the composer in the assembled screen. The lab holds
an unlocked exploration — `.cmp.foc{box-shadow:inset 0 0 0 1px #b0762c}` and an amber caret — which
is **not** a locked decision. Use the package's one focus ring, which is what `inputVariants` and
`Chip` already carry and therefore what every other focusable thing in this app shows. No caret
rule: the light-surface search field has none either, and the lab's amber caret is unlocked.

**Growth.** Multi-line growth is undesigned. `field-sizing-content` is one CSS declaration, no
JavaScript, and where it is unsupported the field stays at its floor and scrolls — which is
**exactly the state the design draws.** So the degradation is the design rather than a broken
variant of it. The cap is a named module constant with its reason: the dock is sticky at the
viewport bottom and an uncapped field would eventually cover the page.

#### 9. Submitting, and where the proposal lives

**The send button is `disabled` while the draft is blank** (`draft.trim() === ""`). `Button` already
carries `disabled:pointer-events-none disabled:opacity-40`, and `add-skill-dialog.tsx`'s confirm
button is the precedent for `disabled` meaning "not ready yet" rather than "not allowed". While
disabled it leaves the tab order, which is correct: there is nothing to do there yet.

**That predicate is the same one the suggestion chips are shown by** (§4). One predicate, two
readers: the chips are the empty state of the field and `disabled` is the empty state of the action.
Write it once.

**Pressing send with a non-blank draft** — by click or by `⌘/Ctrl+Enter` — renders a **proposal**
into the outcome slot. Never a silent mutation (ruling 3).

1. **Does not clear the draft.** Nothing has been applied, so destroying the visitor's sentence
   would be a pure loss. (`Apply` clears it; see §12.)
2. **Does not mutate any store at all.** This phase adds no store field, so the claim is now
   absolute rather than carved out for a composer field. Assert it — see
   [Success criteria](#success-criteria).

**The proposal clears when the draft is edited.** A stale answer to a changed question is worse than
no answer. **The second clearing trigger this document used to carry — "and when the mode changes" —
is gone with the modes**, and nothing replaces it: there is no other input to the question, so
editing the sentence is the only way to change it.

##### The outcome slot is widened, not moved

The first draft placed a `string | null` outcome slot as a child of the **dock**, above the band, so
that a proposal could later land in it without anything else moving. That was the right place and it
**does not move now** — it holds a proposal instead of a sentence, and the suggestion chips join it
as the dock's other conditional child:

```
dock (.dock)                        ← sticky, bottom: 0, -mx-gutter, bg-column
├── the suggestion chips            ← ABSENT unless the draft is blank        (§4)
├── the outcome slot                ← Proposal | null; ABSENT when null
└── band (.dcmp)                    ← exactly two children, no divider between them
    ├── the text area   (.dta)
    └── the control row (.dctl)
```

**The two conditional children are mutually exclusive**, so the dock never draws more than two
things — §4 carries the proof and [F30](#functional) asserts it.

The three reasons the slot was put there all still hold, and the third has been collected:

- it keeps the band at exactly two children, which is a locked rule;
- it is opaque — the dock's own `bg-column` covers the scrolling grid beneath — so it is legible;
- **it did not foreclose the answer, and the answer arrived.** Ruling 3 chose the reviewable
  proposal over the silent mutation. The slot widens; the composer, the band and the keyboard
  contract are untouched, exactly as this document predicted.

**Putting the proposal inside the band is still forbidden.** That would break the two-children rule
and couple a proposal's layout to the field's.

**The slot is inset to the content edge and scrolls when it is tall.** `px-gutter` puts its edges on
the same content edge the band uses. It is `max-h-[21rem] overflow-y-auto` — a named module constant
with its reason, for the same reason the text area has one: the dock is sticky at the viewport
bottom and an uncapped proposal would eventually cover the page. A 10-change proposal like `91g`'s
is around 15rem, so the cap is headroom rather than a crop of the drawn case.

#### 10. The proposal — what `91g` actually draws

**Ruling 3 makes this required work.** `Chat Composer Lab.dc.html` option `91g` is the only drawing
of a proposal that exists anywhere, so it is the source and it is transcribed here in full. Its own
caption states the claim: _"However you ask, this is what should come back: a reviewable changeset,
not a silent mutation. Preload decisions carry their reason, so_ tests matter _is visibly what made
Vitest preloaded."_

Re-derive the CSS before writing, because every figure below was read on 2026-08-26:

```sh
grep -nE '^\.(prop|prh|prq|prm|prb|prg|prr|prs|prn|prw|prf|dfn|btn)' ".claude-design/design/Chat Composer Lab.dc.html"
```

**Four parts, top to bottom.**

| Part                    | Rule        | Design CSS                                                                                                 | Editor classes                                                                                    |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Container               | `.prop`     | `box-shadow:inset 0 0 0 1px #dcd7c9;background:#fff`                                                       | `bg-cell shadow-[inset_0_0_0_1px_var(--color-hairline)]` — **no drop shadow, no radius**          |
| Header                  | `.prh`      | `display:flex;align-items:baseline;padding:13px 15px 11px`                                                 | `flex items-baseline px-[0.9375rem] pt-[0.8125rem] pb-[0.6875rem]`                                |
| — the echoed sentence   | `.prq`      | `font:400 11.5px Inter;color:#5f5c52;font-style:italic`                                                    | `text-11_5 font-normal text-matrix-ink italic` (Inter is the body face; no `font-mono`)           |
| — the total, right      | `.prm`      | `margin-left:auto;font:400 8.5px 'IBM Plex Mono';color:#b4b0a2`                                            | `ml-auto font-mono text-8_5 font-normal text-roster-off`                                          |
| Body                    | `.prb`      | `border-top:1px solid #ece9e0;padding:12px 15px 14px`                                                      | `border-t border-tree-border px-[0.9375rem] pt-[0.75rem] pb-[0.875rem]`                           |
| — a group heading       | `.prg`      | `font:600 8.5px 'IBM Plex Mono';letter-spacing:.1em;text-transform:uppercase;color:#8b8778;margin:0 0 6px` | `font-mono text-8_5 font-semibold tracking-[.1em] text-faint uppercase mb-[0.375rem]`             |
| — a second group        | `.prg+.prg` | `margin-top:14px`                                                                                          | `mt-[0.875rem]` on every group but the first                                                      |
| — a row                 | `.prr`      | `display:grid;grid-template-columns:14px 1fr auto;align-items:baseline;height:19px`                        | `grid grid-cols-[0.875rem_1fr_auto] h-[1.1875rem] items-baseline`                                 |
| — the mark              | `.prs`      | `font:400 10px 'IBM Plex Mono';color:#b0762c`                                                              | `font-mono text-10 font-normal text-brand`                                                        |
| — the name              | `.prn`      | `font:400 11px Inter;color:#242320`                                                                        | `text-11 font-normal text-ink`                                                                    |
| — the state, right      | `.prw`      | `font:400 8.5px 'IBM Plex Mono';color:#8b8778`                                                             | `font-mono text-8_5 font-normal text-faint`                                                       |
| — the state, when amber | `.prw.am`   | `color:#a06a1c`                                                                                            | `text-brand-ink`                                                                                  |
| Footer                  | `.prf`      | `flex:none;display:flex;align-items:center;gap:9px;padding:13px 20px;border-top:1px solid #dcd7c9`         | `flex shrink-0 items-center gap-[0.5625rem] border-t border-hairline px-[1.25rem] py-[0.8125rem]` |
| — the reason line       | `.dfn`      | `font:400 10px 'IBM Plex Mono';color:#7a7669;margin-right:auto;min-width:0`                                | `mr-auto min-w-0 font-mono text-10 font-normal text-muted-foreground`                             |

**The echoed sentence is wrapped in curly quotes, and they are part of the rendered string.**
`91g`'s markup is `<span class="prq">“Next.js app with tRPC and Postgres. Tests matter a lot.”</span>`
— **U+201C LEFT DOUBLE QUOTATION MARK** before and **U+201D RIGHT DOUBLE QUOTATION MARK** after. Not
`"` (U+0022), and not `«»`. They are content rather than CSS, so no `::before` / `::after` rule
produces them and none should be written; the component renders them around the sentence. The italic
is `.prq`'s own `font-style`.

**Every colour in that table already has a token. The proposal needs no new colour and no new type
step.** `#dcd7c9` is `hairline`, `#fff` is `cell`, `#5f5c52` is `matrix-ink`, `#b4b0a2` is
`roster-off`, `#ece9e0` is `tree-border`, `#8b8778` is `faint`, `#b0762c` is `brand`, `#242320` is
`ink`, `#a06a1c` is `brand-ink`, `#7a7669` is `muted-foreground`. And 11.5 / 8.5 / 10 / 11 are all
already in the scale as `text-11_5` / `text-8_5` / `text-10` / `text-11`.

Two of those are second duties worth naming in a comment where they are used, because the token's
own comment does not cover this surface: **`tree-border`** says it _"splits the preview dialog's two
panes"_, and here it splits the header from the body; **`matrix-ink`** is named for the matrix cell's
label, and is already the app's general one-step-quieter ink — `menu.tsx`, the options panel's info
tip and four sites in `roster-panel.tsx` all use it well away from any matrix, so this is existing
practice rather than a new stretch.

**The two footer buttons are `Button` verbatim. Do not write a new variant.** Verified class by
class:

| `91g`      | Component                  | Proof                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.btn`     | `Button variant="outline"` | `border 1px #cfcabb` = `border-rule`; `#fff` = `bg-cell`; `#4a473c` = `text-ink-3`; `10px 15px` = `py-[0.625rem] px-[0.9375rem]`; `600 9.5px` mono and `.11em` = `text-9_5 tracking-[.11em]`; hover `#a9a292` / `#242320` = `hover:border-dialog-border hover:text-ink` |
| `.btn.pri` | `Button variant="primary"` | `#242320` fill and border = `bg-ink border-ink`; `#fff` = `text-primary-foreground`; hover `#3a382f` = `hover:bg-ink-2`                                                                                                                                                 |

This is the same fence as the send button's, arriving from the other side: the send button needs a
composed one-off because no variant fits it, and the proposal needs no new variant because two
already fit exactly.

**The three claims `91g` makes**, read off the drawing and all three now binding: nothing is applied
until `Apply`; every change is enumerated **and attributed**, carrying the state chosen for it rather
than just its name; and the preload decision carries its reason, tied back to a clause in the echoed
sentence.

**Copy forms**, from the fixture (`propTotal`, `propSkLabel`, `propAgLabel`):

| Slot         | Form                                       | Drawn example                             |
| ------------ | ------------------------------------------ | ----------------------------------------- |
| The total    | `<n> changes`                              | `10 changes`                              |
| Skills group | `Skills · <n> added`                       | `Skills · 7 added`                        |
| Agents group | `Sub-agents · <n> added`                   | `Sub-agents · 3 added`                    |
| A skill row  | name, then the load word                   | `Vitest` / `preloaded`                    |
| An agent row | `<Domain> · <role>`, then `model · effort` | `Web · developer` / `sonnet · med`        |
| The reason   | free prose                                 | `Preloaded because you said tests matter` |

The separator is **U+00B7 MIDDLE DOT with a space either side**, which is the app's existing joiner
— `Marketplace · <name>` on the marketplace button uses the same one.

**Amber marks what the user gets, not decoration.** In `91g` the `＋` is amber (`.prs`) and the load
word is amber only when it is `preloaded` (`.prw.am`), grey when it is `lazy`. That is the app's law
— _"Amber means 'not the default.' It is never decoration."_ — applied correctly, so reproduce it
rather than colouring every state word.

**Rows are not interactive.** `91g` draws no per-row control, and _"whether individual rows can be
rejected"_ is one of the things it explicitly leaves open. A row is text in a named group; it takes
no role, no `tabIndex` and no handler. **The `＋` is `aria-hidden`** — it is a mark, and seven
repetitions of "fullwidth plus sign" before seven names is what happens if it is not.

**The total is the row count**, exactly as the fixture computes it (`propSk.length + propAg.length`).
That arithmetic is load-bearing for §11.

#### 11. A proposal shows CHANGES as well as additions — **this is new design**

> **AMENDED 2026-08-26, second pass, by owner ruling.** _"How are you showing users what will change
> when they accept the plan? We should reuse the info panel diagram imo. That way it's clear what is
> being added and removed."_ The diagram is `MatrixGrid`
> (`packages/ui/src/components/matrix-grid.tsx`), the domain × role field inside the skill options
> panel, and its only call site today is
> `apps/editor/src/features/configure/components/skill-options-panel.tsx`. The ruling turns that
> grid into a **diff** and, in doing so, closes the removal-row gap this section used to leave open
> — [§11.1](#111-the-removal-row--the-gap-is-closed) onward is the new design, and the rest of this
> section is unchanged.

**A proposal needs no mode to know which it is doing. It shows what changed.** That is the whole of
why the modes could be removed without losing anything: `build` and `adjust` were two names for
"read the sentence, work out the difference, show it", and the difference is legible from the
proposal itself — an added skill draws an added row, a moved setting draws a changed row, and a
proposal holding both draws both.

**`91g` draws only additions**, so the changed row is missing from the only drawing there is. This
section designs it. **Everything in it is new** and is marked as such; it is built from `91g`'s own
parts rather than from a new vocabulary.

**The group heading carries the verb, because it already does.** `91g` writes
`Skills · 7 added` — the verb is in the heading, not on the rows. That generalises with no new
mechanism at all:

| Heading                    | Status                            |
| -------------------------- | --------------------------------- |
| `Skills · <n> added`       | **drawn** in `91g`                |
| `Sub-agents · <n> added`   | **drawn** in `91g`                |
| `Skills · <n> changed`     | **new** — same form, verb swapped |
| `Sub-agents · <n> changed` | **new** — same form, verb swapped |

**A changed row is the same 3-track grid**, with two differences:

1. **The mark track is empty.** No glyph. The `0.875rem` column stays so that a proposal holding
   both kinds keeps one name column, and "has an amber mark" then means "added" with nothing else
   needing to say it. No new glyph is invented for "changed"; the absence of the added mark is the
   distinction, and it is drawn in the language `91g` already uses.
2. **The state track holds `<before> → <after>`** instead of a single state word.

**The arrow is U+2192 RIGHTWARDS ARROW `→`, with one space either side.** New as rendered copy in
this position — and it is now the **second** use of the glyph in this phase, because §4's suggestion
chips take `91a`'s `.sugg` mark, which is the same character. That is deliberate rather than a
collision: it is **this project's own notation for a transition**, and `matrix-grid.tsx`'s docblock
writes the preload cycle as `empty → lazy → preloaded → empty` on the very component whose states a
changed row reports. Six further files write state transitions with it. So the glyph is borrowed
from the codebase's prose rather than minted, and one glyph doing two jobs on one surface is one
idea rather than two.

**They are still told apart without effort**: a chip's mark leads a line of prose in a row of
buttons, and a changed row's arrow sits between two mono state words inside a bordered block. Both
are `aria-hidden`, so neither is announced at all.

**Amber goes on the `after` half only.** The `before` value and the arrow are `.prw` grey; the
`after` value takes `.prw.am` amber when it is the non-default value and stays grey when it is not.
This is `91g`'s own rule (`preloaded` amber, `lazy` grey) applied to a pair, and it is the app's
amber law read correctly: amber marks what the user is choosing, and the value they are leaving is
not it.

| Field                         | Rendered                     | `after` amber?                                             |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------- |
| Load, on a skill              | `lazy → preloaded`           | yes                                                        |
| Load, the other way           | `preloaded → lazy`           | no                                                         |
| Scope, on a skill or agent    | `project → global`           | no — both are ordinary positions, neither is the amber one |
| Install mode                  | `plugin → eject`             | yes — `eject` is the deliberate departure from the default |
| Model and effort, on an agent | `sonnet · med → opus · high` | no                                                         |

**No field name is rendered, and it does not need to be.** The three value vocabularies are pairwise
disjoint — `{lazy, preloaded}`, `{project, global}`, `{plugin, eject}` — so `project → global` can
only be a scope and `plugin → eject` can only be an install mode. A skill's scope and an agent's
scope are told apart by which group the row is in.

**One row per changed field, not per subject.** A skill whose scope and load both moved gets two
rows carrying the same name. That keeps `91g`'s arithmetic honest — the total is the row count, so
`4 changes` means four things moved — and it keeps every row to one before-and-after, which is the
only shape the 3-track grid can hold.

##### 11.1 The removal row — **the gap is closed**

**This section used to say a removal row was deliberately not designed.** The reason it gave was
that nothing in Phase C could render one, so a glyph invented now would be shipping a decision for a
surface nobody could see or correct. **The owner's ruling supersedes that**, and it supersedes it in
the strongest possible way: it did not ask for a removal glyph, it asked for a diagram that shows
additions and removals in one object. Direction then lands where it can be drawn in notation the
project already has — an arrow's POSITION inside a cell
([§11.6](#116-the-cell-state-by-state--one-notation-one-new-variant-no-new-colour)) — so **no
removal glyph and no removal colour is ever minted.** That is why the gap closes rather than being
filled.

**A removal row is `91g`'s row with two things taken away**, plus the disclosure track every row now
carries:

| Track                       | Added row (`91g`, drawn)                            | Removal row (**new**)                                                        |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Mark (`0.875rem`)           | `＋` U+FF0B, `text-brand` `#b0762c`, `aria-hidden`  | **Empty.** No glyph, and the track stays so one name column serves every row |
| Name (`1fr`)                | `text-11 font-normal text-ink` `#242320`            | Identical. The visitor must be able to read what they are losing             |
| State (`auto`)              | the load summary; `text-brand-ink` when `preloaded` | **Empty**, by one rule rather than a special case — see below                |
| Disclosure (`1.25rem`, new) | [§11.7](#117-the-disclosure-row)                    | identical                                                                    |

**One rule governs the state track on every row, and a full removal falls out of it: the word
describes what the visitor ENDS UP WITH.** `preloaded` when any edge the row leaves behind is
preloaded, `lazy` when edges are left behind and none is preloaded, and **nothing at all when the row
leaves no edges** — which is exactly a skill being removed. There is no removal-specific rule to
remember and no removal-specific value to forget.

**Amber follows the same after rule, which is the amber law rather than an exception to it.**
`globals.css` and `.claude-design/README.md` both state it: _"Amber means 'not the default.' It is
never decoration."_ Amber marks what the visitor **gets**, so a row that leaves nothing behind has
nothing to colour. A removed row is therefore a mark-less name with an empty state track under a
`removed` heading — bare, deliberately, because the grid one press below it is where the detail is.

**The verb is in the heading, exactly as `91g` puts it there**, which is the mechanism this section
already established for the changed row and needs no second one:

| Heading                    | Status                            |
| -------------------------- | --------------------------------- |
| `Skills · <n> added`       | **drawn** in `91g`                |
| `Sub-agents · <n> added`   | **drawn** in `91g`                |
| `Skills · <n> changed`     | **new** — same form, verb swapped |
| `Sub-agents · <n> changed` | **new** — same form, verb swapped |
| `Skills · <n> removed`     | **new** — same form, verb swapped |
| `Sub-agents · <n> removed` | **new** — same form, verb swapped |

**Groups are ordered `added` before `changed` before `removed`, within `Skills` before
`Sub-agents`.** Ordering, not a signal. `.prg+.prg{margin-top:14px}` already separates them.

**`text-destructive` is NOT the answer to a removal, and this section does not depend on
[EDITOR-51](../../editor.md).** That row is about an **error** colour — the scope-pair mark in
`roster-panel.tsx`, which says "this configuration cannot be installed". A removal the visitor asked
for is not an error; it is the thing they typed. Drawing it in the app's one red would be the exact
category mistake EDITOR-51 exists to get right, and it would make _"drop the ORM"_ read as a failure
report. **No colour is added, and none is missing.**

##### 11.2 What the grid is a diff OF — the mapping, cell for cell

**The stored shape is per-edge and the grid is per-edge, so the mapping is exact.**
`skillEntrySchema` (`apps/editor/src/stores/persisted-schema.ts`) carries
`assignments: Record<agentId, { load, enabled }>`; a `MatrixCell` is one (agent, skill) pair. One
cell, one edge.

| Store                                      | Cell                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| no key for that agent, or `enabled: false` | `state: null` — the `empty` variant, and the cell is wordless |
| `{ load: "lazy", enabled: true }`          | `state: "lazy"`, word `lazy`                                  |
| `{ load: "preloaded", enabled: true }`     | `state: "preloaded"`, word `pre`                              |

`liveLoad` in `skill-options-panel.tsx` is that projection already written, and the diff reads
edges the same way — a switched-off row is an unassigned cell.

**A cell is a TRANSITION — `{ before, after }`, each `LoadState | null` — and all four of its states
are reachable.** `README.md`'s owner ruling 2b settles the wire as the stored shape itself: _"The
model emits `skillEntrySchema` as it stands — `install`, `scope`, and `assignments` keyed by agent id
with `{ load, enabled }`"_, with one forced deviation, `assignments` promoted from a record to
`[{ agent, load, enabled }]` because a structured output cannot carry an open record. **So `load`
sits on every edge and the model authors it**, which is the whole of the owner's own worked example:
_"always have React in context when developing for web"_ is preloaded on the web agents' edges and
untouched on the rest.

| Cell                                                      | Word                | Reachable                                                                    |
| --------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| **untouched** — `null → null`, `lazy → lazy`, `pre → pre` | `` / `lazy` / `pre` | Every edge the proposal leaves alone                                         |
| **added** — `null → lazy`, `null → preloaded`             | `→ lazy`            | A new skill, or a new agent on an existing one, or `enabled` false → true    |
| **removed** — `lazy → null`, `preloaded → null`           | `lazy →`            | A dropped skill, or an edge the proposal sets `enabled: false`               |
| **changed** — `lazy → preloaded`, `preloaded → lazy`      | `lazy → pre`        | **Yes.** `load` is on the wire per edge, which is the feature's stated point |

**So a grid CAN be mixed**, and a single skill's grid may hold all four at once. Direction is
therefore a property of the **cell**, never of the grid — [§11.6](#116-the-cell-state-by-state--one-notation-one-new-variant-no-new-colour)
draws it there and nowhere else.

**A NOTE THAT SUPERSEDES TWO DOCUMENTS.** `phase-d-spec.md` §D3.1 and §D3.6 still describe the wire
as `{ skillIds, agentPins?, prose }` and state that a per-skill option change _"has no field"_ and
_"cannot be expressed"_. **That was true of the earlier schema and is false now** — the owner ruled
the emitted shape is `skillEntrySchema`, and `load` is a field on it. See
[§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting) and the amendment to
`phase-d-spec.md` §D3.6. An implementer reading either of those sections without this one will build
a workaround for a limitation that does not exist.

##### 11.3 What the wire carries, and the one thing still worth reporting

**The matrix is drawable honestly, cell for cell, from real data.** Nothing in it is inferred:

| Half of a cell                         | Where it comes from                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `before`                               | `liveLoad(entry, agentId)` against the config store — the projection `skill-options-panel.tsx` already writes |
| `after`, on an edge the proposal names | the emitted `assignments` entry: `enabled ? load : null`                                                      |
| `after`, on an edge the proposal omits | `null`, because a proposal emits the **whole** entry rather than a patch of one                               |

**`defaultAssignmentsFor` is no longer the source of an added skill's cells**, and that is the
largest thing the ruling changed here. It remains the deterministic fallback for an entry the model
omitted assignments for, and it remains what a hand-made selection uses — but a proposal that names
edges names them, and the grid draws what the proposal says rather than what the resolver would have
said. **The two must not both be consulted**; see [§11.10](#1110-the-data-the-renderer-needs).

**Two things are still worth reporting, and neither is a blocker for this section:**

1. **The top-level record has the same problem `assignments` has, and only one deviation is
   written down.** `PersistedConfig["skills"]` is `Record<skillId, SkillEntry>` — an open record —
   so the `additionalProperties: false` argument that forced `assignments` into an array forces the
   skill map into one too. `README.md` names _"One forced deviation, and only one"_. There are two,
   unless the wire's top level is already an array of `{ id, … }`. **Verify against the SDK's own
   type declarations before implementing**, exactly as that ruling instructs for the deviation it
   does name.
2. **`install` and `scope` are on the emitted entry, and ruling 2b says the feature does not touch
   them.** _"It may also choose preload vs lazy per skill, and it may save the stack. That is the
   whole surface. It does not touch sub-agents, scope, install mode, or anything else."_ Those two
   sentences sit a paragraph apart and the schema admits what the prose forbids. The safe posture is
   a **clamp** in Phase D — take `install` and `scope` from the current entry, or from
   `DEFAULT_SKILL_OPTIONS` for a new skill, and ignore what the model said — so no `plugin → eject`
   or `project → global` row can be produced. §11's changed-row table keeps both, designed and
   unproduced, exactly as the changed row itself was. **Do not resolve this by widening what the
   pipeline writes**; it is [an owner question](#for-the-owner).

**And a third reading that needs stating rather than deciding:** _"it does not touch sub-agents"_
cannot mean "it does not author `assignments`", because `assignments` is where `load` lives and
authoring `load` per edge is the ruling's own example. The reading this document works from is that
the model authors **edges** and never **agents** — no on/off pin, no model, no effort, no agent
scope — which is consistent with both halves and with the shape that was ruled. Say so in the report
rather than assuming it.

##### 11.4 Not every edge has a cell — and 173 of 238 skills have one that does not

**Read this before designing anything against the grid.** The panel's grid is **not** the whole
roster, and the difference is not small.

Re-derive all of it rather than trusting the figures below — they were measured on 2026-08-26:

```sh
bunx tsx -e 'import {resolveAssignment} from "./packages/matrix/src/index.ts";
console.log(resolveAssignment({id:"web-testing-vitest",domainId:"web",categoryId:"web-testing"}))'
```

```sh
grep -n 'ROLE_COLUMNS = \[' -A 5 apps/editor/src/features/configure/components/skill-options-panel.tsx
grep -n 'const metaAgents' -A 3 apps/editor/src/features/configure/components/skill-options-panel.tsx
```

- **The grid draws two columns**, `dev` and `test`. Not the design's four: _"The reviewer and PM
  columns died with the per-domain reviewers and PMs (CLI-398, CLI-399)"_, in `ROLE_COLUMNS`' own
  comment.
- **It draws four rows** — the implementation domains that have at least one of those agents. The
  roster's other domains (`mobile`, `desktop`, `infra`, `shared`) have no agents of their own and no
  row.
- **The `＋ Meta` fold draws six more agents** as labelled full-width cells: `agent-summoner`,
  `codex-keeper`, `convention-keeper`, `pm`, `reviewer`, `skill-summoner`. `pm` and `reviewer` are
  there because they trapdoor into the meta **group** for display while being cross-domain by
  nature.
- **The four researchers are drawn nowhere at all.** `web-researcher`, `api-researcher`,
  `ai-researcher` and `cli-researcher` are in the domain groups, so the fold does not carry them,
  and there is no `rsrch` column, so the grid does not either. That is
  [EDITOR-10](../../editor.md), whose behavioural half landed on 2026-08-06 — **researchers do
  receive assignments** — and whose design-gated half, the column, is still open.

So the panel can place **14 of the roster's 18 agents**. The wire lets the model name any of the 18
on an edge, so what a grid alone would fail to draw is bounded below by what a skill's own default
reach already touches — and that alone is this:

| Skill's domain                 | Agents its default reach touches          | In the grid | In the fold |  **Placed nowhere** |
| ------------------------------ | ----------------------------------------- | ----------: | ----------: | ------------------: |
| `web` / `api` / `ai` / `cli`   | dev, researcher, tester, `pm`, `reviewer` |           2 |           2 |  **1** (researcher) |
| `mobile` / `desktop` / `infra` | `pm`, `reviewer` only                     |       **0** |           2 |                   0 |
| `shared`                       | all 12 domain agents, `pm`, `reviewer`    |           8 |           2 | **4** (researchers) |
| `meta`                         | whatever its authored row and crafts name |      varies |      varies |              varies |

Two consequences, and both are binding:

1. **The fold is not optional and cannot be a fold.** For a `mobile`, `desktop` or `infra` skill the
   4 × 2 grid is **entirely empty** and every edge the change makes is in the labelled block. Those
   are 52 of the 238 shipped skills. A diagram that hides them behind a `＋` is a diagram that shows
   nothing for a fifth of the catalogue.
2. **A grid alone would silently omit a change it made** for every `web`/`api`/`ai`/`cli` and
   `shared` skill — 173 of 238. That is word for word the failure
   [§D3.6](./phase-d-spec.md#build-could-remove-a-skill-now-and-that-is-a-real-change) forbids:
   _"Building the pipeline that produces removals before the row that renders them is how a proposal
   ends up silently omitting a change it made."_

**The rule, and it is a rule rather than a list:** _every reached agent that the grid has no cell for
is drawn as a labelled full-width cell beneath it._ Defined that way — by what the grid could not
place, never by `domainId === "meta"` — the block is correct today **and** correct on the day
EDITOR-10 lands and the researchers move into a column, with no change to this code.

**The options panel's own fold is defined by the list**, which is precisely the mechanism by which
the researchers fall through it. Do not copy that definition, and do not change the panel's fold in
this work — it is a shipped surface and EDITOR-10 is its tracker row.

**In a proposal the block is not folded and carries no `＋`**, because only the touched agents are
drawn — usually two — and a disclosure inside a disclosure is one press too many. The panel folds
because it lists all six whether or not they are assigned; a proposal lists none that are not.

##### 11.5 One grid per skill, reached from its row — and the arithmetic that decides it

**Decision: per-skill grids, all closed on arrival, each revealed by pressing its own row.** The
`91g` row list is unchanged and remains what a proposal opens as.

**The three alternatives, and why each loses:**

| Considered                                                                   | Rejected because                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-skill grids, always open**                                             | The arithmetic below. It also falsifies §9's own sentence — _"A 10-change proposal like `91g`'s is around 15rem, so the cap is headroom rather than a crop"_ — on the day it lands                                                                                                                                                                        |
| **One aggregate grid with per-cell counts**                                  | It breaks the design's one law for this component: _"the word in the cell **is** the state — the design has no legend and no icons"_ (`matrix-grid.tsx`'s own docblock). A count is not a state, and a count cannot say **which** skill or at what load                                                                                                   |
| **Grid only for skills whose assignments changed, additions staying a list** | It splits one object into two treatments on a distinction the visitor cannot see before opening either. And an addition's edges are exactly where the interesting content is: `web-testing-vitest` arrives `preloaded` on `web-tester` and `lazy` on the four other agents it reaches, so a pure addition drawn as a list is the case that loses the most |

**The arithmetic. Declared figures — measure them, do not trust them.** `:root` is `font-size: 110%`,
so `1rem` renders at `17.6px`; borders and viewport units are the two things that deliberately do not
scale.

| Part                       | Declared                                     | Renders                  |
| -------------------------- | -------------------------------------------- | ------------------------ |
| One cell                   | `h-5` = `1.25rem`                            | `22px`                   |
| Row gap                    | `gap-[0.125rem]`                             | `2.2px`                  |
| Four domain rows           | `4 × 22 + 3 × 2.2`                           | `≈ 94.6px`               |
| Column-label row + its gap | `pt-[0.125rem] pb-[0.25rem]` over `text-7_5` | `≈ 19px`                 |
| **One grid**               |                                              | **`≈ 114px` ≈ `6.5rem`** |
| The proposal's cap         | `max-h-[21rem]`, on the `<section>`          | `369.6px`                |

Three open grids fill the cap. `91g`'s drawn ten-change proposal would carry **seven**, at roughly
`798px` of grid alone — a little over **twice** the whole block's ceiling, before a single heading,
row, quote or footer.

**The footer does not scroll away**, and that is worth stating because it removes one argument
rather than supplying one: `proposal.tsx` puts the cap on the `<section>` as `flex flex-col`, gives
the body `min-h-0 overflow-y-auto` and both the header and the footer `shrink-0`, so `Apply` is
always on screen. Always-open grids therefore cost a long scroll rather than an unreachable button —
which is still the wrong default, because nobody asked for it.

**At one skill** it is one press. **At twenty** it is the same list `91g` draws, twenty rows tall,
with twenty presses available and none required — the cost of the feature is exactly zero until
someone wants it.

**Disclosures are independent, not an accordion**, and the open set is keyed by skill id in the
proposal component's own `useState`. Two consequences, both wanted: opening two grids to compare
them works, and a re-submit naming the same skill leaves its grid open while a re-submit naming
different skills renders closed — with no reset code, no key prop and no third piece of state.
`Discard` unmounts the block, so the set goes with it.

##### 11.6 The cell, state by state — **one notation, one new variant, no new colour**

**The word carries the transition and the chrome carries the AFTER state.** Two rules, and every
cell falls out of them. Re-derive the classes before writing —
`grep -n 'matrixCellVariants' -A 20 packages/ui/src/components/matrix-grid.tsx` — because the table
below was read on 2026-08-26.

| `before` → `after`        | Word         | cva `state`         | Border                                        | Fill                  | Ink                         |
| ------------------------- | ------------ | ------------------- | --------------------------------------------- | --------------------- | --------------------------- |
| `null` → `null`           | ``           | `empty`             | `border-divider` `#e4e0d4`                    | none                  | `text-rule` `#cfcabb`       |
| `lazy` → `lazy`           | `lazy`       | `lazy`              | `border-matrix-border` `#d8d3c4`              | `bg-matrix` `#f2f0e8` | `text-matrix-ink` `#5f5c52` |
| `preloaded` → `preloaded` | `pre`        | `preloaded`         | `border-brand-border` `#dcbd85`               | `bg-wash` `#f7eeda`   | `text-brand-ink` `#a06a1c`  |
| `null` → `lazy`           | `→ lazy`     | `lazy`              | as `lazy`                                     | as `lazy`             | as `lazy`                   |
| `null` → `preloaded`      | `→ pre`      | `preloaded`         | as `preloaded`                                | as `preloaded`        | as `preloaded`              |
| `lazy` → `preloaded`      | `lazy → pre` | `preloaded`         | as `preloaded`                                | as `preloaded`        | as `preloaded`              |
| `preloaded` → `lazy`      | `pre → lazy` | `lazy`              | as `lazy`                                     | as `lazy`             | as `lazy`                   |
| `lazy` → `null`           | `lazy →`     | **`removed` (new)** | `border-divider` `#e4e0d4`                    | **none**              | `text-faint` `#8b8778`      |
| `preloaded` → `null`      | `pre →`      | **`removed` (new)** | `border-divider` `#e4e0d4`                    | **none**              | `text-faint` `#8b8778`      |
| no sub-agent for the pair | ``           | `empty`             | as untouched, `aria-hidden`, `cursor-default` | —                     | —                           |

**The arrow is U+2192 with one space on each side it has a neighbour on**, so `→ pre`, `pre →` and
`lazy → pre` are the same notation with `∅` drawn as nothing. Its **position is the direction**:
leading means arriving, trailing means leaving, medial means moving. Nothing is minted — §11 already
established that glyph as this project's transition notation, this is its second use in the phase
after §4's openers, and `matrix-grid.tsx`'s own docblock writes the preload cycle as
`empty → lazy → preloaded → empty` on the very component whose states these cells report.

**Amber goes on the `after` half only**, which is §11's own rule for the changed row applied one
level down and is the amber law read correctly: `→ pre` and `lazy → pre` sit in amber because the
visitor is getting preloaded; `pre → lazy` sits in the grey `lazy` chrome because they are giving it
up; `pre →` takes no amber at all because they are getting nothing.

**One new cva variant, `removed`, and it fills the one gap the existing three left.** `empty` never
carries a word — `matrix-grid.tsx` renders `cell.state ?? ""` — so "hairline chrome with a word in
it" was unreachable and is free. Its ink is `text-faint` `#8b8778`, which is `91g`'s **own** state-word
colour (`.prw`), so a departing edge and a proposal's own state track speak in one grey. It measures
`3.60:1` on `#ffffff`, above the `2.4:1` dimmed cell the owner ruled is the design as intended —
which matters because `color-contrast` is held out of the axe gate permanently and nothing else
would catch a word nobody can read.

**The four removal treatments that were weighed and rejected**, so none is re-proposed:

- **A removal colour.** There is none, and inventing one is forbidden. `.claude-design/README.md`'s
  palette table carries no error colour at all, and amber is reserved and already load-bearing here.
  See [§11.1](#111-the-removal-row--the-gap-is-closed) for why `text-destructive` is the wrong
  instrument rather than a missing one, and why **this section adds no dependency on
  [EDITOR-51](../../editor.md)**.
- **Strikethrough.** `grep -rn 'line-through\|text-decoration' .claude-design/design/*.html apps packages --include='*.tsx'`
  returns `text-decoration:none` on links and nothing else outside `node_modules` — the app and the
  design have no strikethrough vocabulary — and at `text-7` (`0.4375rem`) a rule through `pre` is a
  smudge.
- **A `−` mark.** U+2212 is already the **collapse** glyph on the meta fold in this very panel and
  on `Hinge` in the column above it. A third meaning on one surface is a collision.
- **Opacity on the grid's wrapper.** It was the answer while a grid could only be all-added or
  all-removed. **It is wrong now**: ruling 2b puts `load` on the wire per edge, so one skill's grid
  can hold an addition, a change and a removal at once, and a treatment on the wrapper cannot say
  which cell is which. Direction is per-cell because mixing is per-cell.

**Fitting the longest word.** `lazy → pre` is eleven characters of IBM Plex Mono at `text-7`
(`0.4375rem`, `7.7px` at the app's `110%` root) with `tracking-[.03em]`. The grid renders at
`w-[17.25rem]` (`≈303.6px`); the `auto` label column takes `≈41px` and three gaps `6.6px`, leaving
`≈128px` per column at two columns and `≈85px` at three. **Declared, not measured** — the criterion
that settles it is [T25](#1111-success-criteria-for-the-diagram), which reads `scrollWidth` against
`clientWidth` in a real browser rather than trusting this paragraph.

**Hover, focus and empty, stated because the bar asks for every state:**

- **A diff cell has no hover and no focus.** It is a `<span>`, not a control; it is not in the tab
  order and it carries **no focus ring**, per `packages/ui/CLAUDE.md`'s own rule that _"a thing that
  cannot take focus should not carry a rule about being focused."_
- **It must not be `cursor-pointer`.** `matrixCellVariants`' base string carries it, so a read-only
  cell merges `cursor-default` over it — exactly as the inert gap span in `matrix-grid.tsx` already
  does. A pointer affordance with no operability is the defect `packages/ui/CLAUDE.md` calls out on
  `LatticeCell`, and the cva hands it to you by default.
- **Empty.** A skill row whose transitions are **all** `null → null` draws no grid, no block and **no
  disclosure control** — its disclosure track is blank and the row is a `<span>`, because a
  disclosure that reveals nothing is a dead control. Its state track is empty too, for the one rule
  in [§11.1](#111-the-removal-row--the-gap-is-closed): there is nothing the visitor ends up with. It
  is the state a proposal reaches by naming a skill that reaches nobody. **Zero shipped skills reach
  nobody today**, which is a measurement rather than a guarantee — a marketplace skill or one added
  from GitHub can:

  ```sh
  bunx tsx -e 'import {BUILT_IN_MATRIX} from "./packages/matrix/src/vendor/generated/matrix.ts";
  import {resolveAssignment} from "./packages/matrix/src/index.ts";
  const c=BUILT_IN_MATRIX.categories;
  console.log(Object.values(BUILT_IN_MATRIX.skills).filter(s=>
    resolveAssignment({id:s.id,domainId:c[s.category].domain,categoryId:s.category}).length===0).length)'
  ```

**The row's state word is a SUMMARY of what the visitor ends up with, and the grid is the truth.**
`preloaded` when any surviving edge is preloaded, `lazy` when edges survive and none is, **empty when
none survives**. `91g`'s own fixture is that rule — and it has to be, because `web-testing-vitest`
arrives `preloaded` on `web-tester` and `lazy` on the four other agents it reaches, so `91g`'s
`Vitest / preloaded` row was **already** a lossy summary of five edges the day it was drawn. The
disclosure is the repair for a defect the design has, not an embellishment on one it does not.

**Geometry.** The grid renders at the width it has in the options panel — `18.5rem` less the panel's
`px-[0.625rem]` gutter, i.e. **`w-[17.25rem]`** — so it reads as the same object rather than as a
4 × 2 field stretched across the main column. It is indented to the row's name track (`ml-[0.875rem]`)
so it hangs under the name and not under the mark, with `mt-[0.375rem]` above and `mb-[0.875rem]`
below: `91g`'s own `6px` and `14px`, doing the same two jobs they do between headings and groups.

##### 11.7 The disclosure row

**`91g`'s row grows a fourth track and becomes a `<button>`.** Both are new, and the second one
amends [§10](#10-the-proposal--what-91g-actually-draws)'s _"Rows are not interactive"_, which was
written when there was nothing on a row to reach.

```
grid-cols-[0.875rem_1fr_auto_1.25rem]     ← was 0.875rem 1fr auto
```

**Every row carries the fourth track, including the ones with nothing to disclose**, for the same
reason §11 already gives for the mark track: one name column has to serve every kind of row, and an
agent row beside a skill row must line up.

| State             | Treatment                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Rest, collapsed   | `＋` U+FF0B, `font-mono text-10 font-normal text-dots` `#c4c0b3`                                               |
| Rest, expanded    | `−` U+2212, same classes                                                                                       |
| Hover (whole row) | glyph → `text-ink` `#242320`; row band `bg-row-hover` `#faf9f5`, bled to the body's padding edges              |
| Focus-visible     | `outline-none focus-visible:ring-1 focus-visible:ring-ring` — the package's one focus treatment, no substitute |
| No grid to show   | track empty, and **the row is a `<span>`, not a button**                                                       |

The glyph pair and its `text-dots` → `text-ink` hover are lifted verbatim from the meta fold's own
button in `skill-options-panel.tsx`, which is the disclosure control inside the diagram being reused
— so the affordance the visitor learns in the panel is the one they meet in the proposal.

The hover band uses the roster's bleed idiom (`-mx-1 w-[calc(100%+0.5rem)] px-1` on the assignment
row) against the proposal body's `px-[0.9375rem]`, so the fill reaches the block's content edges
instead of stopping at the text.

**A disclosure is not a rejection.** `Apply` still applies the proposal whole; nothing gains a
checkbox, an undo or a per-row veto. [Open question 5](#for-the-owner) — _"Can individual rows in a
proposal be rejected?"_ — is untouched and stays open, and it is named here because a row that is now
a control is a row somebody will reach for next.

**Agent rows get no disclosure**, because an agent is a cell rather than a grid. Their fourth track
is empty and they remain the plain text `91g` draws. That gives the reviewer a one-line check: in a
proposal, every `<button>` inside the body is a skill row.

##### 11.8 Accessibility — **a diff conveyed only by colour is not a diff**

**The grid is read-only, so nothing in it is a control**, and the direction is carried by an arrow's
position and by a fill — neither of which reaches anybody who is not looking at it. The words have to
be in the tree, and **`→` must never be one of them**: a screen reader announcing "rightwards arrow"
between two state words says nothing a listener can act on.

| Element                      | Role / element                         | Accessible text                                                 |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| The grid                     | `role="group"`                         | `<skill name> sub-agents` — e.g. `Vitest sub-agents`            |
| A **touched** cell           | `<span>`, no role                      | `<Domain> <role>, <transition>` — the four forms below          |
| An **untouched** cell        | `<span aria-hidden="true">`            | none. Not announced at all                                      |
| A slot with no sub-agent     | `<span aria-hidden="true">`            | none, exactly as today                                          |
| Column labels and row labels | `aria-hidden="true"`                   | none — every cell's own text carries both coordinates           |
| A labelled block cell        | `<span>`, no role                      | `<agent id>, <transition>` — e.g. `web-researcher, added, lazy` |
| The disclosure row           | `<button aria-expanded aria-controls>` | its visible text; the `＋`/`−` is `aria-hidden="true"`          |

**The four transition sentences**, and they are the whole of what a cell says:

| Cell               | Announced as                          |
| ------------------ | ------------------------------------- |
| `null → lazy`      | `Web developer, added, lazy`          |
| `lazy → preloaded` | `Web tester, lazy becoming preloaded` |
| `preloaded → lazy` | `Web tester, preloaded becoming lazy` |
| `lazy → null`      | `API developer, removed, was lazy`    |
| unchanged          | `Web developer, preloaded`            |

`becoming` rather than `to`, because `preloaded to lazy` is ambiguous about direction when heard
without punctuation. **`preloaded`, never `pre`** — the abbreviation is a visual compression and the
full word is the one the store, the schema and this document all use.

Notes, each load-bearing:

- **The visible word is `aria-hidden` and the sentence is `sr-only`.** `aria-label` on a bare
  `<span>` is not exposed — `role="generic"` prohibits naming from the author — so the text goes in
  the tree as text. `add-skill-dialog.tsx`'s `<span className="sr-only">Category for {name}</span>`
  is the app's existing use of that utility.
- **`null → null` is silent; `lazy → lazy` is not.** The distinction is exact: a cell with **no edge
  on either side** is `aria-hidden`, because four rows of `not assigned` around two real edges is
  noise that buries the answer. A cell holding an edge that **does not move** is announced
  (`Web developer, preloaded`), because "React stays preloaded here" is the context a listener needs
  to judge the change beside it. So the grid reads aloud as the skill's reach, with the movements in
  it — never as a field of absences.
- **Full role words, not the abbreviations.** The columns are drawn `dev` and `test`; the sentence
  says `developer` and `tester`. `ROLE_COLUMNS` already carries both (`{ id: "developer", short:
"dev" }`), so nothing is invented.
- **`MatrixGrid` does not compose the sentence.** The caller supplies it whole, because only the
  caller knows the direction, the skill and the words. See
  [§11.9](#119-what-changes-in-packagesui--a-mode-not-a-sibling).
- **The disclosure row is announced by its visible text** — mark, name, state word. No `aria-label`,
  so the accessible name and the visible label cannot drift apart.
- **Nothing here is a live region.** The proposal's header is already `role="status"` and it is
  deliberately on the header alone, so expanding a grid does not re-announce the block.

**The existing interactive grid announces less than this one will**, and that is a shipped defect
rather than a licence: `matrix-grid.tsx` puts `aria-label={`${row.label} ${cell.label}`}` on the
cell button, which **overrides** the state word inside it, so a screen-reader user cycling a cell in
the options panel hears `web dev` and never hears `lazy`, `pre` or nothing. It is filed as
`2026-08-26-a-matrix-cells-aria-label-overrides-the-word-that-is-its-whole-state.md`. **Do not fix
it in this work** — it changes a shipped accessible name that `matrix-grid.stories.tsx` and the
editor's e2e suite both query by, and it is its own change with its own tests.

##### 11.9 What changes in `packages/ui` — **a mode, not a sibling**

**`MatrixGrid` gains a read-only mode. It does not gain a variant, and no second component copies
its classes.**

| Symbol                               | Change                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MatrixGrid`                         | A read-only mode: cells render as `<span>` with `cursor-default` and caller-supplied accessible text; no `onCycle`, no focus ring                          |
| `MatrixCell`                         | Gains the caller-supplied accessible sentence. In read-only mode it is **required**, not optional                                                          |
| `MatrixAgentCell` (**new, hoisted**) | `skill-options-panel.tsx`'s local `LabelledAgentCell`, moved here and given the same read-only mode                                                        |
| `matrixCellVariants`                 | **One added `state`, `removed`.** [§11.6](#116-the-cell-state-by-state--one-notation-one-new-variant-no-new-colour). The existing three are byte-identical |
| `skill-options-panel.tsx`            | Deletes its local `LabelledAgentCell` and imports `MatrixAgentCell`. **Nothing it renders changes**                                                        |
| `matrix-grid.stories.tsx`            | Existing stories unedited; new ones for the read-only mode                                                                                                 |

**Why a mode and not a sibling**, measured against `packages/ui/CLAUDE.md`:

- _"cva variants are exported beside the component… The shared variants are how those stay in step; a
  second copy of the classes is how they drift."_ A sibling would import `matrixCellVariants` and
  still duplicate the `gridTemplateColumns` expression, the `gap-[0.125rem]`, the column-header span's
  six classes, the row-label span's six, and the inert-gap rule — **five things that are the diagram**,
  sharing only the one thing already shared.
- The cell branch is already a conditional (`cell ? <button> : <span>`). Read-only is a third arm of
  a branch that exists, not a new structure.
- The owner asked to **reuse** the diagram. One component is what that means.

**`MatrixAgentCell` takes plain props — a label string, a state, an optional handler — and never a
`SubAgent`.** `packages/ui` has no dependency on `@workspace/matrix` (`grep -rn '@workspace/matrix'
packages/ui/src` returns nothing) and this must not be the change that adds one.

**`role="table"` was considered and rejected.** ARIA's `table` requires `row` children; the grid is a
flat CSS grid whose direct children **are** the cells, so rows would have to be `display: contents`
wrappers — a construct with a long history of dropping semantics in exactly the browsers this has to
work in. §11.8's per-cell sentence carries both coordinates instead, which is what the interactive
grid already does through its `aria-label`.

**Stories are the tests here.** `packages/ui/CLAUDE.md`: _"a component with no story is a component
with no coverage — and the story is the only place its contract is written down."_ One claim per
story, through the accessibility tree. The read-only mode owes at minimum: a cell is not a button; a
touched cell's accessible text names the direction; an untouched cell is not in the tree; and the
grid is not in the tab order. And **axe runs in `error` mode**, so a nameless control or a bad role
fails `bun run test` rather than appearing in a panel.

##### 11.10 The data the renderer needs

**`proposal.tsx` has landed** — `apps/editor/src/features/configure/components/proposal.tsx`,
untracked in the working tree as of 2026-08-26, exporting `Proposal`, `ProposalGroup`, `ProposalRow`
and `ProposalBlock`. **This section is a delta against that file, not a green field.** Read it first.

| Symbol               | Change                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ProposalGroup.verb` | `"added" \| "changed"` → `"added" \| "removed" \| "changed"`                                                               |
| `ProposalRow`        | A skill row gains its **transitions**: agent id → `{ before, after }`, each `LoadState \| null`. An agent row carries none |
| `ProposalRow.state`  | Rule: the after-summary, **empty when nothing survives**. [§11.1](#111-the-removal-row--the-gap-is-closed)                 |
| `ProposalRow.amber`  | Follows the after-summary. No removal-specific rule                                                                        |
| `Row`                | The fourth grid track; becomes a `<button>` when it has a transition to disclose                                           |
| `ProposalBlock`      | Holds the open set — `useState`, keyed by skill id, empty at mount                                                         |

**A transition is `{ before, after }` and not a `LoadState` plus a direction flag.** The pair is the
whole state — the word, the cva variant, the amber and the accessible sentence all fall out of it —
so there is no second field that can disagree with it and no `direction: "added"` on a cell whose
`before` says otherwise. **Only edges that move or exist need an entry**; an agent absent from the
record is `null → null` and draws the `empty` cell.

**`enabled` collapses into `before`/`after` and does not survive as a field.** `liveLoad` in
`skill-options-panel.tsx` already treats a disabled row as unassigned — _"a switched-off row reads as
unassigned here"_ — so `enabled: false` on either side is `null`. One projection, written once, and
the diff never has to hold two ways of saying "not carried".

**A skill row carries transitions and an agent row cannot**, which is a discriminated union on
`subject` rather than an optional field plus a comment. That is
`meta-design-expressive-typescript`'s call at step 3 of the workflow and not this document's to
mandate; what **is** mandated is that an agent row with a grid must not be a state the type admits.

**One derivation, never two.** The grid must be built from **the same candidate `PersistedConfig`
that `Apply` writes**, never re-derived beside it. Two derivations of one value agree until they do
not, and the pin between them cannot fail — which is a class this repository has already filed twice.
That is sharper now than it was under the old wire: the model authors edges, so `defaultAssignmentsFor`
and the emitted `assignments` are two different answers to one question and **exactly one of them may
reach the grid**. Phase D owns the candidate;
[§D3.3](./phase-d-spec.md#d33-layer-2--existence) is amended to say so.

**Phase C renders none of this**, because Phase C produces the zero-change proposal and nothing else
([§12](#12-the-zero-change-proposal-and-what-phase-c-actually-renders)). The component, the mode,
the stories and the types are Phase C's; the **producer** is Phase D's. That split is why this
section can be specified at all — unlike the removal glyph this document once refused to invent,
every figure here is drawn from a component that exists and can be seen in Storybook the day it
lands.

##### 11.11 Success criteria for the diagram

**Numbered past the existing gaps** so a report can cite them without collision. The `F25`–`F28` gap
in [Functional](#functional) stays as it is.

| #   | Criterion                                                                                                                                                        | How to verify                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F31 | A skill row with a transition is a `<button>` with `aria-expanded="false"`; pressing it reveals a `group` named `<skill> sub-agents` and flips it to `"true"`    | Storybook play function on `ProposalBlock` with a fixture proposal, plus one e2e once Phase D produces one                                                                      |
| F32 | An **agent** row is never a button                                                                                                                               | Beside F31, in the same story: the `Sub-agents` group's rows have no `button` role. F31's control                                                                               |
| F33 | A touched cell's accessible text names the domain, the full role word, the direction and the load — e.g. `Web tester, added, preloaded`                          | Read through the a11y tree, and **all four transitions in one story** — added, removed, changed and untouched — so no arm is asserted without its siblings                      |
| F34 | A `null → null` cell is **not in the accessibility tree**, while a `lazy → lazy` cell **is**                                                                     | Beside F33, in the same story: the first coordinate's `queryByText` returns null and the second's does not. Each half is the other's control                                    |
| F35 | A diff cell is not a button and is not in the tab order                                                                                                          | `queryByRole("button")` inside the grid returns nothing; `Tab` from the disclosure lands on the next row                                                                        |
| F36 | Every agent the change touches is drawn — in the grid **or** in the labelled block, never nowhere                                                                | Unit: for a `web` skill (a researcher edge), a `mobile` skill (grid entirely empty) and a `shared` skill (four researcher edges), the drawn agent set equals the transition set |
| F37 | **A ONE-SKILL grid holding an addition, a change and a removal draws all three correctly.** The mixed case, which ruling 2b makes ordinary rather than exotic    | One story, one grid, `toStrictEqual` on the four cells' words: `→ pre`, `lazy → pre`, `pre →`, `lazy`. **This is the criterion the per-grid opacity design would have failed**  |
| F38 | A `removed` row carries no `＋` and an **empty** state track; an `added` row beside it carries both                                                              | One story holding both, asserted against each other. Neither half means anything alone                                                                                          |
| F39 | The heading forms are exact: `Skills · 2 removed`, `Sub-agents · 1 removed`                                                                                      | Byte-exact `toHaveText`, mirrored in the e2e constants rather than imported from the product                                                                                    |
| F40 | A skill whose every transition is `null → null` has no disclosure control, no grid and an empty state track                                                      | One story. The row is a `<span>`                                                                                                                                                |
| F41 | **The proposal's diagram and the panel's diagram agree.** After `Apply`, opening the skill's options panel shows the cells the proposal drew as its `after` half | e2e, Phase D. The single assertion that makes "one derivation, never two" checkable rather than aspirational                                                                    |
| F42 | **A proposal's `install` and `scope` rows are unproducible under the clamp.** A model answer naming `eject` on a `plugin` entry yields no changed row            | Unit against `composer-proposal.ts` once Phase D lands. It is [§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting)'s clamp asserted rather than assumed  |

| #   | Geometry                                                          | How to verify                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G12 | The diff grid is the **same width** as the options panel's grid   | Two live `boundingBox()` reads — open a skill's panel, read `[data-slot="matrix-grid"]`; open a proposal grid, read the same slot; assert equal within 1px. A relationship, not a coordinate    |
| G13 | Opening every grid in a proposal does not push `Apply` off screen | With all grids open, `applyButton.boundingBox()` is inside the viewport. `.prf`'s `shrink-0` is what makes this true, and this is what says it stays true                                       |
| G14 | The block still respects its cap with grids open                  | `section.clientHeight <= 21rem × rootFontSize`, **measured** — `packages/ui/CLAUDE.md` § "A class in the DOM is not a class in effect", where an `h-[26rem]` reported 696px while declaring 416 |

| #   | Technical                                                                        | How to verify                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T19 | **The three existing cva states are byte-identical.** Only a fourth key is added | `git diff -- packages/ui/src/components/matrix-grid.tsx` touches no line of `empty`, `lazy` or `preloaded` inside the `cva(` call                                                                                              |
| T20 | The options panel renders exactly what it rendered before                        | Its existing stories and e2e specs green **unmodified**; the only diff in `skill-options-panel.tsx` is the deleted component and the added import                                                                              |
| T21 | No new colour token, no new type step, no new shadow                             | `git diff -- packages/ui/src/styles/globals.css` is empty for this section. The new `removed` variant is `border-divider` + `text-faint`, both declared                                                                        |
| T22 | `packages/ui` still has no dependency on `@workspace/matrix`                     | `grep -rn '@workspace/matrix' packages/ui/src packages/ui/package.json` returns nothing                                                                                                                                        |
| T23 | No `cursor-pointer` reaches a read-only cell                                     | Measure `getComputedStyle(cell).cursor === "default"` in a story. The cva's base carries the pointer, so asserting the class is absent proves nothing                                                                          |
| T24 | Every new story passes axe in `error` mode                                       | `bun run test` from `packages/ui`. `color-contrast` stays held out — it is an owner ruling of 2026-08-07, not a pending fix                                                                                                    |
| T25 | **The longest word does not overflow its cell**, at two columns and at three     | `cell.scrollWidth <= cell.clientWidth` on a `lazy → pre` cell, measured in the browser. [§11.6](#116-the-cell-state-by-state--one-notation-one-new-variant-no-new-colour)'s arithmetic is declared and this is what settles it |

##### 11.12 What this section deliberately does NOT do

| Excluded                                       | Why                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A `rsrch` column in the options panel**      | [EDITOR-10](../../editor.md) owns it. §11.4's block rule makes the diff honest **without** it, and stops depending on it the day it lands                                                                 |
| **Fixing the interactive cell's `aria-label`** | A shipped accessible name two suites query by. Filed as a finding; its own change, its own tests                                                                                                          |
| **Editing the three existing cva states**      | T19. The cva is the shared thing and the options panel renders from it; a fourth key is additive, an edited third is not                                                                                  |
| **Widening the wire**                          | Nothing needs widening — [§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting). The two things worth reporting are reported, not fixed                                              |
| **Producing `install` / `scope` changed rows** | Ruling 2b puts them outside the feature; §11.3 clamps them in Phase D and F42 asserts the clamp. The rows stay designed and unproduced                                                                    |
| **Per-row accept / reject**                    | A disclosure reveals; it does not veto. Open question 5 stays open                                                                                                                                        |
| **Deleting the `Sub-agents` group**            | It is not redundant — see the amendment to phase-d-spec §D3.6. The decisive reason: the grids are **closed by default**, so without that group a proposal's opening view says nothing at all about agents |

#### 12. The zero-change proposal, and what Phase C actually renders

**A proposal with nothing in it is a real state — the model understood you and there is nothing to
do — and the design has no drawing of it.** It is also, with no model wired, **the only state Phase C
can render.** Those two facts collapse into one piece of work, which is why the proposal is
buildable and testable in this phase at all.

**What renders, part by part:**

| Part        | Zero-change state                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Container   | Unchanged — same `.prop` chrome                                                                                                    |
| Header      | The echoed sentence, unchanged. The total slot reads **`no changes`**                                                              |
| Body        | **Absent entirely.** No groups, no rows, and no `border-t` — an empty bordered box is furniture, and there is nothing to enumerate |
| Reason line | Carries the explanation. In Phase C, verbatim: `No model is connected yet — nothing was sent and nothing changed.`                 |
| `Discard`   | Present and enabled                                                                                                                |
| `Apply`     | Present and **`disabled`**                                                                                                         |

**`no changes` is new copy.** The design's template is `<n> + ' changes'`, which yields `0 changes` —
a string that reads as a broken template rather than an answer. `no changes` matches the app's own
voice for empty states: `No skills match this filter.` in `configure-screen.tsx`, and
`"no skills — base agent"` recorded on `--color-roster-empty`. Proposed, not verified.

**The reason-line sentence is carried over from this document's first draft, not from the design.**
The design has no such state, so there is nothing to verify it against. Em dash is **U+2014**, the
app's own separator for this construction (`Ejected — this copy is yours.`). **One string, because
there is one composer** — the mode removal took away the only reason there might have been two — and
one string is one thing to un-write when Phase D lands.

**`Apply` is `disabled` whenever the proposal carries zero changes.** A general rule, not a Phase C
carve-out — it will still be right when a model is wired and returns nothing to do.

- **Disabled rather than absent**, because a footer that grows a button when a model connects is a
  layout changing shape for a reason the user cannot see. `add-skill-dialog.tsx`'s confirm is the
  precedent for `disabled` meaning "not ready yet" rather than "not allowed", and `Button` already
  carries `disabled:pointer-events-none disabled:opacity-40`, so it leaves the tab order. That is
  correct: there is nothing to do there.
- **This is not the "dead control" the float section forbids.** A dead control is one that looks
  operable and is not. A disabled one states its unavailability, which is the whole distinction.

**What `Apply` does.** Recorded so it is not re-decided, and **unreachable in Phase C** because it is
disabled at zero changes and zero is all this phase produces:

1. **To the configuration:** writes the changes. Phase D.
2. **To the draft:** clears it. The sentence has had its effect, and leaving it invites an identical
   second submit. Note the three verbs differ deliberately — **submit** does not clear the draft
   (nothing has happened yet), **`Discard`** does not clear it (they may want to rephrase), **`Apply`**
   does.
3. **To the slot:** sets it to `null`, so the proposal leaves the DOM.

**There is no fourth effect.** This list used to have one — `setComposerMode(null)`, clearing the
mode pin so the mode could re-derive. There is no mode and no pin, so `Apply` touches the
configuration, the draft and the slot and nothing else.

**Clearing the draft brings the suggestion chips back**, which is not a special case: the chips
follow `draft.trim() === ""` live (§4), and `Apply` empties the draft, so the composer returns to its
opening state in one press. Nothing in the chip code knows `Apply` exists.

**What `Discard` does:** clears the slot to `null`, leaves the draft alone, and **returns focus to
the text area** — the block the visitor was in has just left the DOM, and focus must not fall to
`<body>`. Because the draft survives, the chips stay absent, which is correct: the visitor is
rephrasing a sentence, not starting one.

### Should have

Nothing. Every item below the line is either out of scope or an owner question.

### Must NOT have — fence this explicitly

| Excluded                                                                      | Why                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ANY mode — a track, a state field, a per-mode string, an auto-selection**   | **Ruling 1.** See [THE COMPOSER HAS NO MODES](#the-composer-has-no-modes). This is the row that matters most; the design draws three modes and looks complete                                                                                                                                                                                |
| **Anything that records which suggestion chip was used**                      | Ruling 2. A stored `lastChip`, a `source` discriminator, a per-chip placeholder or a per-chip wire field is a mode wearing a chip. §4 and [T17](#technical)                                                                                                                                                                                  |
| **A third suggestion chip**                                                   | Two openers carry the whole of what the two cut modes carried. An `Explain…` opener in particular is `ask` restored. §4                                                                                                                                                                                                                      |
| **Any AI provider, SDK or dependency**                                        | Phase D (EDITOR-54), parked on the owner for a key, a gateway and Turnstile                                                                                                                                                                                                                                                                  |
| **Any worker route**                                                          | Same. `apps/server` is not touched by this phase at all                                                                                                                                                                                                                                                                                      |
| **Any API key, secret or env var**                                            | Same                                                                                                                                                                                                                                                                                                                                         |
| **Any streaming, SSE or partial-output handling**                             | `decisions.md` §3 records that an SSE route does not fit `@hono/zod-openapi`'s JSON response model and would cost the `hc<AppType>` client its typing. Not a Phase C shape                                                                                                                                                                   |
| **Any prompt, system prompt or catalogue projection**                         | `decisions.md` §3 costs it at ~11,500 tokens. Phase D                                                                                                                                                                                                                                                                                        |
| **Any structured-output schema for a model response**                         | Phase D. The wire is `skillEntrySchema` with `assignments` promoted to an array (owner ruling 2b) — **not** the `{ skillIds, agentPins?, prose }` an earlier revision of this document named. **§10–§12 define the proposal's RENDERING contract, which is a UI shape and not a wire shape** — mapping a model's answer onto it is Phase D's |
| **A `recommended` filter chip, or a `recommended` mark on a suggestion chip** | **Ruling 4.** See [The `recommended` chip is prohibited](#the-recommended-chip-is-prohibited). This phase builds chips for the first time, so the prohibition now has a plausible way in                                                                                                                                                     |
| **The roster chat thread (`91h`)**                                            | An unlocked sibling exploration, and ruling 3 settled the question without it. Undo per turn, a second roster tab and a conversation history are all outside this phase                                                                                                                                                                      |
| **Per-row accept / reject inside the proposal**                               | `91g` draws no per-row control and lists it as open. A proposal is applied whole or discarded whole                                                                                                                                                                                                                                          |
| **A removal row in a proposal**                                               | Nothing in this phase can render one. See §11 and the owner questions — this is now a real gap rather than a fenced-off mode capability                                                                                                                                                                                                      |
| **A `find` mode**                                                             | Cut by the design; the filter bar does it                                                                                                                                                                                                                                                                                                    |
| **Any change to `packages/ui/src/components/segmented.tsx` or `chip.tsx`**    | §5. The `cva`, the `track` variant, the `size: "mode"` arm and `--shadow-pill` were all for the mode track and are all moot                                                                                                                                                                                                                  |
| **A fifth `Button` variant**                                                  | One call site does not earn a shared variant                                                                                                                                                                                                                                                                                                 |
| **A component-render test library**                                           | `apps/editor` has none by decision, and adding one is a decision this phase does not get to make                                                                                                                                                                                                                                             |
| **Any change to `ui-store.ts` at all**                                        | See [State](#state). This phase adds no store field, so the persisted hazard is not merely sidestepped — it is out of reach                                                                                                                                                                                                                  |
| **Any change to the `AGENT_EFFORTS` scale**                                   | Phase A's trap, tabled in `README.md`. Nothing here touches it                                                                                                                                                                                                                                                                               |

---

## The `recommended` chip is prohibited

**Ruling 4: the concept of "recommended" is removed completely from the editor and the CLI.**

**It is a prohibition rather than a removal, because there is nothing to remove.** Measured
2026-08-26 and re-derivable:

```sh
grep -rniI "recommend" apps/editor/src apps/editor/e2e
```

returns **nothing**. The only hits anywhere are the word inside one skill's description under
`packages/matrix` (Qdrant's "recommendation API") and ordinary English in `apps/www` ("the
recommended default"). There is no component, no store field, no filter and no type.

**So the risk is entirely in the design source.** `.claude-design` draws a `recommended` filter chip
beside the domain chips. It is dead. **Do not build it**, do not add it to the filter bar, and do not
add a "recommended" mark to a proposal row, a skill cell or a stack tile. A future reader working
from the design file will find it drawn and complete, exactly as they will find the three modes.

**And this phase builds chips for the first time, which is a new way in.** §4's suggestion chips are
a row of chips above the composer; the prohibited one is a chip in the filter bar. They are different
controls with different jobs, and neither the suggestion chips nor a proposal row may acquire a
`recommended` label, mark or variant. The prohibition is on the concept, not on a location.

**The related parked question is closed by this.** `README.md` tabled _"whether the filter bar's chip
is `Recommended` (design) or `Selected` (editor)"_ as undecidable from either source. Ruling 4
decides it: the shipped chip is `Selected` and the design's `Recommended` is prohibited. **This
phase does not touch `filter-bar.tsx`** — that file is on the do-not-touch list and the chip is
already correct — so this section exists to stop a change, not to make one.

**This is not a criterion Phase C can prove green**, because a prohibition on building something has
no positive assertion. The grep above is the only check, and it is a check on the whole app rather
than on this phase's diff.

---

## The slot conflict

**This is the central problem and it must be solved, not deferred.**

`MarketplaceButton` is `sticky bottom-5 z-40 w-fit` at the foot of the same `<main>` the composer
docks to. A full-bleed composer sticky at `bottom: 0` occupies roughly the bottom `5rem` of the
viewport at rest, and **more with the suggestion chips on screen — which is the opening state — and
more again with a proposal open**. The button sits at `bottom: 1.25rem` with a height around
`2.2rem`, which is squarely inside that band, and at `z-40` against the dock's `z-60` it goes
**under** it.

**`position: fixed` is not available as an escape.** `MarketplaceButton`'s docblock records it
having already been tried and rejected there (EDITOR-35): fixed put the button in the viewport's
bottom-left corner, which the nav rail already owns, and _"a constant `left` cannot fix that either,
because the page grid is centred once the window passes its max width"_ —
`mx-auto max-w-[105.25rem]` in `src/routes/route-components.tsx`. `e2e/README.md` states the same
rule as a convention: _"`position: fixed` is not available inside this layout… it is the wrong
mechanism rather than a number to tune."_

### The honest answer

**The design does not know this button exists.** It draws no marketplace control anywhere, and it
hands the column's sticky foot to the composer outright. This is a collision between a shipped
feature and a design that was drawn without it, and **the resolution of where the marketplace
control belongs is an owner ruling, not a developer's call.** Flag it as such.

**Ruling 5 settles the mechanism but not the placement.** _"The marketplace button floats — it keeps
its sticky-inside-the-column mechanism."_ So the arrangement below is now the ruled mechanism rather
than a defensible guess: nothing becomes `fixed`, the sticky mechanism moves one level up to a
wrapper, and EDITOR-35 stands. What is still open is **where the control belongs** now that the
composer owns the column's foot — which stays [an owner question](#for-the-owner).

**`position: fixed` was tried there and rejected, and ruling 5 restates that.** Do not reopen it.

### The smallest defensible arrangement in the meantime

**One sticky wrapper at the foot of `<main>`, holding the marketplace row above the composer.**

```
<main class="… px-gutter … pb-30">
  …
  <div class="pointer-events-none sticky bottom-0 z-60">   ← the one sticky element
    <div class="pointer-events-auto w-fit">                ← MarketplaceButton, unchanged in kind
      …
    </div>
    <Composer />                                           ← pointer-events-auto; owns -mx-gutter
  </div>
</main>
```

Why this is the smallest thing that is defensible:

- **It introduces no layout constant.** The marketplace row rides above the composer because it is
  the previous sibling, so the composer's height is intrinsic and never measured. Any arrangement
  that pins the button at `bottom: <composer height>` would be inventing exactly the kind of
  constant `MarketplaceButton`'s docblock says it _"carries no layout constant of its own."_
- **It keeps EDITOR-35's ruling intact.** Nothing becomes `fixed`; the sticky mechanism simply moves
  one level up, from the button to its wrapper. The button's x position is unchanged — still the
  column's left content edge — so `railGap` in `marketplace.spec.ts` is unaffected and that spec
  must stay green untouched.
- **It preserves what `w-fit` was actually for.** The docblock's reason is _"any width it does not
  need is a strip of skill cells that cannot be clicked."_ A full-width wrapper would take that back
  by the front door, so the wrapper is `pointer-events-none` and each child is `pointer-events-auto`
  — the strip beside the button falls through to the grid beneath. This is the guarantee honoured
  rather than merely its letter.
- **The composer's own geometry is exactly as designed:** `bottom: 0`, full-bleed, hairlines top and
  bottom, content inset, no shadow.
- **The 26px gap is the design's own.** The composer's `mt-[1.625rem]` lands as the air between the
  button and the dock's first child; nothing new is chosen.
- **The dock's height is intrinsic and varies**, because it has two conditional children — the
  suggestion chips with a blank draft, a proposal after a submit, never both (§4). That is exactly
  why the geometry criteria measure the **dock** rather than the band, and why
  [G9](#geometry--the-assertion-e2ereadmemd-mandates) exists beside
  [G8](#geometry--the-assertion-e2ereadmemd-mandates): each conditional child has to be cleared in
  the state where it is on screen, and no single measurement can see both.

**Changes this requires to `marketplace-dialog.tsx`:** drop `sticky bottom-5 z-40` from
`MarketplaceButton`'s wrapper, keep `w-fit`, and **update the docblock** — its reasoning still holds
in full and only the mechanism's location changes. Do not delete that docblock; EDITOR-35 is the
only record of why fixed is unavailable in this column, and `e2e/README.md` cites it.

### The alternative, named and rejected

**Moving the marketplace control into the roster footer.** Rejected for three reasons: its docblock
argues it _"belongs to no section, because which marketplace is loaded is a statement about
everything in the column rather than about any one part of it"_; the roster footer is Phase B's
territory (the preview entry point plus Install) and the design states _Install is the panel's only
filled element_, so a second control there needs its own design; and it would overturn what
EDITOR-35 settled without a ruling to overturn it with.

**Putting the marketplace control inside the composer's control row** is also rejected. The design
specifies exactly three children in `.dctl` in order, and the mode removal took the count down to
two — so the row now has an empty middle and looks like it has room. It does not: the hint sits on
the left content edge and the send button on the right, and a third control between them would put
a catalogue switcher inside the composer's own action row. §5 states the row's contents.

### A known interaction this phase does not fix

`SkillOptionsPanel` is `absolute top-0 z-30`. A panel opened on a skill cell near the viewport
bottom is already partly covered by the `z-40` marketplace button today; the dock makes the covered
band taller. The design addresses none of this. **Name it, do not build for it** — dismissing or
scrolling the panel is a separate change with its own design question.

---

## State

The composer needs a **draft** and a **proposal**. Both are local `useState` in the composer
component, and **nothing is persisted.**

### There is no shared state, and `ui-store.ts` is not touched

**This is the mode removal's second-largest simplification**, after §5's.

An earlier draft added `composerMode: ComposerMode | null` and `setComposerMode` to `useUiStore`,
with a long defence of why the field must not reach `partialize` and must not bump the store's
`version`. **The field is gone, so the whole hazard is out of reach rather than merely sidestepped.**

| What this document used to owe                                            | Now                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A `ComposerMode \| null` field and a setter in `ui-store`                 | **Nothing.** `git diff -- apps/editor/src/stores/ui-store.ts` must be empty — [T9](#technical)                 |
| A defence of keeping it out of `partialize` and off the `version`         | Moot. There is no field to keep out                                                                            |
| `ui-store.test.ts`'s two pins as the mechanical guard                     | Still green, still unedited, and now green for free rather than as a near miss                                 |
| An exported `hasConfiguration` predicate and its unit spec                | **Deleted.** Nothing derives anything from the configuration                                                   |
| `composer-modes.ts` in `lib/`, because a store may not import a component | **Deleted.** With no store field there is no reason for a `lib/` module at all — see [Files](#files-to-create) |

**The mode field went in the store for exactly one reason and it no longer holds**: more than one
thing read it (the placeholder, the send label, the hint and the submit handler). There is now one
string in each of those slots, written at module scope in `composer.tsx`, read by nothing that needs
to coordinate.

**The persisted hazard is therefore not this phase's subject at all**, and the paragraphs this
document used to spend on it are deleted rather than restated. What is worth carrying forward, for
the reviewer only: `ui-store`'s `merge` returns `current` on a failed parse **without** calling
`reportIssue`, there is still no `migrate`, and `ui-store.test.ts`'s _"writes exactly the three
arrangement fields"_ is what would go red if a field reached `partialize` by accident. That spec is
on the [do-not-touch list](#files-not-to-touch).

### Draft → local `useState` in the composer component

**Not the store.** One component reads it. `MarketplaceForm` in `marketplace-dialog.tsx` is the
precedent the codebase already carries: it is mounted only while open precisely so its `useState`
initialisers re-read on every open. A half-typed sentence surviving a reload is the "reloading into
an open dialog" case squared.

**Three things read the draft and all three are in the same component**: the send button's
`disabled`, the suggestion chips' presence (§4), and the submit handler. They read one value with one
predicate — `draft.trim() === ""` — and that predicate is written once.

**The draft's change handler does one thing: set the draft.** It used to carry the mode pin as well,
which is deleted with the modes. If a change handler here grows a second write, that write is a mode.

### Proposal → local `useState` in the composer component

Same reasoning as the draft. **The slot the first draft specified as `string | null` widens to
`Proposal | null`** — it does not move, and nothing else moves with it. See
[The outcome slot is widened, not moved](#the-outcome-slot-is-widened-not-moved).

`Proposal` is a **rendering** contract, not a wire contract, and the difference is fenced in
[Must NOT have](#must-not-have--fence-this-explicitly). **It is exported from `proposal.tsx`**
alongside the component that renders it — with the modes gone there is no `lib/` module for it to
live in, and a data shape exported beside its one renderer is the smaller arrangement. What the
component renders from:

```
Proposal = {
  sentence: string                 // the submitted sentence, echoed. NOT the live draft
  groups: ProposalGroup[]          // empty in Phase C
  reason: string | null            // the .dfn line
}
ProposalGroup = {
  subject: "Skills" | "Sub-agents"
  verb: "added" | "changed"
  rows: ProposalRow[]              // the heading's count is rows.length
}
ProposalRow = {
  name: string
  state: string                    // "preloaded", "sonnet · med", or "lazy → preloaded"
  amber: boolean                   // whether `state` — or its `after` half — takes .prw.am
  added: boolean                   // whether the mark track draws the amber ＋
}
```

**The total in the header is the sum of every group's `rows.length`**, which is exactly `91g`'s own
arithmetic (`propSk.length + propAg.length`) and is why §11 rules one row per changed _field_ rather
than per subject.

**`sentence` is the submitted one, not the live draft.** `91g` echoes what was sent, and the draft
goes on being editable underneath — which is also why editing the draft **clears** the proposal
rather than rewriting its header.

**Phase D changes the producer, not this shape.**

### Concurrency — Phase A has LANDED

**This section described Phase A as in flight. It is not: A0–A6 all landed on 2026-08-26**, so the
warning is retired and replaced by what shipped. Read the files rather than trusting this list:

- `ui-store.ts` now carries `rosterGroupBy` and `stackCollapsed` alongside `rosterCollapsed`, and
  `partialize` writes all three. **Phase C does not touch that file at all** — no field, no
  `partialize`, no `merge`, no `version`, no schema.
- `globals.css` gained the three colours A0 owed, **under names this document guessed wrong.** See
  [Tokens](#tokens-this-phase-needs), which is corrected and is the authority.
- A6's ink rename landed: `--color-roster-ink` is gone and `--color-ink-primary` is the name.

**Phase B lanes may still be moving.** `packages/compile` and the preview dialog are theirs; Phase C
touches neither. Any conflict is reported to the orchestrator rather than resolved by overwriting.

---

## What a submit returns — **settled by ruling 3**

**This section used to say "surface this to the owner. Do not resolve it." It has been resolved.**

`.claude-design/README.md` listed it under "Open / not designed" as _"the biggest open item"_, and
the composer entry said the exploration _"argued for a reviewable proposal (added skills and agents
listed, with the reason preload was set) rather than a silent mutation… Not yet designed into the
assembled screen."_ It is **absent from `DECISIONS.md` entirely.**

**Ruling 3, 2026-08-26: a proposal is ALWAYS shown before anything is applied.** The reviewable
changeset wins over the silent mutation, and `91g` — an exploration sketch that was never drawn into
the assembled screen — becomes the design source by default, because it is the only drawing there is.

**The ruling outlived the modes it was written about**, and that is worth stating plainly: it read
"in both modes" when there were two, and it reads the same with none. A proposal is what a submit
returns, full stop.

**Two things follow, and both are already written into this document.**

1. **The proposal is Phase C's work.** §10 transcribes `91g`, §11 designs the changed row it does not
   draw, and §12 designs the zero-change form nobody drew.
2. **`decisions.md` §3's third layer keeps its landing place.** It says: _"Because the design leans
   toward a reviewable proposal rather than a silent mutation, layer 3 has somewhere to put its
   verdict and no tool-use loop is needed."_ That lean is now a ruling, so `judgeSelection`'s verdict
   has somewhere to go and **Phase D needs no repair loop.** Ruling it a silent mutation would have
   needed one and probably tool use; that branch is closed.

### What `Chat Composer Lab.dc.html` option `91g` actually draws

**Moved.** The full transcription — CSS rule by CSS rule, with every colour mapped to its existing
token and every copy form taken off the fixture — is now
[§10 The proposal](#10-the-proposal--what-91g-actually-draws), because it is build instructions
rather than background.

### What `91g` does not draw, and where each one is answered now

`91g` leaves eight things open. Ruling 3 answers the first, this document answers five more, and two
are still open:

| What `91g` leaves open                                   | Answer                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether a proposal is shown at all                       | **Ruling 3.** Always                                                                                                                         |
| Where the proposal lives relative to the dock            | **§9.** A child of the dock, above the band, absent from the DOM when null — the slot this document already reserved                         |
| Whether an edit returns one too                          | **Ruling 3.** Yes. The question was written as "does `adjust` return one" and survives the modes unchanged: every submit does                |
| What a removal or edit row looks like                    | **§11 designs the edit row.** The removal row is deliberately not designed and is now a live gap — see the [owner questions](#for-the-owner) |
| What a zero-change proposal looks like                   | **§12.** New design, and the only state Phase C can render                                                                                   |
| What happens to the composer's text while one is pending | **§9 and §12.** Submit leaves the draft, `Discard` leaves it, `Apply` clears it. Editing it clears the proposal                              |
| Whether individual rows can be rejected                  | **Still open**, and fenced out of this phase. Applied whole or discarded whole                                                               |
| Whether the reason line generalises past preload         | **Still open.** It is one hardcoded sentence in `91g`'s fixture, and Phase C renders one hardcoded sentence of its own                       |

### Why the slot's design survived both rulings

The first draft kept three answers open — a reviewable proposal, a silent mutation, or the `91h`
roster thread — by putting the outcome in a slot that could hold any of them. That was the right
bet and it cost nothing to make, and it has now survived two rulings rather than one:

- **Reviewable proposal won.** The proposal renders in the slot and the state widens from
  `string | null` to `Proposal | null`. The composer, the band and the keyboard contract are
  untouched. That is exactly what this document predicted.
- **The modes were then removed and the slot did not move either.** It gained a sibling — the
  suggestion chips, §4 — and its own contents were unaffected, because a proposal was never a
  per-mode answer. A slot that survives having its surrounding control model deleted is the
  strongest evidence it was in the right place.
- The one thing that would have foreclosed both was putting the outcome **inside** the band, which
  would have broken the two-children rule and coupled a proposal's layout to the field's. It is
  deliberately not there, and it stays not there.

---

## Constraints

### Files to modify

**AMENDED 2026-08-26 by the diagram ruling.** The mode removal had taken this list to four by
deleting every `packages/ui` component change and the store change. The ruling puts one back —
`matrix-grid.tsx` and its stories — and the type step comes off, because it was already in the tree
when this table claimed it was owed.

| File                                                                    | Change                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/editor/src/features/configure/components/configure-screen.tsx`    | Wrap `MarketplaceButton` and the new `Composer` in the one sticky foot wrapper described in [The slot conflict](#the-slot-conflict). **It no longer needs to pass `config`** — nothing derives a mode from it                                       |
| `apps/editor/src/features/configure/components/marketplace-dialog.tsx`  | `MarketplaceButton`: drop `sticky bottom-5 z-40`, keep `w-fit`, update the docblock to say the sticky mechanism moved to the wrapper and why (ruling 5 keeps the mechanism, so the reasoning survives whole)                                        |
| `packages/ui/src/styles/globals.css`                                    | ~~`--text-12_5`~~ — **already present, and so is `"12_5"` in `FONT_SIZES`.** Re-derived 2026-08-26: `grep -n 'text-12_5' packages/ui/src/styles/globals.css packages/ui/src/lib/utils.ts` returns both. This phase's diff to this file is **empty** |
| `packages/ui/src/lib/utils.ts`                                          | **Nothing.** See the row above                                                                                                                                                                                                                      |
| `packages/ui/src/components/matrix-grid.tsx`                            | **§11.9.** A read-only mode, a fourth `removed` cva state, and `MatrixAgentCell` hoisted from the options panel                                                                                                                                     |
| `packages/ui/src/components/matrix-grid.stories.tsx`                    | New stories for the read-only mode. The existing ones are unedited                                                                                                                                                                                  |
| `apps/editor/src/features/configure/components/skill-options-panel.tsx` | Deletes its local `LabelledAgentCell` and imports `MatrixAgentCell`. **Renders nothing new** — T20                                                                                                                                                  |
| `apps/editor/src/features/configure/components/proposal.tsx`            | **§11.10.** The removal verb, the transitions, the fourth row track, the disclosure and the grid. **This file has landed** — read it before planning against it                                                                                     |
| `apps/editor/e2e/pages/configure-page.ts`                               | Mount the composer page object                                                                                                                                                                                                                      |

**Four files this document used to list and no longer does**, each because the mode track is gone:
`packages/ui/src/components/segmented.tsx`, `segmented.stories.tsx`, `chip.tsx`, and
`apps/editor/src/stores/ui-store.ts`. All four are now on the do-not-touch list.

### Files to create

| File                                                         | Purpose                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/editor/src/features/configure/components/composer.tsx` | `Composer`, with module-local sub-components above it (the suggestion chip row, the send button) — the file convention in this feature directory. The copy constants and the line cap live at module scope here                                   |
| `apps/editor/src/features/configure/components/proposal.tsx` | The proposal block: header, groups, rows, reason line, footer. **Its own file**, because it is the largest single piece of new UI here and it is what Phase D reaches for. It also exports the `Proposal` / `ProposalGroup` / `ProposalRow` types |
| `apps/editor/e2e/pages/composer.ts`                          | The page object — all locators live here, never in a spec. Holds the chip and proposal locators too                                                                                                                                               |
| `apps/editor/e2e/specs/composer.spec.ts`                     | The behaviour                                                                                                                                                                                                                                     |

**Two files this document used to list are deleted with the modes**:
`apps/editor/src/features/configure/lib/composer-modes.ts` (it existed to hold `ComposerMode` and
`hasConfiguration` where `ui-store` could import them without importing a component — there is no
store field, so there is nothing to arrange) and `composer-modes.test.ts` (it existed to pin
`hasConfiguration`'s truth table — the function is gone). **Neither was ever written**, so this is a
shorter list rather than a deletion from the tree.

**So this phase writes no unit test.** That is not a gap being accepted quietly: there is no pure
function left with a truth table, `apps/editor` has no component-render library by decision, and
every remaining claim is about rendered output, which is what the e2e suite asserts on. Say so in the
report rather than adding a test that pins a constant to a copy of itself.

### Files NOT to touch

| File                                                                                                                       | Why                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/components/segmented.tsx`, `segmented.stories.tsx`, `chip.tsx`                                            | **§5.** Every change this document used to ask of them existed for the mode track. `git diff` on all three must be empty — [T8](#technical)                                                                                                                             |
| `packages/ui/src/components/button.tsx`                                                                                    | No fifth variant. The send button composes; the proposal's footer uses `outline` and `primary` as they are — [T16](#technical)                                                                                                                                          |
| `apps/editor/src/stores/ui-store.ts`                                                                                       | **This phase adds no store field.** [T9](#technical) is a `git diff`, and it is now the whole check rather than half of one                                                                                                                                             |
| `apps/editor/src/stores/ui-store.test.ts`, `persisted-schema.ts`                                                           | The persisted hazard. Both stay green and unedited; if either goes red, the change is wrong                                                                                                                                                                             |
| `apps/server/**`                                                                                                           | No route, no key, no provider in this phase                                                                                                                                                                                                                             |
| `packages/matrix/**`                                                                                                       | No catalogue change                                                                                                                                                                                                                                                     |
| `apps/editor/src/features/configure/lib/derive.ts`                                                                         | Nothing here derives from the catalogue — and with `hasConfiguration` deleted, this phase no longer imports even the `ConfigSelection` type from it                                                                                                                     |
| `apps/editor/src/routes/search.ts`, `lib/use-catalog-first.ts`, `stores/config-store.ts`                                   | **The composer reads none of them.** They were the mode rule's inputs; there is no mode rule                                                                                                                                                                            |
| `apps/editor/src/features/configure/components/roster-panel.tsx`, `stack-grid.tsx`, `filter-bar.tsx`, `domain-section.tsx` | Phase A's lane — and `filter-bar.tsx` is where a `recommended` chip would be wrongly added (ruling 4)                                                                                                                                                                   |
| `apps/editor/e2e/specs/marketplace.spec.ts`                                                                                | It must stay green **unmodified** — that is the proof the slot fix did not break EDITOR-35. Its `CENTRED_VIEWPORT` is a module-local `const` and is **not** exported, so [G2](#geometry--the-assertion-e2ereadmemd-mandates) mirrors the value rather than importing it |
| `apps/editor/e2e/specs/shared-link.spec.ts`                                                                                | Untouched, and now for a stronger reason than before: the composer does not read `fromId`, does not derive anything from an arriving payload, and has nothing to do with a shared link at all                                                                           |
| `apps/www/**`                                                                                                              | `packages/ui` is shared with the Astro site. The only change there is a new `--text-*` step, which is purely additive                                                                                                                                                   |
| `todo/**`                                                                                                                  | Sub-agents do not edit the trackers. The orchestrator does, as each lane lands                                                                                                                                                                                          |

### Tokens this phase needs

**No raw hex in any component.** The one permitted arbitrary-value idiom is a token inside the
brackets — `shadow-[inset_0_0_0_1px_var(--color-brand-glow)]` is the shipped precedent.

| Hex       | Role                                                  | Status                                                                             |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `#242320` | send fill, typed text, a proposal row's name          | `--color-ink` ✅                                                                   |
| `#3a382f` | send hover                                            | `--color-ink-2` ✅                                                                 |
| `#4a473c` | `Discard`'s ink                                       | `--color-ink-3` ✅ (via `Button variant="outline"`)                                |
| `#fdfdfc` | dock background                                       | `--color-column` ✅                                                                |
| `#ffffff` | band background, proposal ground                      | `--color-cell` ✅                                                                  |
| `#dcd7c9` | band hairlines, proposal outline, footer rule         | `--color-hairline` ✅                                                              |
| `#ece9e0` | the proposal's header/body rule                       | `--color-tree-border` ✅ — a second duty; comment it                               |
| `#cfcabb` | `Discard`'s border                                    | `--color-rule` ✅ (via `Button variant="outline"`)                                 |
| `#a9a292` | `Discard`'s hover border                              | `--color-dialog-border` ✅                                                         |
| `#7a7669` | the reason line                                       | `muted-foreground` ✅                                                              |
| `#b4b0a2` | the hint, the proposal's total                        | `--color-roster-off` ✅                                                            |
| `#8b8778` | the key glyph, group headings, row state              | `--color-faint` ✅                                                                 |
| `#5f5c52` | the echoed sentence, **a suggestion chip's label**    | `--color-matrix-ink` ✅ — a second duty; comment it                                |
| `#161513` | **a suggestion chip's label on hover**                | `--color-ink-primary` ✅ — **A6 landed the rename**                                |
| `#b0762c` | the proposal's `＋` mark, **a suggestion chip's `→`** | `--color-brand` ✅                                                                 |
| `#a06a1c` | an amber state word                                   | `--color-brand-ink` ✅                                                             |
| `#a19d90` | placeholder                                           | `--color-field-faint` ✅ — **A0 landed, under a name this document guessed wrong** |

**Every colour this phase needs already exists. Not one is missing**, and the list got shorter rather
than longer: `#eeece4` (`--color-track`) and `#3d3b33` (`--color-track-ink`) were the recessed mode
track and its chip hover, and neither is drawn any more. Nothing was added to replace them — the
suggestion chips reuse `matrix-ink`, `ink-primary` and `brand`, all of which the proposal beside them
already uses.

**Three of the rows above were wrong when this document was written and are corrected.** A0 and A6
landed on 2026-08-26 and chose different names from the ones proposed here:

| This document proposed | A0 / A6 shipped       | Why theirs is the better name                                                                                            |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--color-placeholder`  | `--color-field-faint` | It is not only a placeholder: its comment reads _"a field's own furniture: its ⌕ glyph, and the composer's placeholder"_ |
| `--color-mode-hover`   | `--color-track-ink`   | It is the recessed block's **label**. This phase no longer uses it at all                                                |
| `--color-roster-ink`   | `--color-ink-primary` | A6's rename. The roster name claimed a panel-specific value that is the design's primary text                            |

**Re-derive before writing, because these are names and names rot:**

```sh
grep -n 'a19d90\|161513\|5f5c52\|b0762c' packages/ui/src/styles/globals.css
```

**A wrong token name here fails silently.** Tailwind v4 emits a utility only for a declared
`--color-*`, so `text-mode-hover` or `text-roster-ink` compiles to nothing at all — no build error,
no lint error, just a chip with no colour. It is the one class of mistake in this document that no
gate catches.

**One addition, and it is the whole of this phase's `packages/ui` diff:**

- **`--text-12_5: 0.78125rem` (12.5px) with `--text-12_5--line-height: normal`.** The scale has 12
  and 13 and no half step between them, and `.dta` is 12.5px. The file's own rule is explicit: _"It
  uses half-pixel steps freely and at these sizes 8px vs 8.5px is a visible weight difference, so
  they are kept rather than rounded."_ **Add `"12_5"` to `FONT_SIZES` in
  `packages/ui/src/lib/utils.ts` in the same change** — the token file says so in as many words, and
  a step tailwind-merge does not know silently drops the text colour beside it.

**`--shadow-pill` is NOT added.** It existed to lift the active mode pill
(`.dsg.on{box-shadow:0 1px 3px rgba(0,0,0,.08)}`), there is no pill, and `globals.css`'s comment that
the app _"has only these two"_ shadows therefore stays true and is not edited. Adding a shadow token
nothing renders would make that comment false on the day it landed.

### Technical constraints

- **Tailwind v4 utilities only.** `rem` everywhere; **px only for borders and viewport units.**
- **`border-radius: 0`, no exceptions.**
- **Named exports only**, kebab-case filenames, one exported component per file with module-local
  sub-components above it. Props are inline object types, never a named `Props` interface.
- **No `forwardRef`** — React 19 passes `ref` as a prop. The text area needs one, for the caret
  placement §4 requires and the focus return §12 requires; it is a plain `ref` prop.
- **No new runtime dependency.**
- **No zustand store is read or written by the composer.** Not `useUiStore`, not `useConfigStore`,
  not `useCatalogStore`. The composer is a leaf with two `useState`s, and that is checkable —
  [T18](#technical).
- **Named module-scope constants with a comment** for every number and every string that is not a
  Tailwind utility: the two chip labels, the placeholder, the send label, the hint, the reason
  sentence, the line cap, the proposal height cap, the platform flag. No bare literals in JSX.
- **The comments are part of the deliverable.** Every non-obvious decision in this codebase carries a
  prose comment naming what was rejected and why, usually with the design turn or tracker id. This
  spec is full of them: the nine rejected float treatments, the ghost send button, the removed
  divider, the plain-Enter ruling, the slot conflict, and the rulings themselves. **Write them down.**
  Do not strip existing ones.
  - **Two comments this phase owes specifically**, because a future reader working from the design
    file will otherwise undo them: **one above the copy constants saying the design draws three modes
    with three sets of these strings and that the modes were removed by owner ruling on 2026-08-26**;
    and one above the suggestion chips saying they are a writing aid rather than a mode, and that
    recording which one was clicked would rebuild the thing that was removed.
- **The first-paint budget is a build gate** (`FIRST_PAINT_BUDGET_BYTES` = 330 KiB, enforced inside
  `vite build`). **This phase is smaller than it was** — no `packages/ui` component change, no store
  field, no mode table — but the proposal is still real UI. Re-derive the current figure rather than
  trusting any number in this document; the build failing is the answer, and it is [T5](#technical).

### Dependencies

- **Requires:** nothing outstanding. **Phase A has landed**, and this phase now needs less of it than
  it did: the mode track's two tokens (`--color-track`, `--color-track-ink`) are unused, and only
  `--color-field-faint` and `--color-ink-primary` are read. See [Tokens](#tokens-this-phase-needs).
- **Blocks:** Phase D / EDITOR-54 — the AI backend has nowhere to render without this, and after
  ruling 3 that is more literally true than it was: the proposal is the thing Phase D fills.
- **Concurrent:** Phase B lanes may still be moving in `packages/compile` and the preview dialog.
  Phase C touches neither. Every Phase C edit to `packages/ui` is **additive**, and any conflict is
  reported to the orchestrator rather than resolved by overwriting.

---

## Accessibility

**Accessibility is the test contract in this app, not a nicety** — the Playwright suite asserts on
accessible names, so a control without one is a control the suite cannot see. The design draws every
control here as a bare word; each still needs a role and a name.

| Element                  | Role                                  | Accessible name                                                                | State                                                                                                                   |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The band                 | `region` (a `<section>` with a label) | `Natural-language composer`                                                    | —                                                                                                                       |
| **The chip row**         | `group`                               | `Prompt suggestions` (`aria-label`)                                            | **Absent from the DOM unless `draft.trim() === ""`**                                                                    |
| **Each suggestion chip** | `button`                              | `Change my setup to…` / `Create a new setup with…` — the visible label exactly | Its own tab stop. Never `disabled`; absent instead                                                                      |
| **Its `→` mark**         | —                                     | —                                                                              | `aria-hidden="true"` — it is a mark, not a word                                                                         |
| The text area            | `textbox`                             | `Composer prompt` (`aria-label`)                                               | `aria-describedby` → the hint's id                                                                                      |
| The send button          | `button`                              | `Send` — **one name, because there is one label**                              | `disabled` while the draft is blank; `aria-keyshortcuts="Meta+Enter Control+Enter"`; `aria-describedby` → the hint's id |
| The key glyph            | —                                     | —                                                                              | `aria-hidden="true"`                                                                                                    |
| **The proposal**         | `region` (a `<section>` with a label) | `Proposal`                                                                     | Absent from the DOM when there is none                                                                                  |
| **Its header**           | `status`                              | —                                                                              | `aria-live` implicit. Text only — the echoed sentence and the total, and **no interactive descendant**                  |
| **Each group**           | `group`                               | `Skills · 7 added` etc., via `aria-labelledby` pointing at the visible heading | —                                                                                                                       |
| **A row's `＋` mark**    | —                                     | —                                                                              | `aria-hidden="true"` — it is a mark, not a word                                                                         |
| **`Discard`**            | `button`                              | `Discard proposal` (`aria-label`)                                              | Visible label stays `Discard`                                                                                           |
| **`Apply`**              | `button`                              | `Apply proposal` (`aria-label`)                                                | Visible label stays `Apply`. `disabled` whenever the proposal carries zero changes                                      |

**Three rows this table used to carry are gone**: the mode track (`radiogroup`, `Composer mode`) and
its two `radio` chips. Nothing replaces them — the suggestion chips are `button`s in a `group`, not
radios in a radiogroup, and §4 says why that distinction is the whole point.

Notes, each of which is load-bearing:

- **The send button's name is `Send` and nothing else.** Adding the glyph pair to the name would have
  a screen reader announce "Send command return-with-hook." The name no longer varies, so it is also
  no longer the thing that tells anyone what mode they are in — nothing does, because there is none.
- **A suggestion chip's accessible name is the string it inserts** (modulo the trailing ellipsis §4
  strips). One string, three duties — visible label, accessible name, inserted text — so there is
  nothing to keep in step and [F29](#functional) can assert the relationship rather than a literal.
- **The chip row is `group`, not `toolbar` and not `radiogroup`.** `toolbar` promises a roving
  tabindex this row does not have; `radiogroup` claims exclusivity and a current value, neither of
  which is true of an opener. `group` with an `aria-label` is what
  `skill-contents-dialog.tsx`, `stack-grid.tsx` and `domain-section.tsx` already use.
- **The chips are absent rather than `disabled`** when the draft is non-blank, so they never appear
  in the tab order leading nowhere. §4 carries the reasoning and its contrast with `Apply`.
- **`aria-keyshortcuts` carries the shortcut** the glyph pair draws. The glyph is hidden, so without
  it the affordance reaches nobody who cannot see it. It is the one standard attribute for this and
  it is assertable.
- **`aria-describedby` on both the field and the button points at the hint**, so what a submit does
  is announced rather than only drawn. Generate the id with React's `useId()`. This is the app's
  stated rule that _a reason goes in the accessible description, never in the name_, applied to a
  description that happens to be visible — and with one hint there is one id.
- **`role="status"` is on the proposal's HEADER, not on the proposal.** A live region announces its
  subtree on change, so wrapping `Discard` and `Apply` in one would make them part of the
  announcement. The header is text only — the echoed sentence and the total — which is exactly what
  should be announced.
- **It is `status`, not `alert`, and that decision is UNCHANGED.** Two reasons and the second is
  mechanical. Semantically it is not a failure: nothing went wrong, so it should wait for a pause
  rather than interrupt — unlike `marketplace-dialog.tsx`'s `Note`, which is `alert` because the
  visitor asked for a catalogue and did not get one. Mechanically, `ConfigurePage.importNotice` is
  `page.locator("main").getByRole("alert")`, and a second `alert` inside `main` would make that
  locator ambiguous under Playwright's strict mode — **breaking specs this phase never touched.**
- **The chip row is NOT a live region either**, and it appears and disappears as the draft changes.
  A row that announced itself every time a field emptied would be noise; its appearance is a direct
  consequence of an action the visitor just took, which is the case live regions exist to avoid.
- **The reason line is not in the live region**, and in Phase C that is where the no-model sentence
  lives. Deliberate: live regions should be terse, the sentence is on screen and in the accessible
  tree either way, and `no changes` in the header is itself an accurate announcement of the outcome.
  The criteria assert the two separately.
- **Rows take no role.** They are not interactive — `91g` draws no per-row control — and a row is
  addressable through its group:
  `getByRole("group", { name: "Skills · 7 added" }).getByText("Vitest")`.
- The design draws **no focus state anywhere** in this surface. Every focusable element here — the
  two chips, the text area and the send button — takes the package's one ring.

---

## Success criteria

### Functional

**Renumbered, and shorter.** Eleven criteria were deleted with the modes — the four mode strings,
the two-radio census, the arrow-key movement, the one-tab-stop claim, the `Apply` strict-mode
collision, and the six that carried auto-selection, the keystroke pin, the shared-address case and
`hasConfiguration`'s truth table. **Eight are new and every one of them is about the suggestion
chips.** The list below runs F1–F24, then F29 and F30.

| #   | Criterion                                                                                                                                                                                                   | How to verify                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | The composer is present at the foot of the main column on load, before any scroll                                                                                                                           | `getByRole("region", { name: "Natural-language composer" })` is visible at scroll 0                                                                                                                                  |
| F2  | **The composer's three strings are exactly these, on a fresh context**: placeholder `Describe your project, or ask for a change…`, send button named `Send`, hint `nothing changes until you apply`         | One e2e test asserting all three. Byte-exact, both against the mirror in `e2e/pages/constants` style rather than by importing the product's constants                                                                |
| F3  | **There is no mode control of any kind.** No radiogroup, no radio, and no button named `build`, `adjust` or `ask`                                                                                           | `getByRole("radiogroup")` count 0 **inside the composer region**, and `getByRole("radio")` count 0 there. Beside a positive: the region's own `getByRole("button")` list is `["Send"]` plus the two chips when shown |
| F4  | **Both suggestion chips are present with a blank draft, named exactly**                                                                                                                                     | `getByRole("group", { name: "Prompt suggestions" }).getByRole("button")` → `toHaveText([…])` with both labels. **Assert the members, not the count** — a count cannot see a swap                                     |
| F5  | **Clicking a chip fills the field with its label, ellipsis replaced by a trailing space**                                                                                                                   | Click `Change my setup to…`, assert the field's value is `Change my setup to ` — trailing space included                                                                                                             |
| F6  | **The relationship holds for BOTH chips, derived rather than hard-coded twice**                                                                                                                             | Loop the two labels in one test: for each, click and assert `value === label.replace("…", " ")`. This is what stops a second prefill table appearing                                                                 |
| F7  | **Clicking a chip focuses the field and puts the caret at the end**                                                                                                                                         | `toBeFocused()`, then `selectionStart === selectionEnd === value.length` read through `evaluate`                                                                                                                     |
| F8  | **The chips disappear once the field has text and come back when it is emptied**                                                                                                                            | Both directions in one test: assert present, `fill("x")`, assert count 0, `fill("")`, assert present again. The negative half alone is green against a composer that renders nothing                                 |
| F9  | **A whitespace-only draft still shows the chips, and the send button is still disabled**                                                                                                                    | `fill("   ")`, assert the chips are present **and** `toBeDisabled()`. This is the one predicate asserted through both of its readers                                                                                 |
| F10 | **Clicking a chip REPLACES the draft rather than appending**                                                                                                                                                | `fill("   ")` (chips still shown), click a chip, assert the value is exactly the prefill with no leading spaces                                                                                                      |
| F11 | The send button is disabled while the draft is blank and enabled once it holds non-whitespace                                                                                                               | `toBeDisabled()` / `toBeEnabled()` around a `fill`                                                                                                                                                                   |
| F12 | Pressing send renders a proposal whose **header** announces the submitted sentence in curly quotes and the total `no changes`                                                                               | `getByRole("status")` `toContainText` the sentence between U+201C and U+201D, and `toContainText("no changes")`. The block is `getByRole("region", { name: "Proposal" })`                                            |
| F13 | The proposal's **reason line** reads, verbatim: `No model is connected yet — nothing was sent and nothing changed.`                                                                                         | `toHaveText` the exact string; em dash **U+2014**. Asserted on its own locator rather than through `status` — see [Accessibility](#accessibility)                                                                    |
| F14 | **The zero-change proposal has no body**: no group, no row, no `＋`                                                                                                                                         | `getByRole("region", { name: "Proposal" }).getByRole("group")` has count 0 — **in the same test as F12**, which is what proves the locator can carry a value                                                         |
| F15 | **`Apply` is present and disabled; `Discard` is present and enabled**                                                                                                                                       | `getByRole("button", { name: "Apply proposal" })` `toBeDisabled()`; `getByRole("button", { name: "Discard proposal" })` `toBeEnabled()`                                                                              |
| F16 | `⌘/Ctrl+Enter` in the field submits — the same proposal appears                                                                                                                                             | Keyboard test (`Control+Enter` on the Linux runner)                                                                                                                                                                  |
| F17 | Plain `Enter` in the field does **not** submit; it inserts a newline                                                                                                                                        | Press `Enter`, assert the proposal region has count 0 **and** that the field's value gained a `\n`                                                                                                                   |
| F18 | Pressing send does not clear the draft                                                                                                                                                                      | Assert the field's value is unchanged after submit                                                                                                                                                                   |
| F19 | Editing the draft after a submit clears the proposal                                                                                                                                                        | Submit, assert the region is present, type one character, assert it has count 0. **The positive half is required** — see [For the tester](#for-the-tester)                                                           |
| F20 | **`Discard` clears the proposal, leaves the draft, and returns focus to the text area**                                                                                                                     | Three assertions in one test: region count 0, field value unchanged, `getByRole("textbox", { name: "Composer prompt" })` `toBeFocused()`                                                                             |
| F21 | **`Discard` does NOT bring the chips back**, because the draft survives                                                                                                                                     | Beside F20: the chip row still has count 0. The sibling of F8 for the other door                                                                                                                                     |
| F22 | **Submitting mutates no configuration.** Snapshot `localStorage`'s `agents-inc:config:v1` before a submit and assert it is identical after                                                                  | `ConfigurePage.storedConfig()` (already exists, returns the raw string) before and after, compared with `toBe`. This is the claim "no model behind it" actually makes, and it is the only assertion that makes it    |
| F23 | **Submitting reports nothing through the app's `[issue]` seam**                                                                                                                                             | A console listener asserting no `console.warn` prefixed `[issue]`. `persistence.spec.ts` holds both directions of that pattern                                                                                       |
| F24 | The marketplace dialog still opens from its button                                                                                                                                                          | The existing `marketplace.spec.ts` test, unmodified                                                                                                                                                                  |
| F29 | **Typing an opener by hand is indistinguishable from clicking its chip.** Type `Change my setup to do X` and submit; separately click the chip, type `do X` and submit. **The two proposals are identical** | Compare the proposal region's `innerText` from both routes with `toBe`. This is the behavioural half of "a chip is not a mode", and it is the assertion that would go red the day someone stores which chip was used |
| F30 | **The chips and the proposal are never on screen together, in both directions**                                                                                                                             | With a blank draft: chips present, proposal count 0. After a submit: proposal present, chips count 0. §4's mutual-exclusion argument, pinned — and each half is the other's control                                  |

**F25 to F28 are deliberately absent.** The gap is where the mode-derivation criteria were, left
open rather than closed up so that a reader holding the previous revision can see that four claims
were removed rather than renumbered. **F29 and F30 sit past the gap on purpose**: they are the two
criteria that carry the whole of ruling 2 — a chip is not a mode, and a chip is not a proposal — and
they should be findable by number in a report without being confused with anything that came before.

### Geometry — the assertion `e2e/README.md` mandates

**A floating control needs a geometry assertion, not a visibility one.** `toBeVisible()` is true of
both elements in every overlap defect there is, and Playwright clicks by dispatching at an element's
box rather than by hit-testing — so neither visibility nor clickability can see one element covering
another. Two live `boundingBox()` reads, printing the overlap in pixels, against the **container**
the control must clear. `railGap` in `marketplace.spec.ts` is the shape and this is its sibling:

```ts
// How much air there is between the marketplace button's bottom edge and the
// composer band's top one. Negative is the overlap, in pixels, which is what a
// failure has to print: "expected true to be false" says nothing a reader can
// act on.
//
// Both boxes are read live, so there is not a single coordinate in here. What
// is asserted is a RELATIONSHIP between two elements that are on screen now —
// and it is asserted against the composer BAND rather than against whichever
// control happens to sit in the overlap today.
const dockGap = async (configure: ConfigurePage) => {
  const band = await configure.composer.band.boundingBox()
  const button = await configure.marketplaceButton.boundingBox()
  if (!band || !button) throw new Error("the band and the button must be drawn")

  return band.y - (button.y + button.height)
}
```

| #   | Criterion                                                                                                                                                                                               | How to verify                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | The marketplace button clears the composer at the suite's viewport                                                                                                                                      | `expect(await dockGap(configure)).toBeGreaterThanOrEqual(0)`                                                                                                                                                                                                                                              |
| G2  | It still clears it where the page grid **centres** rather than fills the window — the width at which a viewport-measured offset goes wrong                                                              | `await page.setViewportSize({ width: 2560, height: 1000 })`, then G1 again. **`CENTRED_VIEWPORT` is a module-local `const` in `marketplace.spec.ts` and is NOT exported**, and that file must stay unmodified — so mirror the value with its own restated reason rather than importing it or exporting it |
| G3  | It still clears it at maximum scroll, where the sticky wrapper comes to rest in flow                                                                                                                    | Scroll to `document.body.scrollHeight`, then G1 again                                                                                                                                                                                                                                                     |
| G4  | The marketplace button still clears the nav rail                                                                                                                                                        | `marketplace.spec.ts`'s existing rail test, **unmodified and green**                                                                                                                                                                                                                                      |
| G5  | The band is genuinely full-bleed: its width equals the main column's                                                                                                                                    | `band.width` vs `main.boundingBox().width`, both live                                                                                                                                                                                                                                                     |
| G6  | The control row does not overflow                                                                                                                                                                       | `band.scrollWidth <= band.clientWidth`                                                                                                                                                                                                                                                                    |
| G7  | At maximum scroll nothing is permanently hidden: the last skill cell's bottom is above the band's top                                                                                                   | Two live boxes at max scroll                                                                                                                                                                                                                                                                              |
| G8  | **A proposal on screen still leaves the marketplace button clear.** With a proposal open, the button must clear the DOCK rather than the band — the dock grew a child and the thing to clear got taller | A second live read: `dock.y - (button.y + button.height) >= 0`, taken with a proposal present. The reason `dockGap` was written against a named element rather than a coordinate                                                                                                                          |
| G9  | **The suggestion chips on screen still leave the marketplace button clear.** The same read with a blank draft, which is the page's opening state — so this is the one every visitor sees first          | `dock.y - (button.y + button.height) >= 0` with the chips present. G8's sibling: the dock has two conditional children and each has to be measured, because they are never both there to be measured at once                                                                                              |
| G10 | **The chips are ABOVE the band, not below it**                                                                                                                                                          | `chipRow.y + chipRow.height <= band.y`, both live. The one geometric claim §4's placement argument makes, and the only thing that would catch it being built the other way round                                                                                                                          |
| G11 | **The proposal's height cap is in effect, not merely declared**                                                                                                                                         | Cannot be measured against a zero-change proposal, which has no body. Measure `clientHeight` in a real browser rather than asserting the class is on the element — `packages/ui/CLAUDE.md` § "A class in the DOM is not a class in effect", where a `h-[26rem]` reported 696px while declaring 416        |

### Technical

| #   | Criterion                                                                                                                                                                                                                                                         | How to verify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Types pass                                                                                                                                                                                                                                                        | `bun run typecheck` from `apps/editor` (`tsc -b --noEmit`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T2  | Lint passes, with no new `eslint-disable`. **Read this one rather than trusting it**: unlike `packages/cli`, the editor's config sets no `reportUnusedDisableDirectives`, so a directive suppressing nothing passes silently here and only a reader will catch it | `bun run lint` from `apps/editor`, plus `grep -rn 'eslint-disable' apps/editor/src/features/configure/components/composer.tsx apps/editor/src/features/configure/components/proposal.tsx`                                                                                                                                                                                                                                                                                                                                  |
| T3  | Unit tests pass — **and this phase adds none**                                                                                                                                                                                                                    | `bun run test` from `apps/editor`. The suite's test count must be **unchanged**, not merely green. `composer-modes.test.ts` was named in an earlier revision's file list and was never written; nothing here has a pure function left to test                                                                                                                                                                                                                                                                              |
| T4  | E2E passes                                                                                                                                                                                                                                                        | `bun run test:e2e` from `apps/editor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| T5  | **The build stays green, which is the first-paint budget's own proof**                                                                                                                                                                                            | `bun run build` from `apps/editor` — the budget plugin fails the build rather than warning                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T6  | **No raw hex in any file this phase touches**                                                                                                                                                                                                                     | `grep -rnE '#[0-9a-fA-F]{6}\b' apps/editor/src/features/configure/components/composer.tsx apps/editor/src/features/configure/components/proposal.tsx` returns nothing                                                                                                                                                                                                                                                                                                                                                      |
| T7  | **The gutter is never a literal.** The dock's horizontal bleed and the band's, the chip row's and the slot's content insets are `-mx-gutter` and `px-gutter`                                                                                                      | `grep -n 'mx-\[\|ml-\[\|mr-\[' apps/editor/src/features/configure/components/composer.tsx` returns nothing. Horizontal _padding_ is read rather than grepped — the send button's `px-[0.9375rem]` and the chip's `px-[0.125rem]` are legitimate and a grep cannot tell them from a hardcoded gutter. **`proposal.tsx` is exempt**: `.dfn` is `margin-right:auto` and `.prm` is `margin-left:auto`                                                                                                                          |
| T8  | **`packages/ui`'s components are untouched.** No `cva` on `Segmented`, no `track` variant, no `size: "mode"` on `chipVariants`, no new story                                                                                                                      | `git diff -- packages/ui/src/components/` is **empty**. This used to be a byte-identical-class-string argument about a `panel` default; it is now a one-line diff check, which is strictly stronger                                                                                                                                                                                                                                                                                                                        |
| T9  | **`ui-store.ts` is untouched.** This phase adds no store field at all                                                                                                                                                                                             | `git diff -- apps/editor/src/stores/ui-store.ts apps/editor/src/stores/ui-store.test.ts apps/editor/src/stores/persisted-schema.ts` is **empty**, and `ui-store.test.ts`'s _"writes exactly the three arrangement fields"_ is green **and unedited**                                                                                                                                                                                                                                                                       |
| T10 | Nothing outside the named files changed                                                                                                                                                                                                                           | `git diff --stat` against the file lists above. **`packages/ui`'s whole diff should be `globals.css` and `lib/utils.ts`** — one token and one array entry                                                                                                                                                                                                                                                                                                                                                                  |
| T11 | The exact copy strings are byte-exact                                                                                                                                                                                                                             | The placeholder and `Send` against `grep -on … ".claude-design/design/Chat Composer Lab.dc.html"` (§3). Both chip ellipses and the placeholder's are one U+2026; the key glyphs are U+2318 + U+21A9 adjacent; the chip mark is U+2192; the proposal echo's quotes are U+201C / U+201D; the reason line's dash is U+2014; the `＋` mark is U+FF0B                                                                                                                                                                           |
| T12 | **No mode anywhere in the diff**                                                                                                                                                                                                                                  | `grep -rniI 'mode\|dockMode\|composerMode\|\bbuild\b\|\badjust\b\|\bask\b' apps/editor/src/features/configure/components/composer.tsx apps/editor/src/features/configure/components/proposal.tsx apps/editor/e2e/pages/composer.ts apps/editor/e2e/specs/composer.spec.ts` — **read the hits rather than requiring zero**, since "install mode" and "asked" are ordinary English. What must be absent is a mode concept: a `ComposerMode` type, a mode tuple, a radiogroup, a per-mode string, `composerMode` in any store |
| T13 | **No `recommended` anywhere in the editor**                                                                                                                                                                                                                       | `grep -rniI "recommend" apps/editor/src apps/editor/e2e` returns nothing. Ruling 4. A whole-app check rather than a diff check, because a prohibition has no positive assertion                                                                                                                                                                                                                                                                                                                                            |
| T14 | **The composer contains no `useEffect`**                                                                                                                                                                                                                          | `grep -n "useEffect" apps/editor/src/features/configure/components/composer.tsx` returns nothing. The chips' presence, the button's `disabled` and the proposal's clearing are all derivations of two `useState`s; an effect here is a mode's residue or a synchronisation bug                                                                                                                                                                                                                                             |
| T15 | **The composer reads no router state**                                                                                                                                                                                                                            | `grep -rn "fromId\|useSearch\|getRouteApi\|useNavigate" apps/editor/src/features/configure/components/composer.tsx apps/editor/src/features/configure/components/proposal.tsx` returns nothing. Nothing about a composer depends on the URL                                                                                                                                                                                                                                                                                |
| T16 | **No new `Button` variant**                                                                                                                                                                                                                                       | `git diff -- packages/ui/src/components/button.tsx` is empty — subsumed by T8, and kept because it is the one a developer is most tempted to break                                                                                                                                                                                                                                                                                                                                                                         |
| T17 | **Nothing records which chip was clicked**                                                                                                                                                                                                                        | `grep -rniI 'lastChip\|chipUsed\|suggestionUsed\|source.*chip\|origin.*chip' apps/editor/src` returns nothing, **and** the composer holds exactly two `useState` calls. Read the component: a chip's `onClick` must have one statement's worth of effect                                                                                                                                                                                                                                                                   |
| T18 | **The composer subscribes to no zustand store**                                                                                                                                                                                                                   | `grep -n "useUiStore\|useConfigStore\|useCatalogStore\|useStore" apps/editor/src/features/configure/components/composer.tsx apps/editor/src/features/configure/components/proposal.tsx` returns nothing. It is a leaf with two `useState`s, and F22's "mutates nothing" is easy to hold when there is nothing to mutate through                                                                                                                                                                                            |

### What is deliberately NOT a criterion

- **No unit test at all, and that is a statement rather than an omission.** The only pure function
  this phase used to own was `hasConfiguration`, which the mode removal deleted. What is left is
  rendered output, which the e2e suite asserts on directly. `apps/editor` has no component-render
  library by decision and adding one is not this phase's call.
- **No unit test asserting the copy constants equal a literal.** They are hand-written constants, so
  a test comparing them to a copy of themselves is the "assertion bound to a constant with the same
  value" anti-pattern — it can only ever be green and it would redden on the intended edit. E2E
  asserts the strings **as rendered**, which is the claim worth making.
- **No criterion pinning the `Apply` strict-mode collision.** It existed because the send button read
  `Apply` in `adjust` mode. The send button is `Send` and there is one of it, so there is nothing to
  collide with — §7 records this so nobody restores the criterion and wonders what it was for.
- **`e2e/pages/composer.ts` mirrors the product's copy strings rather than importing them.** An
  assertion that imports the constant the component renders cannot fail when that constant changes,
  because both sides move together. The mirror is the design. **This covers the chip labels too** —
  and F5/F6 assert the prefill as a **relationship to the mirrored label**, not as a second mirrored
  string, which is the whole point of deriving the prefill from the label.
- **`CENTRED_VIEWPORT`'s value is mirrored, not imported**, because `marketplace.spec.ts` must stay
  unmodified and the const is module-local there.
- **No assertion that a populated proposal renders correctly.** Nothing produces one in this phase,
  so such a test would need a hand-built fixture proposal fed through a door the product does not
  have. §10–§12 are the contract; Phase D is where they become assertable. **Say so rather than
  writing a test that pins the fixture to itself.**
- **No test of `Apply`'s effects.** It is disabled in every state Phase C can reach, so the only
  assertable claim about it is [F15](#functional) — that it is present and disabled. Its three
  documented effects are recorded in §12 for Phase D and are deliberately unverified here.
- **Nothing asserts the chips' amber `→`.** Colour is not machine-decidable in this suite, the a11y
  addon's `color-contrast` rule is held out permanently by owner ruling, and §4 flags the amber as
  the one judgement call for a human reviewer. A test here would pin a class name, which is
  `packages/ui/CLAUDE.md`'s "a class in the DOM is not a class in effect" exactly.

---

## Implementation notes

### For the developer

**Order.** Tests red first — that is the repository's rule and it is the order, not a preference.

1. Write `e2e/specs/composer.spec.ts` and `e2e/pages/composer.ts` against a composer that does not
   exist. **Watch every test fail.** A test that has never failed has not been shown to test
   anything. **There is no unit spec in this phase** — [T3](#technical) says why.
2. The type step in `packages/ui`: `--text-12_5` in `globals.css` and `"12_5"` in `FONT_SIZES`, in
   one change. **That is the entire `packages/ui` diff.** No component file is opened.
3. `composer.tsx` — the copy constants, the field, the control row, the send button, the chips.
4. `proposal.tsx`, and wire the zero-change state into the composer's submit.
5. The sticky foot wrapper in `configure-screen.tsx` and the `MarketplaceButton` change — **last**,
   because it is the change that can break a spec this phase does not own, and doing it last means
   `marketplace.spec.ts` was green immediately before.
6. Green, then `meta-design-expressive-typescript` (that skill only, no sub-agents).
7. **Then run it by hand in the browser.** Passing tests and a working screen are different claims.
   Check, at minimum: the band is full-bleed with no side borders and no shadow; there is no rule
   between the field and the controls; the chips sit **above** the band and vanish on the first
   keystroke; clicking a chip leaves the caret after a trailing space, ready to type; `Enter` makes a
   newline and `Ctrl+Enter` submits; the marketplace button sits clear above the dock at both a
   filling and a centred window width, **with the chips showing**, which is the page's opening state;
   and **the proposal appears above the band and not inside it**.
8. Docs through `codex-keeper`. Then the orchestrator updates `todo/`.

**Decisions already made — do not relitigate:** the float treatment (nine rejected siblings), the
removed divider, the black send button, the cut `find` mode, plain Enter inserting a newline, draft
and proposal both unpersisted, the chips above the field, the chip replacing rather than appending,
and the sticky-wrapper arrangement for the slot conflict.

**And the owner rulings, which are not decisions this document made and cannot be traded away:** no
modes at all; suggestion chips that prefill and record nothing; a proposal always shown before
anything is applied; `recommended` prohibited; the marketplace button floating by its sticky
mechanism; `MenuTrigger` carrying the focus ring (already landed).

**The four things most likely to be got wrong, in order:**

1. **Rebuilding the modes.** The design draws three, `DOCK` has three keys, and there is a
   screenshot. The subtle version is worse than the obvious one: storing which chip was clicked, or
   giving the chips a `pressed` state, is a two-mode track with the track hidden. [T12](#technical)
   and [T17](#technical) are the greps; [F29](#functional) is the behaviour.
2. **Putting the chips below the band.** The owner said "below or above" and §4 rules above with five
   reasons. [G10](#geometry--the-assertion-e2ereadmemd-mandates) is the only thing that would catch
   it.
3. **Touching `packages/ui`'s components.** An earlier revision of this document asked for a `cva` on
   `Segmented`, a `track` variant, a `size: "mode"` arm and `--shadow-pill`. **None of it is wanted**
   and [T8](#technical) is `git diff -- packages/ui/src/components/` being empty.
4. **Adding a second prefill table.** The chip's label and the text it inserts are one string related
   by one derivation. A parallel `{ label, prefill }` table is two strings that will drift, and
   [F6](#functional) is what stops it.

**If a row in this spec does not describe the tree, stop on that row, report it with the command
that proves it, and move on.** Do not invent work to justify a row. Every path, symbol and figure
here was measured on 2026-08-26 against a tree that several lanes have since moved — **and this
document has already been wrong about that tree four times**, all four corrected above: three token
names it proposed that A0 and A6 superseded, and the claim that `ui-store.test.ts` did not exist. It
will be wrong again. Re-derive; do not trust.

**Write a finding** to `packages/cli/.ai-docs/agent-findings/` using
`.ai-docs/agent-findings/TEMPLATE.md` for any anti-pattern fixed, missing standard found, or
convention drift noticed.

**Run no git command that writes.** Read-only git — `status`, `log`, `show`, `diff`, `blame` — is
allowed and useful.

### For the tester

**Happy path:** the three strings; the two chips and what clicking one does; submit by click and by
`Ctrl+Enter`; the proposal appearing with its header, its reason line and its two buttons.

**Edge cases:** empty draft (chips shown, button disabled); whitespace-only draft (chips **still**
shown, button **still** disabled); clicking a chip over whitespace (replaces it); submit then edit
(proposal clears); `Discard` (proposal clears, draft survives, focus returns, **chips stay away**);
plain `Enter` (newline, no submit); a draft longer than the line cap (the field scrolls rather than
growing without bound).

**The chips have a small state space and it is worth testing as cells rather than as a happy line.**
Four, and each is another's control:

| Draft           | Chips  | Send button |
| --------------- | ------ | ----------- |
| `""`            | shown  | disabled    |
| `"   "`         | shown  | disabled    |
| `"x"`           | absent | enabled     |
| `"x"` then `""` | shown  | disabled    |

**Negatives need a channel.** _A negative is only as good as the channel that would carry it._ Before
asserting the chips or the proposal are absent, assert the same locator reports them when they are
present — F8, F14, F17, F19, F21 and F30 must each be paired with a positive **in the same test**,
or they are assertions over a channel that has never carried a value.

**Three of this phase's most important assertions are absence assertions.** F3 asserts there is no
radiogroup and no radio, F14 asserts the zero-change proposal has no group, and F30 asserts the chips
and the proposal never coexist. **All three are green against a composer that does not render at
all**, so each must sit in a test that first proves the locator works — F3 beside the region's own
button list, F14 beside the header assertion, F30 in both directions.

**Geometry, not visibility**, for anything about the slot conflict. `toBeVisible()` cannot see an
overlap, and the dock now has two conditional children that are never on screen together — so G8 and
G9 must both be taken, each in the state where its child exists.

**Watch the console.** At least one spec must assert that submitting reports nothing through the
app's `[issue]` seam. `persistence.spec.ts` holds both directions of that pattern.

**No mocks are needed anywhere in this phase.** Nothing here makes a network call, reads a store or
touches the URL — which is the phase's headline claim and is asserted directly by F22 and T18. **This
is a change from the previous revision**, which needed `shared-link.spec.ts`'s fixture route to drive
the mode derivation; there is no derivation, so there is no fixture.

### For the reviewer

Focus on, in order:

1. **Has a mode been rebuilt?** Not just an obvious one — look for anything that remembers which chip
   was clicked, anything that gives a chip a selected or pressed state, any second field in a
   `useState`, and any branch on the draft's prefix. T12, T17 and F29.
2. **Are the chips above the band?** And does the dock have exactly the two conditional children §9
   draws, never three? G10 and F30.
3. **One predicate, two readers.** The chips' presence and the send button's `disabled` must both
   come from `draft.trim() === ""` written once. Two predicates is two bugs waiting to diverge.
4. **Is the prefill derived from the label, or is there a second table?** F6.
5. **`packages/ui` is untouched except the type step.** `git diff -- packages/ui/` should be
   `globals.css` plus `lib/utils.ts` and nothing else. No `cva` on `Segmented`, no `chipVariants`
   arm, no `--shadow-pill`, no new `Button` variant. T8, T10, T16.
6. **`ui-store.ts` is untouched.** T9. If `ui-store.test.ts` went red and was adjusted rather than
   the change being adjusted, that is a silent reset of every existing visitor's `rosterCollapsed`
   with the alarm switched off.
7. **The gutter.** Any literal margin or padding where `-mx-gutter` / `px-gutter` belongs. Four bugs
   came from exactly this.
8. **The slot conflict.** Does `marketplace.spec.ts` pass **unmodified**? Is the wrapper
   `pointer-events-none` with `pointer-events-auto` children, so `w-fit`'s guarantee actually holds
   rather than merely being written down? Did the EDITOR-35 docblock survive?
9. **The copy strings**, byte-exact — three ellipses, the key glyphs, the chip arrow, the curly
   quotes, the em dash, the `＋`.
10. **Two strings in this phase are NEW** and are the only two not verified against a source: the
    hint `nothing changes until you apply` (§3) and `no changes` (§12). If either has drifted, it
    drifted in implementation.
11. **Amber.** The chip's `→` is the one judgement call in this document — §4 says to challenge it
    rather than wave it through, and gives the fallback. On a changed proposal row, amber goes on the
    `after` half only.
12. **The accessible names**, all thirteen rows of the table, and the `status`-on-the-header choice.
13. **No mode, and no `recommended`** (T12, T13). Both are drawn in the design and both are dead.

---

## Open questions

### Resolved here, with reasons

- **Q: What is the placeholder, now that the two mode placeholders are dead?** →
  `Describe your project, or ask for a change…`, byte-verified from `91j`. It is the design's own
  single-field string and it names both intents.
- **Q: What is the send label?** → `Send`, byte-verified from three sites in the same lab. It is
  honest — the press sends a sentence; the proposal has its own `Apply`.
- **Q: Is there still a hint, and what does it say?** → Yes, and `nothing changes until you apply`,
  which is **new copy**. The mode hints each described a mode; this one describes the ruling that
  outlived them.
- **Q: Is the send button still black?** → Yes. The ghost treatment's only argument was a read-only
  mode, and there is no mode at all. §6 re-derives it in three lines.
- **Q: Where do the suggestion chips go?** → **Above the band**, as a child of the dock beside the
  outcome slot. §4 gives five reasons; the load-bearing one is that the chips and a proposal are
  mutually exclusive by construction, so the dock never draws three things.
- **Q: Do the chips replace or append?** → Replace, which is never destructive because they are
  absent whenever the draft holds anything but whitespace.
- **Q: Do the chips hide once the field has text?** → Yes, on `draft.trim() !== ""` — the same
  predicate that enables the send button, written once.
- **Q: How many chips?** → **Two**, and a third is a design decision with a written reason. The
  specific failure mode is a third opener restoring `ask`.
- **Q: What are they made of?** → `91a`'s `.sug` row laid out horizontally, not `Chip` and not
  `Segmented`. §4 rules both out on their own terms.
- **Q: Does the mode track reuse `Segmented`?** → **The question has no subject.** There is no track,
  `Segmented` is not modified, and §5 records the whole decision as moot so nobody implements it from
  an older revision of this file.
- **Q: Where does the draft live?** → Local `useState`. The proposal too. Nothing reaches a store.
- **Q: What does plain Enter do?** → Inserts a newline. `⌘/Ctrl+Enter` submits.
- **Q: What does a non-Mac keyboard show?** → `Ctrl↩`, with both chords bound everywhere.
- **Q: What does a user see on submit?** → A proposal, above the band, cleared by editing the draft.

### Resolved by the owner rulings of 2026-08-26

- **Q: How many modes?** → **None** (ruling 1). Three → two → zero, all on one day. The design draws
  three and it is superseded.
- **Q: How does the composer know whether you are adding or editing?** → **It does not need to.**
  Intent is in the prompt text, and the proposal shows what changed (ruling 2, §11).
- **Q: What does a submit return — a proposal or a silent mutation?** → **A proposal, always**
  (ruling 3). This was "the biggest open item in the whole design"; it is closed, and `decisions.md`
  §3's third layer keeps its landing place with no repair loop needed.
- **Q: Does the filter bar get a `recommended` chip?** → **No, and it never will** (ruling 4). The
  design draws one and it has no code subject.
- **Q: Is the marketplace button fixed or sticky?** → **Sticky, inside the column** (ruling 5).
  EDITOR-35 stands.
- **Q: Should `--color-roster-ink` be renamed?** → **Done.** A6 landed `--color-ink-primary`.

### For the owner

1. **Where does the marketplace control belong now that the composer owns the column's sticky
   foot?** Ruling 5 settled the **mechanism** — it floats, by the sticky-inside-the-column route —
   but not the **placement**. The design draws no marketplace button at all. The arrangement in
   [The slot conflict](#the-slot-conflict) stacks two floating controls at the foot of one column,
   which was never drawn.
2. **~~What does a REMOVAL row look like?~~ CLOSED by the diagram ruling, 2026-08-26.** It is
   [§11.1](#111-the-removal-row--the-gap-is-closed): `91g`'s row with the amber `＋` taken off the
   mark track and the state track left empty, under a `Skills · N removed` heading, with the
   departing edges drawn in its grid as `pre →` / `lazy →`. **No glyph and no colour were minted**,
   and the question is recorded rather than deleted so nobody re-derives it from a gap. What
   replaced it as an open judgement is (2a) below.

   2a. **Is a removed row emphatic enough?** As designed it is a mark-less name with an empty state
   track. That is honest and it is quiet. The one-line alternative, if the owner wants a removal to
   read at a glance, is recessing the row's **name** to `text-roster-off` `#b4b0a2` — the app's own
   "disabled agents and skills" ink. Rejected in the draft only because a visitor must be able to
   read what they are losing.

   2b. **Are `install` and `scope` inside the feature or outside it?** Ruling 2b says the composer
   _"does not touch sub-agents, scope, install mode"_, and the emitted `skillEntrySchema` carries
   `install` and `scope` regardless. [§11.3](#113-what-the-wire-carries-and-the-one-thing-still-worth-reporting)
   proposes a **clamp** — Phase D takes both from the current entry and ignores what the model said —
   so no `plugin → eject` row can exist. The alternative is to render them, which contradicts the
   ruling's prose but honours what the schema admits. **This document does not decide it.**

3. **Is the chips' `→` amber, or is that decoration?** §4 keeps `91a`'s amber and flags it as the one
   judgement call in the section, with `text-faint` as the one-line fallback. The app's law is
   _"Amber means 'not the default.' It is never decoration"_, and an arrow before an opener is
   arguable either way. **Note it is now the third use of U+2192 in this phase** — the opener mark,
   §11's changed row, and §11.6's cell — and only the first is amber.
4. **Are the two chips in the right order?** `Change my setup to…` then `Create a new setup with…`,
   taken from ruling 2 as written rather than re-argued. The one argument for flipping them is that
   you create before you change, which is why the cut track put `build` first.
5. **Can individual rows in a proposal be rejected?** `91g` lists it as open and this phase fences
   it out — a proposal is applied whole or discarded whole. It is the difference between a changeset
   and a checklist, and it changes what `Apply` means.
6. **Does the reason line generalise past preload?** `91g` has one hardcoded sentence
   (`Preloaded because you said tests matter`) and Phase C renders one hardcoded sentence of its
   own. Whether every change carries its reason, or only preload does, is a Phase D prompt question
   with a UI consequence.
7. **Is the resting behaviour always-expanded, or `92e`'s "collapsed, then focused"?** The assembled
   screen shows always-expanded and this spec builds that. `92e` is described in the lab as _"the
   right resting behaviour whichever expression wins"_ and is not a locked decision.
8. **Are the proposal's grids closed on arrival?** [§11.5](#115-one-grid-per-skill-reached-from-its-row--and-the-arithmetic-that-decides-it)
   says yes, and the reason is measured rather than tasteful: one grid is `≈6.5rem` against a
   `21rem` cap, so `91g`'s own ten-change proposal would carry roughly twice the block's whole
   ceiling in grids alone. Nothing about that is a judgement — but **"the diagram is one press
   away" is not the same promise as "here is the diagram"**, and the ruling asked for the second.
   If the owner wants them open by default, the cap has to move and the dock has to stop being
   sticky at the viewport foot; that is a bigger change than a default.
9. **Does the roster's five-role reality force EDITOR-10 now?** [§11.4](#114-not-every-edge-has-a-cell--and-173-of-238-skills-have-one-that-does-not)
   works around it — an agent the grid cannot place gets a labelled cell — so nothing is blocked.
   But it is worth knowing that the design's four-role field is **already superseded by the code**:
   `ROLE_COLUMNS` draws two columns, not four, because the per-domain PMs and reviewers were
   consolidated (CLI-398, CLI-399). So a `rsrch` column would no longer be "diverging from the
   design file" — the file stopped describing this surface some time ago, which was EDITOR-10's
   only stated blocker.
