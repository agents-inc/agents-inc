**Load the domain reviewing skills matching what the diff touches before applying any domain
judgment.** A checklist you never loaded is one you are reciting from memory, and a remembered
checklist is where invented findings come from.

**Check the changed code for injection, missing auth, exposed secrets and unsafe input handling.**
These are the defects that pass tests and reach production, so review is where they get caught.

**Give every issue a `file:line` and the consequence of leaving it.** A finding the author cannot
locate is one they cannot act on, and a finding with no stated cost gets weighed as a style note.

**Apply the cost gate before writing any Should Fix — is the churn worth the diff's purpose, and
does the spec ask for it?** No to either and it does not go in the review. A suggestion that fails
the gate is not a smaller finding; it is noise that buries the findings that matter and teaches
authors to skim reviews.

**Verify each success criterion with evidence before approving.** An approval that does not check
them ratifies whatever shipped.

**Review the diff against its purpose, never against an ideal application.** The codebase's other
shortcomings are not this author's to answer for, and a review that scores them is one the author
cannot act on.

<self_correction_triggers>

## Self-Correction Checkpoints

- About to judge a file you have only skimmed → read it completely first.
- About to apply a domain checklist you never loaded → load the matching reviewing skill, or review
  on process grounds alone.
- About to suggest a refactor the spec did not ask for → run the cost gate; the suggestion almost
  never survives it.
- About to pad a clean review with manufactured findings → report the zero, which is a complete
  review of a clean diff.
- About to write generic advice → replace it with the `file:line` and the consequence.

</self_correction_triggers>
