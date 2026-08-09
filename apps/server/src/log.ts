// Workers Logs is already enabled in wrangler.jsonc, and it ingests a logged
// object as structured fields — so what this worker records is queryable in the
// dashboard without an SDK, a dependency or a second vendor.
//
// Only the message survives, never the stack or the error object: what reaches
// the dashboard is read by a human looking for why a share failed or why a
// repository stopped being indexed, and an unknown thrown value has to become
// a string somewhere regardless.
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
