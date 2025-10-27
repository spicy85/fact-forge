import { type User, type InsertUser, type VerifiedFact, type InsertVerifiedFact, type FactsEvaluation, type InsertFactsEvaluation, type Source, type InsertSource, type UpdateSource, type ScoringSettings, type InsertScoringSettings, type UpdateScoringSettings, type RequestedFact, type InsertRequestedFact, type SourceActivityLog, type InsertSourceActivityLog, type FactsActivityLog, type InsertFactsActivityLog, type SourceIdentityMetrics, type InsertSourceIdentityMetrics, type UpdateSourceIdentityMetrics } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { verifiedFacts, factsEvaluation, sources, scoringSettings, requestedFacts, sourceActivityLog, factsActivityLog, sourceIdentityMetrics } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "./evaluation-scoring";

// modify the interface with any CRUD methods
// you might need

export interface MultiSourceResult {
  consensus: number;
  min: number;
  max: number;
  sourceCount: number;
  credibleEvaluations: FactsEvaluation[];
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllVerifiedFacts(): Promise<VerifiedFact[]>;
  insertVerifiedFact(fact: InsertVerifiedFact): Promise<VerifiedFact>;
  getAllFactsEvaluation(): Promise<FactsEvaluation[]>;
  insertFactsEvaluation(evaluation: InsertFactsEvaluation): Promise<FactsEvaluation>;
  recalculateAllEvaluations(): Promise<number>;
  getMultiSourceEvaluations(entity: string, attribute: string): Promise<MultiSourceResult | null>;
  getAllSources(): Promise<Source[]>;
  getSourcesByStatus(status: string): Promise<Source[]>;
  insertSource(source: InsertSource): Promise<Source>;
  updateSource(domain: string, updates: UpdateSource): Promise<Source | undefined>;
  promoteSource(domain: string): Promise<Source | undefined>;
  demoteSource(domain: string): Promise<Source | undefined>;
  rejectSource(domain: string, notes?: string): Promise<Source | undefined>;
  getScoringSettings(): Promise<ScoringSettings | undefined>;
  upsertScoringSettings(settings: UpdateScoringSettings): Promise<ScoringSettings>;
  createOrIncrementRequestedFact(entity: string, attribute: string, claimValue?: string, claimYear?: number): Promise<RequestedFact>;
  logSourceActivity(log: InsertSourceActivityLog): Promise<SourceActivityLog>;
  getAllSourceActivityLogs(): Promise<SourceActivityLog[]>;
  logFactsActivity(log: InsertFactsActivityLog): Promise<FactsActivityLog>;
  logFactsActivityBatch(logs: InsertFactsActivityLog[]): Promise<FactsActivityLog[]>;
  getAllFactsActivityLogs(limit?: number, offset?: number): Promise<FactsActivityLog[]>;
  promoteFactsToVerified(): Promise<{ promotedCount: number; skippedCount: number; }>;
  syncFactsCount(): Promise<{ synced: number; sources: { domain: string; oldCount: number; newCount: number; }[]; }>;
  getAllSourceIdentityMetrics(): Promise<SourceIdentityMetrics[]>;
  getSourceIdentityMetric(domain: string): Promise<SourceIdentityMetrics | undefined>;
  insertSourceIdentityMetrics(metrics: InsertSourceIdentityMetrics): Promise<SourceIdentityMetrics>;
  updateSourceIdentityMetrics(domain: string, updates: UpdateSourceIdentityMetrics): Promise<SourceIdentityMetrics | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllVerifiedFacts(): Promise<VerifiedFact[]> {
    return db.select().from(verifiedFacts);
  }

  async insertVerifiedFact(fact: InsertVerifiedFact): Promise<VerifiedFact> {
    const [insertedFact] = await db.insert(verifiedFacts).values(fact).returning();
    
    // Increment facts_count for this source
    await db
      .update(sources)
      .set({ facts_count: sql`${sources.facts_count} + 1` })
      .where(eq(sources.domain, fact.source_name));
    
    return insertedFact;
  }

  async getAllFactsEvaluation(): Promise<FactsEvaluation[]> {
    return db.select().from(factsEvaluation);
  }

