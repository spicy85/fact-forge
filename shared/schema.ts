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

export const verifiedFacts = pgTable("verified_facts", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_trust: text("source_trust").notNull(),
  last_verified_at: text("last_verified_at").notNull(),
});

export const insertVerifiedFactSchema = createInsertSchema(verifiedFacts).omit({
  id: true,
});

export type InsertVerifiedFact = z.infer<typeof insertVerifiedFactSchema>;
export type VerifiedFact = typeof verifiedFacts.$inferSelect;

export const factsEvaluation = pgTable("facts_evaluation", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_trust: text("source_trust").notNull(),
  // Evaluation criteria scores (0-100)
  source_trust_score: integer("source_trust_score"),
  recency_score: integer("recency_score"),
  consensus_score: integer("consensus_score"),
  // Adjustable weights for each criterion
  source_trust_weight: integer("source_trust_weight").default(1),
  recency_weight: integer("recency_weight").default(1),
  consensus_weight: integer("consensus_weight").default(1),
  // Calculated weighted average trust score (0-100)
  trust_score: integer("trust_score"),
  evaluation_notes: text("evaluation_notes"),
  evaluated_at: text("evaluated_at").notNull(),
  status: text("status").notNull().default("pending"),
});

export const insertFactsEvaluationSchema = createInsertSchema(factsEvaluation).omit({
  id: true,
});

export type InsertFactsEvaluation = z.infer<typeof insertFactsEvaluationSchema>;
export type FactsEvaluation = typeof factsEvaluation.$inferSelect;

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
