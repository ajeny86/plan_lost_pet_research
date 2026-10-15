import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceState = sqliteTable("workspace_state", {
  workspaceId: text("workspace_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
