import { DOMAINS } from "@workspace/matrix"
import { z } from "zod"

// The Configure screen's URL. Everything here describes what you are *looking
// at*, so a link to it is meaningful — the configuration you are BUILDING
// (stack, selected skills, assignments, per-skill options) stays in the store,
// and sharing that is the Share destination's job.
//
// `domain` is nullable and defaults to null, and it is an ANCHOR rather than a
// filter (EDITOR-79): every domain section is always rendered, and picking a
// tab scrolls to that section and records where you were sent, so `?domain=api`
// opens at API with the whole catalogue still under it. It is written on a
// pick and never on a scroll — a link says "take me to API", and one that
// rewrote itself as the reader moved would be a cursor nobody asked for, at a
// router navigation per section crossed.
//
// Every field `.catch()`es its default so a hand-edited URL degrades instead
// of throwing.
export const configureSearchSchema = z.object({
  domain: z.enum(DOMAINS).nullable().catch(null),
  q: z.string().trim().max(64).catch(""),
  // Narrow to what you have actually chosen — a review pass over your setup.
  sel: z.boolean().catch(false),
  // Which configuration you are looking at, and the one field that can say it
  // is not your own. Carrying it makes `/?fromId=<id>` the ADDRESS of a shared
  // configuration rather than a one-shot command (EDITOR-37): it is read on
  // every load, so a reload reopens the same state, and clearing it — which is
  // what the nav rail's Editor link does — is how you get back to your own.
  // It used to be stripped the moment it was applied, which is exactly why a
  // reload had no idea it had ever been a shared link.
  //
  // Also the URL `packages/cli` hands out for `share` and `edit --ui`
  // (`src/cli/consts.ts`), so its shape is a contract with that package rather
  // than this one's to change alone.
  fromId: z.string().trim().max(64).catch(""),
})

export type ConfigureSearch = z.infer<typeof configureSearchSchema>

// Kept out of the URL by `stripSearchParams`, so a pristine view has a clean address.
export const CONFIGURE_SEARCH_DEFAULTS: ConfigureSearch = {
  domain: null,
  q: "",
  sel: false,
  fromId: "",
}
