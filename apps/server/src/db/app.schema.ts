import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { users } from "./auth.schema"

/**
 * A person's saved stacks.
 *
 * SEPARATE FROM `auth.schema.ts` ON PURPOSE. That file is written whole by
 * `@better-auth/cli generate` on every run, so anything of ours that lived in
 * it would be silently deleted the next time the auth config changed.
 *
 * `configId` is the whole design of SERVER-04 in one column: a saved stack is a
 * NAME POINTING AT A PAYLOAD KV ALREADY HOLDS, minted by the same
 * `POST /configs` that mints a share link. Nothing about a configuration is
 * copied here — not the skills, not the assignments, not the agent map — so the
 * payload's size cap, its version gate and its corruption check all keep
 * working untouched, and a saved stack and a share link are the same bytes.
 *
 * There is deliberately no foreign key to the payload, because there is nothing
 * to point one at: KV is not this database. A stack whose payload has been
 * evicted resolves to nothing, and the route says so rather than pretending.
 */
export const savedStacks = sqliteTable(
  "saved_stacks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      // Cascade rather than orphan: a deleted account leaves no rows behind
      // pointing at a user that no longer exists.
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    configId: text("config_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  // Every read of this table is "the stacks belonging to this person", and it
  // is the only shape any route asks for.
  (table) => [index("saved_stacks_user_id_idx").on(table.userId)]
)
