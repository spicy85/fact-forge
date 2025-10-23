import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, index, date } from "drizzle-orm/pg-core";
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
  entity_type: varchar("entity_type", { length: 50 }).notNull().default("country"),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_trust: text("source_trust").notNull(),
  as_of_date: date("as_of_date"),
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
  entity_type: varchar("entity_type", { length: 50 }).notNull().default("country"),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_trust: text("source_trust").notNull(),
  as_of_date: date("as_of_date"),
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
  status: text("status").notNull().default("pending_review"), // pending_review, evaluating, trusted, rejected
  added_at: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  promoted_at: text("promoted_at"),
  facts_count: integer("facts_count").notNull().default(0),
  notes: text("notes"),
});

export const insertSourceSchema = createInsertSchema(sources).omit({
  added_at: true,
});

export const updateSourceSchema = createInsertSchema(sources).pick({
  public_trust: true,
  data_accuracy: true,
  proprietary_score: true,
  status: true,
  promoted_at: true,
  facts_count: true,
  notes: true,
}).partial();

export type InsertSource = z.infer<typeof insertSourceSchema>;
export type UpdateSource = z.infer<typeof updateSourceSchema>;
export type Source = typeof sources.$inferSelect;

export const sourceActivityLog = pgTable("source_activity_log", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  action: text("action").notNull(), // promote, demote, reject
  from_status: text("from_status"),
  to_status: text("to_status").notNull(),
  notes: text("notes"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertSourceActivityLogSchema = createInsertSchema(sourceActivityLog).omit({
  id: true,
  created_at: true,
});

export type InsertSourceActivityLog = z.infer<typeof insertSourceActivityLogSchema>;
export type SourceActivityLog = typeof sourceActivityLog.$inferSelect;

export const scoringSettings = pgTable("scoring_settings", {
  id: serial("id").primaryKey(),
  // Default weights for scoring (1-10 scale)
  source_trust_weight: integer("source_trust_weight").notNull().default(1),
  recency_weight: integer("recency_weight").notNull().default(1),
  consensus_weight: integer("consensus_weight").notNull().default(1),
  // Recency scoring tiers (days)
  recency_tier1_days: integer("recency_tier1_days").notNull().default(7),
  recency_tier1_score: integer("recency_tier1_score").notNull().default(100),
  recency_tier2_days: integer("recency_tier2_days").notNull().default(30),
  recency_tier2_score: integer("recency_tier2_score").notNull().default(50),
  recency_tier3_score: integer("recency_tier3_score").notNull().default(10),
  // Multi-source verification threshold (0-100)
  credible_threshold: integer("credible_threshold").notNull().default(80),
  // Promotion threshold for verified_facts (0-100)
  promotion_threshold: integer("promotion_threshold").notNull().default(85),
  // Updated timestamp
  updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertScoringSettingsSchema = createInsertSchema(scoringSettings).omit({
  id: true,
  updated_at: true,
});

export const updateScoringSettingsSchema = createInsertSchema(scoringSettings).omit({
  id: true,
  updated_at: true,
}).partial();

export type InsertScoringSettings = z.infer<typeof insertScoringSettingsSchema>;
export type UpdateScoringSettings = z.infer<typeof updateScoringSettingsSchema>;
export type ScoringSettings = typeof scoringSettings.$inferSelect;

export const requestedFacts = pgTable("requested_facts", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entity_type: varchar("entity_type", { length: 50 }).notNull().default("country"),
  attribute: text("attribute").notNull(),
  claim_value: text("claim_value"),
  request_count: integer("request_count").notNull().default(1),
  first_requested_at: text("first_requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  last_requested_at: text("last_requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertRequestedFactSchema = createInsertSchema(requestedFacts).omit({
  id: true,
  first_requested_at: true,
  last_requested_at: true,
});

export type InsertRequestedFact = z.infer<typeof insertRequestedFactSchema>;
export type RequestedFact = typeof requestedFacts.$inferSelect;

export const factsActivityLog = pgTable("facts_activity_log", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entity_type: varchar("entity_type", { length: 50 }).notNull().default("country"),
  attribute: text("attribute").notNull(),
  action: text("action").notNull(), // requested, fulfilled, added, updated, removed
  source: text("source"), // wikipedia, worldbank, wikidata, etc.
  process: text("process"), // script name or endpoint
  value: text("value"), // the fact value if applicable
  notes: text("notes"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  createdAtIdx: index("facts_activity_log_created_at_idx").on(table.created_at),
  entityIdx: index("facts_activity_log_entity_idx").on(table.entity),
  actionIdx: index("facts_activity_log_action_idx").on(table.action),
}));

export const insertFactsActivityLogSchema = createInsertSchema(factsActivityLog).omit({
  id: true,
  created_at: true,
});

export type InsertFactsActivityLog = z.infer<typeof insertFactsActivityLogSchema>;
export type FactsActivityLog = typeof factsActivityLog.$inferSelect;
