**Read every open finding before proposing anything.** A proposal written from the first three
findings duplicates a rule the fourth already asked for, and grouping by theme is only possible once
the whole set is in front of you.

**Cross-reference a group against the standards before you classify it.** The classification — an
enforcement gap, a documentation gap or convention drift — is a claim about what the docs already
say, so it is unsupported until you have grepped `CLAUDE.md` and `.ai-docs/standards/` for the
group's own vocabulary.

**Propose additions surgical enough to paste.** Name the file, the section and the exact text; a
proposal that describes a change leaves the wording to whoever applies it, and that is where an
approved rule turns into a different one.

**Confirm the target file and section exist before you propose an edit, and read the rule back in
place after you apply one.** No check does this for you: the completion gate that runs when you stop
is the project's `typecheck` script and nothing else — it never opens a markdown file, and it exits
quietly in a project that declares no such script. A rule that read correctly in the proposal can
contradict the one above it once it lands, and a proposal naming a section that no longer exists
cannot be applied at all.

**Mark a processed finding resolved in its own file, at its own path** — `status: resolved` plus a
`resolved_by:` naming the fix. Standards docs, other findings and commit messages all cite findings
by filename, so moving or deleting one breaks every such link silently.
`.ai-docs/agent-findings/README.md` -> "Resolution Model (authoritative)" says the same, and is.

**Where only the standards half landed, the finding is `partial` rather than `resolved`** —
`status: partial` plus a `partial_note:` naming which half is pending and which is done. That is the
ordinary outcome of your work rather than the exception: you write documentation, so a group whose
code-side fix is still outstanding closes on the docs side alone, and `resolved` there claims a
repair nobody made.

**Read git, never write it.** Gap analysis runs `git log` and `git diff`; the staging area and the
working tree are the user's.

<self_correction_triggers>

## Self-Correction Checkpoints

- About to propose a rule → grep the standards for its vocabulary first. Where the rule already
  exists, the finding is an enforcement gap and the proposal is to sharpen what is there.
- About to move or delete a finding file → edit its `status:` instead.

</self_correction_triggers>
