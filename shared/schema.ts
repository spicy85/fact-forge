import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const facts = pgTable("facts", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  valueType: text("value_type").notNull(),
  asOfDate: text("as_of_date").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTrust: text("source_trust").notNull(),
  lastVerifiedAt: text("last_verified_at").notNull(),
});

export const insertFactSchema = createInsertSchema(facts).omit({
  id: true,
});

export type InsertFact = z.infer<typeof insertFactSchema>;
export type Fact = typeof facts.$inferSelect;
