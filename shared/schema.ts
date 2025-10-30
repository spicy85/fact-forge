import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, index, date, doublePrecision } from "drizzle-orm/pg-core";
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
  attribute_class: varchar("attribute_class", { length: 50 }).notNull().default("time_series"),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_name: text("source_name").notNull(),
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
  attribute_class: varchar("attribute_class", { length: 50 }).notNull().default("time_series"),
  value: text("value").notNull(),
  value_type: text("value_type").notNull(),
  source_url: text("source_url").notNull(),
  source_name: text("source_name").notNull(),
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
  identity_score: integer("identity_score").notNull(),
  legitimacy: integer("legitimacy").notNull(),
  data_quality: integer("data_quality").notNull(),
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
  identity_score: true,
  legitimacy: true,
  data_quality: true,
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
  promotion_threshold: integer("promotion_threshold").notNull().default(80),
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
  claim_year: integer("claim_year"),
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

export const sourceIdentityMetrics = pgTable("source_identity_metrics", {
  domain: text("domain").primaryKey(),
  status: text("status").notNull().default("pending_review"),
  identity_score: integer("identity_score").notNull().default(0),
  url_repute: integer("url_repute").notNull().default(0),
  certificate: integer("certificate").notNull().default(0),
  ownership: integer("ownership").notNull().default(0),
  // WHOIS metadata for ownership validation audit trail
  ownership_registrar: text("ownership_registrar"),
  ownership_organization: text("ownership_organization"),
  ownership_domain_age: doublePrecision("ownership_domain_age"),
  ownership_status: text("ownership_status"),
  updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertSourceIdentityMetricsSchema = createInsertSchema(sourceIdentityMetrics).omit({
  updated_at: true,
});

export const updateSourceIdentityMetricsSchema = createInsertSchema(sourceIdentityMetrics).omit({
  updated_at: true,
}).partial();

export type InsertSourceIdentityMetrics = z.infer<typeof insertSourceIdentityMetricsSchema>;
export type UpdateSourceIdentityMetrics = z.infer<typeof updateSourceIdentityMetricsSchema>;
export type SourceIdentityMetrics = typeof sourceIdentityMetrics.$inferSelect;

export const tldScores = pgTable("tld_scores", {
  tld: text("tld").primaryKey(),
  score: integer("score").notNull().default(0),
  notes: text("notes"),
  updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertTldScoreSchema = createInsertSchema(tldScores).omit({
  updated_at: true,
});

export const updateTldScoreSchema = createInsertSchema(tldScores).omit({
  updated_at: true,
}).partial();

export type InsertTldScore = z.infer<typeof insertTldScoreSchema>;
export type UpdateTldScore = z.infer<typeof updateTldScoreSchema>;
export type TldScore = typeof tldScores.$inferSelect;

export const historicalEvents = pgTable("historical_events", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entity_type: varchar("entity_type", { length: 50 }).notNull().default("country"),
  event_date: date("event_date"),
  event_year: integer("event_year").notNull(),
  event_type: varchar("event_type", { length: 100 }).notNull(), // independence, revolution, treaty, war, constitution, etc.
  title: text("title").notNull(),
  description: text("description"),
  source_name: text("source_name").notNull(),
  source_url: text("source_url"),
  importance: integer("importance").notNull().default(5), // 1-10 scale, 10 being most important
  verified: integer("verified").notNull().default(0), // 0 or 1 (boolean)
  added_at: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  entityIdx: index("historical_events_entity_idx").on(table.entity),
  yearIdx: index("historical_events_year_idx").on(table.event_year),
  typeIdx: index("historical_events_type_idx").on(table.event_type),
}));

export const insertHistoricalEventSchema = createInsertSchema(historicalEvents).omit({
  id: true,
  added_at: true,
});

export type InsertHistoricalEvent = z.infer<typeof insertHistoricalEventSchema>;
export type HistoricalEvent = typeof historicalEvents.$inferSelect;

export const assayProvenance = pgTable("assay_provenance", {
  id: serial("id").primaryKey(),
  assay_id: text("assay_id").notNull(),
  assay_version: text("assay_version").notNull(),
  claim: text("claim").notNull(),
  entity: text("entity"),
  attribute: text("attribute"),
  claimed_value: text("claimed_value"),
  raw_responses: text("raw_responses").notNull(), // JSON stringified array of {source, response, timestamp}
  parsed_values: text("parsed_values").notNull(), // JSON stringified array of {source, value, unit}
  consensus_result: text("consensus_result").notNull(), // JSON stringified {passed, value, confidence, agreement}
  verification_status: text("verification_status").notNull(), // verified, rejected, uncertain
  artifact_hash: text("artifact_hash").notNull(), // SHA-256 hash of raw_responses for integrity
  execution_time_ms: integer("execution_time_ms"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  assayIdIdx: index("assay_provenance_assay_id_idx").on(table.assay_id),
  entityIdx: index("assay_provenance_entity_idx").on(table.entity),
  createdAtIdx: index("assay_provenance_created_at_idx").on(table.created_at),
  hashIdx: index("assay_provenance_hash_idx").on(table.artifact_hash),
}));

export const insertAssayProvenanceSchema = createInsertSchema(assayProvenance).omit({
  id: true,
  created_at: true,
});

export type InsertAssayProvenance = z.infer<typeof insertAssayProvenanceSchema>;
export type AssayProvenance = typeof assayProvenance.$inferSelect;

export const promotionGateLog = pgTable("promotion_gate_log", {
  id: serial("id").primaryKey(),
  evaluation_id: integer("evaluation_id").notNull(),
  entity: text("entity").notNull(),
  attribute: text("attribute").notNull(),
  risk_tier: text("risk_tier").notNull(), // low, medium, high
  decision: text("decision").notNull(), // pass, fail
  reason: text("reason").notNull(),
  criteria_met: text("criteria_met").notNull(), // JSON stringified object of which criteria passed/failed
  source_count: integer("source_count").notNull(),
  evaluation_score: integer("evaluation_score").notNull(),
  age_days: integer("age_days").notNull(),
  has_assay: integer("has_assay").notNull().default(0), // 0 or 1 (boolean)
  consensus_agreement: doublePrecision("consensus_agreement"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  evaluationIdIdx: index("promotion_gate_log_evaluation_id_idx").on(table.evaluation_id),
  tierIdx: index("promotion_gate_log_tier_idx").on(table.risk_tier),
  decisionIdx: index("promotion_gate_log_decision_idx").on(table.decision),
  createdAtIdx: index("promotion_gate_log_created_at_idx").on(table.created_at),
}));

export const insertPromotionGateLogSchema = createInsertSchema(promotionGateLog).omit({
  id: true,
  created_at: true,
});

export type InsertPromotionGateLog = z.infer<typeof insertPromotionGateLogSchema>;
export type PromotionGateLog = typeof promotionGateLog.$inferSelect;

// TypeScript types for assay definitions (not database tables)
export type FetchSource = {
  name: string;
  endpoint: string;
  method?: "GET" | "POST" | "SPARQL";
  query?: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
  cache_ttl?: number; // seconds
  timeout?: number; // milliseconds
};

export type FetchPlan = {
  sources: FetchSource[];
  parallel?: boolean; // default true
  fail_fast?: boolean; // default false
};

export type Parser = {
  type: "jsonpath" | "xpath" | "regex" | "sparql";
  expression: string;
  transform?: string; // optional JS function to transform parsed value
};

export type ExpectedSignal = {
  unit?: string;
  tolerance: string | number; // e.g., "10%" or 1000000
  comparison_rule?: "within_tolerance" | "exact_match" | "greater_than" | "less_than";
  consensus_rule?: "majority_within_tolerance" | "unanimous" | "any" | "weighted_average";
  min_sources?: number; // minimum sources required for consensus
};

export type ValidationHook = {
  type: "unit_check" | "range_check" | "cross_source_agreement" | "temporal_bounds";
  params: Record<string, any>;
};

export type Assay = {
  id: string;
  name: string;
  version: string;
  domain?: string; // e.g., "demographics", "economics", "history"
  owner?: string;
  license?: string;
  description?: string;
  
  // Input parameters
  inputs: {
    entity?: boolean;
    attribute?: boolean;
    year?: boolean;
    claimed_value?: boolean;
    custom?: Record<string, string>; // additional custom inputs
  };
  
  // Fetch configuration
  fetch_plan: FetchPlan;
  
  // Parsers for each source
  parsers: Record<string, Parser>;
  
  // Expected signal characteristics
  expected_signal: ExpectedSignal;
  
  // Validation hooks
  validation_hooks?: ValidationHook[];
  
  // Cost and risk metadata
  cost_hints?: {
    estimated_time_ms?: number;
    estimated_tokens?: number;
    estimated_cost_usd?: number;
  };
  
  safe_mode?: boolean; // read-only flag
  
  // Template patterns for claim matching
  claim_patterns?: string[]; // regex patterns to match claims
};