  async insertFactsEvaluation(evaluation: InsertFactsEvaluation): Promise<FactsEvaluation> {
    const sourceTrustScore = await calculateSourceTrustScore(evaluation.source_url);
    
    const settings = await this.getScoringSettings();
    const recencyScore = settings 
      ? calculateRecencyScore(
          evaluation.evaluated_at,
          settings.recency_tier1_days,
          settings.recency_tier1_score,
          settings.recency_tier2_days,
          settings.recency_tier2_score,
          settings.recency_tier3_score
        )
      : calculateRecencyScore(evaluation.evaluated_at);
    
    const consensusScore = evaluation.consensus_score ?? 50;
    
    const sourceTrustWeight = evaluation.source_trust_weight ?? (settings?.source_trust_weight ?? 1);
    const recencyWeight = evaluation.recency_weight ?? (settings?.recency_weight ?? 1);
    const consensusWeight = evaluation.consensus_weight ?? (settings?.consensus_weight ?? 1);
    
    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      sourceTrustWeight,
      recencyWeight,
      consensusWeight
    );
    
    const evaluationWithScores = {
      ...evaluation,
      source_trust_score: sourceTrustScore,
      recency_score: recencyScore,
      consensus_score: consensusScore,
      source_trust_weight: sourceTrustWeight,
      recency_weight: recencyWeight,
      consensus_weight: consensusWeight,
      trust_score: trustScore,
    };
    
