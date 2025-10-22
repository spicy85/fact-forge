import { type User, type InsertUser, type VerifiedFact, type InsertVerifiedFact, type FactsEvaluation, type InsertFactsEvaluation, type Source, type InsertSource, type UpdateSource, type ScoringSettings, type InsertScoringSettings, type UpdateScoringSettings, type RequestedFact, type InsertRequestedFact, type SourceActivityLog, type InsertSourceActivityLog } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { verifiedFacts, factsEvaluation, sources, scoringSettings, requestedFacts, sourceActivityLog } from "@shared/schema";
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
  createOrIncrementRequestedFact(entity: string, attribute: string, claimValue?: string): Promise<RequestedFact>;
  logSourceActivity(log: InsertSourceActivityLog): Promise<SourceActivityLog>;
  getAllSourceActivityLogs(): Promise<SourceActivityLog[]>;
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
    const settings = await this.getScoringSettings();
    const credibleThreshold = settings?.credible_threshold ?? 80;
    
    const evaluations = await db
      .select()
      .from(factsEvaluation)
      .where(
        and(
          eq(factsEvaluation.entity, entity),
          eq(factsEvaluation.attribute, attribute)
        )
      );
    
    const credibleEvaluations = evaluations.filter(
      e => (e.trust_score ?? 0) >= credibleThreshold
    );
    
    if (credibleEvaluations.length === 0) {
      return null;
    }
    
    const numericValues: { value: number; trustScore: number }[] = [];
    for (const evaluation of credibleEvaluations) {
      const numValue = parseFloat(evaluation.value.replace(/,/g, ''));
      if (!isNaN(numValue)) {
        numericValues.push({ 
          value: numValue, 
          trustScore: evaluation.trust_score ?? 0 
        });
      }
    }
    
    if (numericValues.length === 0) {
      return null;
    }
    
    const totalTrustScore = numericValues.reduce((sum, v) => sum + v.trustScore, 0);
    const consensus = numericValues.reduce((sum, v) => sum + (v.value * v.trustScore), 0) / totalTrustScore;
    
    const values = numericValues.map(v => v.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return {
      consensus,
      min,
      max,
      sourceCount: credibleEvaluations.length,
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

  async createOrIncrementRequestedFact(entity: string, attribute: string, claimValue?: string): Promise<RequestedFact> {
    const [existing] = await db
      .select()
      .from(requestedFacts)
      .where(
        and(
          eq(requestedFacts.entity, entity),
          eq(requestedFacts.attribute, attribute)
        )
      )
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
}

export const storage = new MemStorage();
