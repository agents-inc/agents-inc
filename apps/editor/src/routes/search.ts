import { DOMAINS } from "@workspace/matrix"
import { z } from "zod"

// The Configure screen's view state. Only these three live in the URL — they
// describe what you are *looking at*, so a link to them is meaningful. The
// configuration itself (stack, selected skills, assignments, per-skill
// options) stays in the store; sharing that is the Share destination's job.
//
// `domain` is nullable and defaults to null: the design renders every domain
// section at once, and a chip narrows to one rather than the page opening
// pre-filtered. Clicking the active chip clears it.
//
// Every field `.catch()`es its default so a hand-edited URL degrades instead
// of throwing.
export const configureSearchSchema = z.object({
  domain: z.enum(DOMAINS).nullable().catch(null),
  q: z.string().trim().max(64).catch(""),
  rec: z.boolean().catch(false),
  // Narrow to what you have actually chosen — a review pass over your setup.
  sel: z.boolean().catch(false),
  // The exception to "view state only": a share-link id, consumed once — the
  // config it names is fetched into the store, then the param is stripped so a
  // reload shows your subsequent edits rather than the snapshot again.
  fromId: z.string().trim().max(64).catch(""),
})

export type ConfigureSearch = z.infer<typeof configureSearchSchema>

// Kept out of the URL by `stripSearchParams`, so a pristine view has a clean address.
export const CONFIGURE_SEARCH_DEFAULTS: ConfigureSearch = {
  domain: null,
  q: "",
  rec: false,
  sel: false,
  fromId: "",
}
