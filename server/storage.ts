import { type User, type InsertUser, type VerifiedFact, type InsertVerifiedFact, type FactsEvaluation, type InsertFactsEvaluation, type Source, type InsertSource, type UpdateSource, type ScoringSettings, type InsertScoringSettings, type UpdateScoringSettings, type RequestedFact, type InsertRequestedFact, type SourceActivityLog, type InsertSourceActivityLog, type FactsActivityLog, type InsertFactsActivityLog, type SourceIdentityMetrics, type InsertSourceIdentityMetrics, type UpdateSourceIdentityMetrics, type TldScore, type InsertTldScore, type UpdateTldScore } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { verifiedFacts, factsEvaluation, sources, scoringSettings, requestedFacts, sourceActivityLog, factsActivityLog, sourceIdentityMetrics, tldScores } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "./evaluation-scoring";
import * as https from "https";
import { whoisDomain } from "whoiser";

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
  getAllTldScores(): Promise<TldScore[]>;
  getTldScore(tld: string): Promise<TldScore | undefined>;
  upsertTldScore(tldScore: InsertTldScore): Promise<TldScore>;
  deleteTldScore(tld: string): Promise<void>;
  recalculateUrlRepute(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; tld: string; }[]; }>;
  recalculateCertificates(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; status: string; }[]; }>;
  recalculateOwnership(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; status: string; registrar?: string; organization?: string; domainAge?: number; }[]; }>;
}

// Utility function to extract best matching TLD from domain
// Supports multi-segment TLDs like .co.uk, .gov.au, etc.
// Returns the original-case TLD string for proper database lookup
async function extractBestMatchingTld(domain: string, allTldScores: TldScore[]): Promise<string> {
  const normalizedDomain = domain.toLowerCase();
  let bestMatch = '';
  let bestMatchOriginal = '';
  
  // Find the longest matching TLD
  for (const tldScore of allTldScores) {
    const normalizedTld = tldScore.tld.toLowerCase();
    if (normalizedDomain.endsWith(normalizedTld)) {
      // Prefer longer TLDs (e.g., .co.uk over .uk)
      if (normalizedTld.length > bestMatch.length) {
        bestMatch = normalizedTld;
        bestMatchOriginal = tldScore.tld; // Keep original case for DB lookup
      }
    }
  }
  
  return bestMatchOriginal;
}

// Utility function to check SSL/TLS certificate validity for a domain
// Returns 100 for valid certificate, 0 for invalid/missing/error
async function checkCertificateValidity(domain: string): Promise<{ score: number; status: string; }> {
  return new Promise((resolve) => {
    const options = {
      hostname: domain,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 5000, // 5 second timeout
    };

    const req = https.request(options, (res) => {
      // If we get here, the connection succeeded and certificate is valid
      const cert = (res.socket as any).getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        resolve({ score: 0, status: 'no_certificate' });
        return;
      }

      // Check if certificate is valid (not expired)
      const now = new Date();
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);

      if (now < validFrom || now > validTo) {
        resolve({ score: 0, status: 'expired' });
        return;
      }

      resolve({ score: 100, status: 'valid' });
    });

    req.on('error', (err: any) => {
      // Certificate errors, connection errors, etc.
      if (err.code === 'CERT_HAS_EXPIRED') {
        resolve({ score: 0, status: 'expired' });
      } else if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
        resolve({ score: 0, status: 'self_signed' });
      } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'CERT_UNTRUSTED') {
        resolve({ score: 0, status: 'untrusted' });
      } else {
        // Other errors (timeout, connection refused, etc.)
        resolve({ score: 0, status: 'unreachable' });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ score: 0, status: 'timeout' });
    });

    req.end();
  });
}

// Utility function to extract root domain from a full domain
// e.g., "data.worldbank.org" -> "worldbank.org"
//       "en.wikipedia.org" -> "wikipedia.org"
//       "www.imf.org" -> "imf.org"
function extractRootDomain(fullDomain: string): string {
  const parts = fullDomain.split('.');
  if (parts.length <= 2) {
    return fullDomain; // already a root domain
  }
  // Return last two parts (domain + TLD)
  // This is a simplified approach that works for most .org, .com domains
  // For multi-segment TLDs like .co.uk, we'd need a more sophisticated approach
  return parts.slice(-2).join('.');
}

