import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer } from "drizzle-orm/pg-core";
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
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_trust: text("source_trust").notNull(),
  last_verified_at: text("last_verified_at").notNull(),
});

export const insertFactSchema = createInsertSchema(facts).omit({
  id: true,
});

export type InsertFact = z.infer<typeof insertFactSchema>;
export type Fact = typeof facts.$inferSelect;

export const sources = pgTable("sources", {
  domain: text("domain").primaryKey(),
  public_trust: integer("public_trust").notNull(),
  data_accuracy: integer("data_accuracy").notNull(),
  proprietary_score: integer("proprietary_score").notNull(),
});

export const insertSourceSchema = createInsertSchema(sources);
export const updateSourceSchema = createInsertSchema(sources).pick({
  public_trust: true,
  data_accuracy: true,
  proprietary_score: true,
}).partial();

export type InsertSource = z.infer<typeof insertSourceSchema>;
export type UpdateSource = z.infer<typeof updateSourceSchema>;
export type Source = typeof sources.$inferSelect;
