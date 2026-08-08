import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
