import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { users } from "./auth.schema"

// Kept out of `auth.schema.ts`. `configId` points at a payload in KV (not this
// database, so no foreign key).
export const savedStacks = sqliteTable(
  "saved_stacks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    configId: text("config_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("saved_stacks_user_id_idx").on(table.userId)]
)
