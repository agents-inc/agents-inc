import { DOMAINS } from "@workspace/matrix"
import { z } from "zod"

// The longest query or id the address keeps.
const MAX_FIELD_LENGTH = 64

// What you are looking at, not what you are building (that stays in the store).
// `domain` is a scroll anchor, written on a pick and never on scroll. Every
// field `.catch()`es its default.
export const configureSearchSchema = z.object({
  domain: z.enum(DOMAINS).nullable().catch(null),
  q: z.string().trim().max(MAX_FIELD_LENGTH).catch(""),
  sel: z.boolean().catch(false),
  // Read on every load, so a reload reopens the shared config. packages/cli
  // builds this URL too.
  fromId: z.string().trim().max(MAX_FIELD_LENGTH).catch(""),
})

export type ConfigureSearch = z.infer<typeof configureSearchSchema>

// Kept out of the URL by `stripSearchParams`.
export const CONFIGURE_SEARCH_DEFAULTS: ConfigureSearch = {
  domain: null,
  q: "",
  sel: false,
  fromId: "",
}