    const [insertedEvaluation] = await db.insert(factsEvaluation).values(evaluationWithScores).returning();
    return insertedEvaluation;
  }

  async recalculateAllEvaluations(): Promise<number> {
    const allEvaluations = await db.select().from(factsEvaluation);
    const settings = await this.getScoringSettings();
    
    let updatedCount = 0;
    
    for (const evaluation of allEvaluations) {
      const sourceTrustScore = await calculateSourceTrustScore(evaluation.source_url);
      
      const recencyScore = settings 
        ? calculateRecencyScore(
            evaluation.evaluated_at,
            settings.recency_tier1_days,
            settings.recency_tier1_score,
            settings.recency_tier2_days,
            settings.recency_tier2_score,
            settings.recency_tier3_score
          )
        : calculateRecencyScore(evaluation.evaluated_at);
      
      const consensusScore = evaluation.consensus_score ?? 50;
      
      const sourceTrustWeight = evaluation.source_trust_weight ?? (settings?.source_trust_weight ?? 1);
      const recencyWeight = evaluation.recency_weight ?? (settings?.recency_weight ?? 1);
      const consensusWeight = evaluation.consensus_weight ?? (settings?.consensus_weight ?? 1);
      
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        consensusScore,
        sourceTrustWeight,
        recencyWeight,
        consensusWeight
      );
      
      await db
        .update(factsEvaluation)
        .set({
          source_trust_score: sourceTrustScore,
          recency_score: recencyScore,
          trust_score: trustScore,
        })
        .where(eq(factsEvaluation.id, evaluation.id));
      
      updatedCount++;
    }
    
    return updatedCount;
  }

  async getMultiSourceEvaluations(entity: string, attribute: string): Promise<MultiSourceResult | null> {
    // Get all verified facts for this entity-attribute from verified_facts table
    // IMPORTANT: Return ALL time-series data points for historical claim verification
    const verifiedFactsList = await db
      .select()
      .from(verifiedFacts)
      .where(
        and(
          eq(verifiedFacts.entity, entity),
          eq(verifiedFacts.attribute, attribute)
        )
      )
      .orderBy(desc(verifiedFacts.as_of_date));
    
    if (verifiedFactsList.length === 0) {
      return null;
    }
    
    // Fetch all sources to get numeric trust ratings (average of all 5 criteria)
    const allSources = await db.select().from(sources);
    const sourceTrustMap = new Map(
      allSources.map(source => [
        source.domain, 
        Math.round((source.identity + source.legitimacy + source.data_quality + source.data_accuracy + source.proprietary_score) / 5)
      ])
    );
    
    // Use ALL facts for consensus calculation to support time-series data
    // This allows verification of historical claims like "USA had 226M people in 1980"
    const allFacts = verifiedFactsList;
    
    const numericValues: number[] = [];
    for (const fact of allFacts) {
      const numValue = parseFloat(fact.value.replace(/,/g, ''));
      if (!isNaN(numValue)) {
        numericValues.push(numValue);
      }
    }
    
    if (numericValues.length === 0) {
      return null;
    }
    
    // For verified facts, calculate simple average consensus (all time-series points included)
    const consensus = numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
    
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    
    // Convert verified facts to evaluation format for compatibility
    const credibleEvaluations: FactsEvaluation[] = allFacts.map(fact => ({
      id: 0, // placeholder
      entity: fact.entity,
      entity_type: fact.entity_type,
      attribute: fact.attribute,
      attribute_class: fact.attribute_class,
      value: fact.value,
      value_type: fact.value_type,
      source_url: fact.source_url,
      source_name: fact.source_name,
      as_of_date: fact.as_of_date,
      source_trust_score: null,
      recency_score: null,
      consensus_score: null,
      source_trust_weight: null,
      recency_weight: null,
      consensus_weight: null,
      trust_score: sourceTrustMap.get(fact.source_name) ?? null,
      evaluation_notes: null,
      evaluated_at: fact.last_verified_at,
      status: 'verified',
    }));
    
    return {
      consensus,
      min,
      max,
      sourceCount: allFacts.length,
      credibleEvaluations
    };
  }

  async getAllSources(): Promise<Source[]> {
    return db.select().from(sources);
  }

  async getSourcesByStatus(status: string): Promise<Source[]> {
    return db.select().from(sources).where(eq(sources.status, status));
  }

  async insertSource(source: InsertSource): Promise<Source> {
    const [insertedSource] = await db.insert(sources).values(source).returning();
    return insertedSource;
  }

  async updateSource(domain: string, updates: UpdateSource): Promise<Source | undefined> {
    const [updatedSource] = await db
      .update(sources)
      .set(updates)
      .where(eq(sources.domain, domain))
      .returning();
    return updatedSource;
  }

  async promoteSource(domain: string): Promise<Source | undefined> {
    const [currentSource] = await db
      .select()
      .from(sources)
      .where(eq(sources.domain, domain))
      .limit(1);
    
    if (!currentSource) {
      return undefined;
    }

    const [updatedSource] = await db
      .update(sources)
      .set({ 
        status: 'trusted',
        promoted_at: new Date().toISOString()
      })
      .where(eq(sources.domain, domain))
      .returning();

    await this.logSourceActivity({
      domain,
      action: 'promote',
      from_status: currentSource.status,
      to_status: 'trusted',
      notes: null
    });

    return updatedSource;
  }

  async demoteSource(domain: string): Promise<Source | undefined> {
    const [currentSource] = await db
      .select()
      .from(sources)
      .where(eq(sources.domain, domain))
      .limit(1);
    
    if (!currentSource) {
      return undefined;
    }

    const [updatedSource] = await db
      .update(sources)
      .set({ 
        status: 'pending_review',
        promoted_at: null
      })
      .where(eq(sources.domain, domain))
      .returning();

    await this.logSourceActivity({
      domain,
      action: 'demote',
      from_status: currentSource.status,
      to_status: 'pending_review',
      notes: null
    });

    return updatedSource;
  }

  async rejectSource(domain: string, notes?: string): Promise<Source | undefined> {
    const [currentSource] = await db
      .select()
      .from(sources)
      .where(eq(sources.domain, domain))
      .limit(1);
    
    if (!currentSource) {
      return undefined;
    }

    const [updatedSource] = await db
      .update(sources)
      .set({ 
        status: 'rejected',
        notes: notes || null
      })
      .where(eq(sources.domain, domain))
      .returning();

    await this.logSourceActivity({
      domain,
      action: 'reject',
      from_status: currentSource.status,
      to_status: 'rejected',
      notes: notes || null
    });

    return updatedSource;
  }

  async getScoringSettings(): Promise<ScoringSettings | undefined> {
    const [settings] = await db.select().from(scoringSettings).limit(1);
    return settings;
  }

  async upsertScoringSettings(updates: UpdateScoringSettings): Promise<ScoringSettings> {
    const existing = await this.getScoringSettings();
    
    if (existing) {
      const [updatedSettings] = await db
        .update(scoringSettings)
        .set({ ...updates, updated_at: new Date().toISOString() })
        .where(eq(scoringSettings.id, existing.id))
        .returning();
      return updatedSettings;
    } else {
      const [insertedSettings] = await db
        .insert(scoringSettings)
        .values({ ...updates, updated_at: new Date().toISOString() } as InsertScoringSettings)
        .returning();
      return insertedSettings;
    }
  }

  async createOrIncrementRequestedFact(entity: string, attribute: string, claimValue?: string, claimYear?: number): Promise<RequestedFact> {
    // Build WHERE conditions - include claim_year in deduplication key
    const whereConditions = [
      eq(requestedFacts.entity, entity),
      eq(requestedFacts.attribute, attribute),
      claimYear !== undefined 
        ? eq(requestedFacts.claim_year, claimYear)
        : sql`${requestedFacts.claim_year} IS NULL`
    ];

    const [existing] = await db
      .select()
      .from(requestedFacts)
      .where(and(...whereConditions))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(requestedFacts)
        .set({ 
          request_count: existing.request_count + 1,
          last_requested_at: sql`CURRENT_TIMESTAMP`,
          claim_value: claimValue || existing.claim_value
        })
        .where(eq(requestedFacts.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(requestedFacts)
        .values({
          entity,
          attribute,
          claim_value: claimValue,
          claim_year: claimYear,
          request_count: 1
        })
        .returning();
      return inserted;
    }
  }

  async logSourceActivity(log: InsertSourceActivityLog): Promise<SourceActivityLog> {
    const [inserted] = await db
      .insert(sourceActivityLog)
      .values(log)
      .returning();
    return inserted;
  }

  async getAllSourceActivityLogs(): Promise<SourceActivityLog[]> {
    return db
      .select()
      .from(sourceActivityLog)
      .orderBy(desc(sourceActivityLog.created_at));
  }

  async logFactsActivity(log: InsertFactsActivityLog): Promise<FactsActivityLog> {
    const [inserted] = await db
      .insert(factsActivityLog)
      .values(log)
      .returning();
    return inserted;
  }

  async logFactsActivityBatch(logs: InsertFactsActivityLog[]): Promise<FactsActivityLog[]> {
    if (logs.length === 0) {
      return [];
    }
    return db
      .insert(factsActivityLog)
      .values(logs)
      .returning();
  }

  async getAllFactsActivityLogs(limit: number = 100, offset: number = 0): Promise<FactsActivityLog[]> {
    return db
      .select()
      .from(factsActivityLog)
      .orderBy(desc(factsActivityLog.created_at))
      .limit(limit)
      .offset(offset);
  }

  async promoteFactsToVerified(): Promise<{ promotedCount: number; skippedCount: number; }> {
    // Get promotion threshold from settings
    const settings = await this.getScoringSettings();
    const promotionThreshold = settings?.promotion_threshold ?? 80;

    // Get all facts from evaluation that meet or exceed the threshold
    const candidateFacts = await db
      .select()
      .from(factsEvaluation)
      .where(sql`${factsEvaluation.trust_score} >= ${promotionThreshold}`)
      .orderBy(
        desc(factsEvaluation.as_of_date),
        desc(factsEvaluation.evaluated_at)
      );

    if (candidateFacts.length === 0) {
      return { promotedCount: 0, skippedCount: 0 };
    }

    // Deduplicate: Keep most recent fact per (entity, attribute, source_name, as_of_date)
    // Including as_of_date allows for time-series data (e.g., population in 2020, 2021, 2022)
    const deduplicatedMap = new Map<string, typeof candidateFacts[0]>();
    for (const fact of candidateFacts) {
      const key = `${fact.entity}|||${fact.attribute}|||${fact.source_name}|||${fact.as_of_date || ''}`;
      if (!deduplicatedMap.has(key)) {
        deduplicatedMap.set(key, fact);
      }
    }

    const factsToPromote = Array.from(deduplicatedMap.values());
    
    // Check which facts already exist in verified_facts to avoid duplicates
    const existingFacts = await db.select().from(verifiedFacts);
    const existingKeys = new Set(
      existingFacts.map(f => `${f.entity}|||${f.attribute}|||${f.source_name}|||${f.as_of_date || ''}`)
    );

    let promotedCount = 0;
    let skippedCount = 0;
    const logsToInsert: InsertFactsActivityLog[] = [];

    for (const fact of factsToPromote) {
      const key = `${fact.entity}|||${fact.attribute}|||${fact.source_name}|||${fact.as_of_date || ''}`;
      
      if (existingKeys.has(key)) {
        // Update existing fact with newer data
        await db
          .update(verifiedFacts)
          .set({
            value: fact.value,
            as_of_date: fact.as_of_date,
            last_verified_at: fact.evaluated_at,
          })
          .where(
            and(
              eq(verifiedFacts.entity, fact.entity),
              eq(verifiedFacts.attribute, fact.attribute),
              eq(verifiedFacts.source_name, fact.source_name),
              fact.as_of_date ? eq(verifiedFacts.as_of_date, fact.as_of_date) : sql`${verifiedFacts.as_of_date} IS NULL`
            )
          );
        
        logsToInsert.push({
          entity: fact.entity,
          entity_type: fact.entity_type,
          attribute: fact.attribute,
          action: 'updated',
          source: fact.source_name,
          process: 'promotion',
          value: fact.value,
          notes: `Updated from evaluation (trust_score: ${fact.trust_score})`,
        });
        
        promotedCount++;
      } else {
        // Insert new fact
        await db.insert(verifiedFacts).values({
          entity: fact.entity,
          entity_type: fact.entity_type,
          attribute: fact.attribute,
          value: fact.value,
          value_type: fact.value_type,
          source_url: fact.source_url,
          source_name: fact.source_name,
          as_of_date: fact.as_of_date,
          last_verified_at: fact.evaluated_at,
        });

        // Increment facts_count for this source
        await db
          .update(sources)
          .set({ facts_count: sql`${sources.facts_count} + 1` })
          .where(eq(sources.domain, fact.source_name));

        logsToInsert.push({
          entity: fact.entity,
          entity_type: fact.entity_type,
          attribute: fact.attribute,
          action: 'promoted',
          source: fact.source_name,
          process: 'promotion',
          value: fact.value,
          notes: `Promoted from evaluation (trust_score: ${fact.trust_score})`,
        });
        
        promotedCount++;
      }
    }

    // Batch insert logs
    if (logsToInsert.length > 0) {
      await this.logFactsActivityBatch(logsToInsert);
    }

    return { promotedCount, skippedCount };
  }

  async syncFactsCount(): Promise<{ synced: number; sources: { domain: string; oldCount: number; newCount: number; }[]; }> {
    // Get all sources
    const allSources = await db.select().from(sources);
    
    // Get actual fact counts from verified_facts grouped by source_name
    const factCounts = await db
      .select({
        source_name: verifiedFacts.source_name,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(verifiedFacts)
      .groupBy(verifiedFacts.source_name);
    
    const countMap = new Map(factCounts.map(fc => [fc.source_name, fc.count]));
    
    const syncResults: { domain: string; oldCount: number; newCount: number; }[] = [];
    let syncedCount = 0;
    
    for (const source of allSources) {
      const actualCount = countMap.get(source.domain) ?? 0;
      const oldCount = source.facts_count;
      
      if (oldCount !== actualCount) {
        await db
          .update(sources)
          .set({ facts_count: actualCount })
          .where(eq(sources.domain, source.domain));
        
        syncResults.push({
          domain: source.domain,
          oldCount,
          newCount: actualCount,
        });
        syncedCount++;
      }
    }
    
    return { synced: syncedCount, sources: syncResults };
  }

  async getAllSourceIdentityMetrics(): Promise<SourceIdentityMetrics[]> {
    return db.select().from(sourceIdentityMetrics);
  }

  async getSourceIdentityMetric(domain: string): Promise<SourceIdentityMetrics | undefined> {
    const [metric] = await db
      .select()
      .from(sourceIdentityMetrics)
      .where(eq(sourceIdentityMetrics.domain, domain));
    return metric;
  }

  async insertSourceIdentityMetrics(metrics: InsertSourceIdentityMetrics): Promise<SourceIdentityMetrics> {
    const urlSecurity = metrics.url_security ?? 0;
    const certificate = metrics.certificate ?? 0;
    const ownership = metrics.ownership ?? 0;
    
    const identityScore = Math.round((urlSecurity + certificate + ownership) / 3);
    
    const [inserted] = await db
      .insert(sourceIdentityMetrics)
      .values({
        ...metrics,
        url_security: urlSecurity,
        certificate: certificate,
        ownership: ownership,
        identity_score: identityScore,
      })
      .returning();
    
    return inserted;
  }

  async updateSourceIdentityMetrics(domain: string, updates: UpdateSourceIdentityMetrics): Promise<SourceIdentityMetrics | undefined> {
    let identityScore: number | undefined;
    
    if (updates.url_security !== undefined || updates.certificate !== undefined || updates.ownership !== undefined) {
      const existing = await this.getSourceIdentityMetric(domain);
      if (existing) {
        const urlSecurity = updates.url_security ?? existing.url_security;
        const certificate = updates.certificate ?? existing.certificate;
        const ownership = updates.ownership ?? existing.ownership;
        identityScore = Math.round((urlSecurity + certificate + ownership) / 3);
      }
    }
    
    const updateData = {
      ...updates,
      ...(identityScore !== undefined && { identity_score: identityScore }),
      updated_at: new Date().toISOString(),
    };
    
    const [updated] = await db
      .update(sourceIdentityMetrics)
      .set(updateData)
      .where(eq(sourceIdentityMetrics.domain, domain))
      .returning();
    
    return updated;
  }
}

export const storage = new MemStorage();
