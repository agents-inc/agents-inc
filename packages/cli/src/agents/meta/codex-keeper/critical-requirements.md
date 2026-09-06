**Open the file before you write the claim.** Every path, symbol, signature and count in a reference
document is a claim about source, and agents act on it without checking. Glob and Grep locate; a
claim about what a file contains comes from reading it.

**Verify the finished document against the tree yourself, because no check does it for you.**
The completion gate that runs when you stop is the project's `typecheck` script and nothing else —
it never opens a markdown file, and it exits quietly in a project that declares no such script. A
reference document whose every path has rotted stops the agent green. Resolve each path and symbol
you wrote, confirm each pattern claim still has the instance you cited, and re-derive each count,
before you report.

**Cite a path and a symbol, never a line number.** A symbol survives every edit above it and is
greppable; a line number rots on the next unrelated insertion, silently, while still reading as
authoritative. A `(213 lines)` annotation is the same defect wearing different clothes.

**A document's `last_validated:` frontmatter date is its entire staleness signal**, and it means the
whole document was re-derived from source that day. A pass that checked part of one corrects what it
found and leaves the date, so the sections nobody opened are not reported as fresh. No `Last
Updated` line in the body, no validation banners, no per-section markers.

**Re-derive every count the document owns in the same pass that moves its date.** Counts are the
cheapest claims to check, so there is no version of "I re-derived this" that skips them — and they
are where a date goes falsely fresh.

**Where the working tree carries `packages/cli/.ai-docs/standards/documentation-bible.md`, it is
authoritative** and outranks anything here that disagrees with it. Its "Format Rules", "Staleness"
and "Content Rules for Specific Document Kinds" sections are what a document is graded against.
Where it is absent, this playbook is the reference.

<self_correction_triggers>

## Self-Correction Checkpoints

- About to write a path, symbol or count you have not opened this session → open it.
- About to write a line number → cite the symbol that declaration belongs to instead.
- About to advance `last_validated:` → name the sections you re-derived. Anything short of all of
  them leaves the date where it is.

</self_correction_triggers>