// Utility function to check domain ownership via WHOIS
// Returns score (0-100) based on organization trust, registrar reputation, and domain age
async function checkDomainOwnership(domain: string): Promise<{ score: number; status: string; registrar?: string; organization?: string; domainAge?: number; }> {
  try {
    // Extract root domain for WHOIS lookup (WHOIS only works on registered domains, not subdomains)
    const rootDomain = extractRootDomain(domain);
    console.log(`[WHOIS] Starting lookup for domain: ${domain} (root: ${rootDomain})`);
    
    // Perform WHOIS lookup on root domain
    const whoisData = await whoisDomain(rootDomain, { timeout: 10000 });
    console.log(`[WHOIS] Received data for ${rootDomain}:`, Object.keys(whoisData || {}));
    
    // whoiser returns an object with WHOIS server keys
    // Find the most detailed record (usually the registrar's WHOIS server)
    let bestRecord: any = null;
    for (const serverKey in whoisData) {
      const record = whoisData[serverKey];
      if (record && typeof record === 'object') {
        // Prefer records with more fields
        if (!bestRecord || Object.keys(record).length > Object.keys(bestRecord).length) {
          bestRecord = record;
        }
      }
    }
    
    if (!bestRecord) {
      console.log(`[WHOIS] No valid record found for ${rootDomain}`);
      return { score: 0, status: 'no_whois_data' };
    }
    
    console.log(`[WHOIS] Best record for ${rootDomain} has ${Object.keys(bestRecord).length} fields`);
    
    // Extract key fields (field names vary by registrar)
    const registrar = bestRecord['Registrar'] || bestRecord['registrar'] || 
                     bestRecord['Registrar Name'] || bestRecord['registrar name'] || '';
    
    const organization = bestRecord['Registrant Organization'] || bestRecord['registrant organization'] ||
                        bestRecord['Organization'] || bestRecord['organization'] ||
                        bestRecord['Registrant Name'] || bestRecord['registrant name'] || '';
    
    const createdDate = bestRecord['Creation Date'] || bestRecord['creation date'] ||
                       bestRecord['Created Date'] || bestRecord['created date'] ||
                       bestRecord['Domain Registration Date'] || '';
    
    // Calculate domain age in years
    let domainAge = 0;
    if (createdDate) {
      const created = new Date(createdDate);
      if (!isNaN(created.getTime())) {
        domainAge = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
      }
    }
    
    // Trusted organizations (score 100)
    const trustedOrgs = [
      'world bank',
      'international bank for reconstruction and development',
      'wikimedia foundation',
      'united nations',
      'international monetary fund',
      'imf',
      'wikidata',
      'wikipedia'
    ];
    
    const orgLower = organization.toLowerCase();
    console.log(`[WHOIS] ${rootDomain} - Registrar: "${registrar}", Org: "${organization}", Age: ${domainAge.toFixed(1)} years`);
    
    if (trustedOrgs.some(trusted => orgLower.includes(trusted))) {
      console.log(`[WHOIS] ${rootDomain} matched trusted org! Score: 100`);
      return { 
        score: 100, 
        status: 'trusted_organization',
        registrar,
        organization,
        domainAge
      };
    }
    
    // Reputable registrars (for tier 2 scoring)
    const reputableRegistrars = [
      'markmonitor',
      'csc corporate domains',
      'godaddy',
      'namecheap',
      'network solutions',
      'enom',
      'gandi',
      'tucows'
    ];
    
    const registrarLower = registrar.toLowerCase();
    const hasReputableRegistrar = reputableRegistrars.some(rep => registrarLower.includes(rep));
    
    // Tier 2: Reputable registrar + domain age > 5 years (score 75)
    if (hasReputableRegistrar && domainAge > 5) {
      console.log(`[WHOIS] ${rootDomain} has reputable registrar + aged. Score: 75`);
      return {
        score: 75,
        status: 'reputable_registrar_aged',
        registrar,
        organization,
        domainAge
      };
    }
    
    // Tier 3: Valid WHOIS data with registrar info (score 50)
    if (registrar) {
      console.log(`[WHOIS] ${rootDomain} has valid WHOIS. Score: 50`);
      return {
        score: 50,
        status: 'valid_whois',
        registrar,
        organization,
        domainAge
      };
    }
    
    // Tier 4: Privacy-protected or minimal data (score 0)
    console.log(`[WHOIS] ${rootDomain} privacy-protected or minimal data. Score: 0`);
    return {
      score: 0,
      status: 'privacy_protected',
      registrar,
      organization,
      domainAge
    };
    
  } catch (error: any) {
    console.error(`[WHOIS] Error looking up domain:`, error.message);
    return { 
      score: 0, 
      status: 'whois_error'
    };
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  // Get TLD score for a given domain (returns 0 if TLD not configured)
  private async getTldScoreForDomain(domain: string): Promise<number> {
    const allTldScores = await this.getAllTldScores();
    const matchingTld = await extractBestMatchingTld(domain, allTldScores);
    
    if (!matchingTld) return 0;
    
    const tldScore = await this.getTldScore(matchingTld);
    return tldScore?.score ?? 0;
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
        Math.round((source.identity_score + source.legitimacy + source.data_quality + source.data_accuracy + source.proprietary_score) / 5)
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

    // Ensure source has identity metrics tracking
    const existingMetrics = await this.getSourceIdentityMetric(domain);
    if (!existingMetrics) {
      // Auto-create identity metrics with initial values
      await this.insertSourceIdentityMetrics({
        domain,
        status: 'trusted',
        // url_repute will be auto-calculated from TLD
        // certificate and ownership will default to 0
      });
    }

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
    // Auto-calculate url_repute from TLD scores if not explicitly provided
    const urlRepute = metrics.url_repute ?? await this.getTldScoreForDomain(metrics.domain);
    const certificate = metrics.certificate ?? 0;
    const ownership = metrics.ownership ?? 0;
    
    const identityScore = Math.round((urlRepute + certificate + ownership) / 3);
    
    const [inserted] = await db
      .insert(sourceIdentityMetrics)
      .values({
        ...metrics,
        url_repute: urlRepute,
        certificate: certificate,
        ownership: ownership,
        identity_score: identityScore,
      })
      .returning();
    
    return inserted;
  }

  async updateSourceIdentityMetrics(domain: string, updates: UpdateSourceIdentityMetrics): Promise<SourceIdentityMetrics | undefined> {
    let identityScore: number | undefined;
    
    // If url_repute, certificate, or ownership is being updated, recalculate identity_score
    if (updates.url_repute !== undefined || updates.certificate !== undefined || updates.ownership !== undefined) {
      const existing = await this.getSourceIdentityMetric(domain);
      if (existing) {
        const urlRepute = updates.url_repute ?? existing.url_repute;
        const certificate = updates.certificate ?? existing.certificate;
        const ownership = updates.ownership ?? existing.ownership;
        identityScore = Math.round((urlRepute + certificate + ownership) / 3);
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
    
    // Sync identity_score to sources table if it was updated
    if (updated && identityScore !== undefined) {
      await db
        .update(sources)
        .set({ identity_score: identityScore })
        .where(eq(sources.domain, domain));
    }
    
    return updated;
  }

  async getAllTldScores(): Promise<TldScore[]> {
    return db.select().from(tldScores);
  }

  async getTldScore(tld: string): Promise<TldScore | undefined> {
    const [score] = await db
      .select()
      .from(tldScores)
      .where(eq(tldScores.tld, tld));
    return score;
  }

  async upsertTldScore(tldScore: InsertTldScore): Promise<TldScore> {
    const [upserted] = await db
      .insert(tldScores)
      .values({
        ...tldScore,
        updated_at: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: tldScores.tld,
        set: {
          score: tldScore.score,
          notes: tldScore.notes,
          updated_at: new Date().toISOString(),
        },
      })
      .returning();
    
    return upserted;
  }

  async deleteTldScore(tld: string): Promise<void> {
    await db.delete(tldScores).where(eq(tldScores.tld, tld));
  }

  async recalculateUrlRepute(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; tld: string; }[]; }> {
    const allMetrics = await this.getAllSourceIdentityMetrics();
    const allTldScores = await this.getAllTldScores();
    const updateResults: { domain: string; oldScore: number; newScore: number; tld: string; }[] = [];
    let updatedCount = 0;
    
    for (const metric of allMetrics) {
      const oldScore = metric.url_repute;
      const newScore = await this.getTldScoreForDomain(metric.domain);
      const matchedTld = await extractBestMatchingTld(metric.domain, allTldScores);
      
      if (oldScore !== newScore) {
        // Update url_repute and recalculate identity_score
        const certificate = metric.certificate;
        const ownership = metric.ownership;
        const identityScore = Math.round((newScore + certificate + ownership) / 3);
        
        await db
          .update(sourceIdentityMetrics)
          .set({
            url_repute: newScore,
            identity_score: identityScore,
            updated_at: new Date().toISOString(),
          })
          .where(eq(sourceIdentityMetrics.domain, metric.domain));
        
        // Sync identity_score to sources table
        await db
          .update(sources)
          .set({ identity_score: identityScore })
          .where(eq(sources.domain, metric.domain));
        
        updateResults.push({
          domain: metric.domain,
          oldScore,
          newScore,
          tld: matchedTld || 'unknown',
        });
        updatedCount++;
      }
    }
    
    return { updated: updatedCount, sources: updateResults };
  }

  async recalculateCertificates(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; status: string; }[]; }> {
    const allMetrics = await this.getAllSourceIdentityMetrics();
    const updateResults: { domain: string; oldScore: number; newScore: number; status: string; }[] = [];
    let updatedCount = 0;
    
    for (const metric of allMetrics) {
      const oldScore = metric.certificate;
      
      // Check certificate validity for this domain
      const certResult = await checkCertificateValidity(metric.domain);
      const newScore = certResult.score;
      
      if (oldScore !== newScore) {
        // Update certificate and recalculate identity_score
        const urlRepute = metric.url_repute;
        const ownership = metric.ownership;
        const identityScore = Math.round((urlRepute + newScore + ownership) / 3);
        
        await db
          .update(sourceIdentityMetrics)
          .set({
            certificate: newScore,
            identity_score: identityScore,
            updated_at: new Date().toISOString(),
          })
          .where(eq(sourceIdentityMetrics.domain, metric.domain));
        
        // Sync identity_score to sources table
        await db
          .update(sources)
          .set({ identity_score: identityScore })
          .where(eq(sources.domain, metric.domain));
        
        updateResults.push({
          domain: metric.domain,
          oldScore,
          newScore,
          status: certResult.status,
        });
        updatedCount++;
      }
    }
    
    return { updated: updatedCount, sources: updateResults };
  }

  async recalculateOwnership(): Promise<{ updated: number; sources: { domain: string; oldScore: number; newScore: number; status: string; registrar?: string; organization?: string; domainAge?: number; }[]; }> {
    const allMetrics = await this.getAllSourceIdentityMetrics();
    const updateResults: { domain: string; oldScore: number; newScore: number; status: string; registrar?: string; organization?: string; domainAge?: number; }[] = [];
    let updatedCount = 0;
    
    for (const metric of allMetrics) {
      const oldScore = metric.ownership;
      
      // Check domain ownership via WHOIS
      const ownershipResult = await checkDomainOwnership(metric.domain);
      const newScore = ownershipResult.score;
      
      if (oldScore !== newScore) {
        // Update ownership and recalculate identity_score
        const urlRepute = metric.url_repute;
        const certificate = metric.certificate;
        const identityScore = Math.round((urlRepute + certificate + newScore) / 3);
        
        await db
          .update(sourceIdentityMetrics)
          .set({
            ownership: newScore,
            ownership_registrar: ownershipResult.registrar || null,
            ownership_organization: ownershipResult.organization || null,
            ownership_domain_age: ownershipResult.domainAge || null,
            ownership_status: ownershipResult.status,
            identity_score: identityScore,
            updated_at: new Date().toISOString(),
          })
          .where(eq(sourceIdentityMetrics.domain, metric.domain));
        
        // Sync identity_score to sources table
        await db
          .update(sources)
          .set({ identity_score: identityScore })
          .where(eq(sources.domain, metric.domain));
        
        updateResults.push({
          domain: metric.domain,
          oldScore,
          newScore,
          status: ownershipResult.status,
          registrar: ownershipResult.registrar,
          organization: ownershipResult.organization,
          domainAge: ownershipResult.domainAge,
        });
        updatedCount++;
      }
    }
    
    return { updated: updatedCount, sources: updateResults };
  }
  
  async syncIdentityScores(): Promise<{ synced: number; sources: { domain: string; oldScore: number; newScore: number; }[]; }> {
    // Get all sources
    const allSources = await db.select().from(sources);
    
    // Get all identity metrics
    const allMetrics = await this.getAllSourceIdentityMetrics();
    const metricsMap = new Map(allMetrics.map(m => [m.domain, m.identity_score]));
    
    const syncResults: { domain: string; oldScore: number; newScore: number; }[] = [];
    let syncedCount = 0;
    
    for (const source of allSources) {
      const metricScore = metricsMap.get(source.domain) ?? 0;
      const oldScore = source.identity_score;
      
      if (oldScore !== metricScore) {
        await db
          .update(sources)
          .set({ identity_score: metricScore })
          .where(eq(sources.domain, source.domain));
        
        syncResults.push({
          domain: source.domain,
          oldScore,
          newScore: metricScore,
        });
        syncedCount++;
      }
    }
    
    return { synced: syncedCount, sources: syncResults };
  }
}

export const storage = new MemStorage();
