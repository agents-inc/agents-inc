// Workers Logs ingests a logged object as structured fields.
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
