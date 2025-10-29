import { type User, type InsertUser, type VerifiedFact, type InsertVerifiedFact, type FactsEvaluation, type InsertFactsEvaluation, type Source, type InsertSource, type UpdateSource, type ScoringSettings, type InsertScoringSettings, type UpdateScoringSettings, type RequestedFact, type InsertRequestedFact, type SourceActivityLog, type InsertSourceActivityLog, type FactsActivityLog, type InsertFactsActivityLog, type SourceIdentityMetrics, type InsertSourceIdentityMetrics, type UpdateSourceIdentityMetrics, type TldScore, type InsertTldScore, type UpdateTldScore, type HistoricalEvent, type InsertHistoricalEvent } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { verifiedFacts, factsEvaluation, sources, scoringSettings, requestedFacts, sourceActivityLog, factsActivityLog, sourceIdentityMetrics, tldScores, historicalEvents } from "@shared/schema";
import { eq, and, sql, desc, gte, lte, between } from "drizzle-orm";
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

export interface AttributeInfo {
  attribute: string;
  description: string;
  dataType: string;
  apiCode?: string;
}

export interface SourceCoverage {
  domain: string;
  status: string;
  attributes: AttributeInfo[];
  totalFacts: number;
}

export interface DataCoverageResponse {
  sources: SourceCoverage[];
  allAttributes: string[];
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
  addAndScoreTrustedSource(domain: string, legitimacy?: number, trust?: number): Promise<{ success: boolean; error?: string; source?: Source; metrics?: SourceIdentityMetrics; urlReputeStatus?: string; certificateStatus?: string; ownershipStatus?: string; }>;
  getDataCoverage(): Promise<DataCoverageResponse>;
  getAllHistoricalEvents(): Promise<HistoricalEvent[]>;
  getEventsByEntity(entity: string): Promise<HistoricalEvent[]>;
  getEventsByDateRange(entity: string, startYear: number, endYear: number): Promise<HistoricalEvent[]>;
  insertHistoricalEvent(event: InsertHistoricalEvent): Promise<HistoricalEvent>;
  insertHistoricalEventWithFactEvaluation(event: InsertHistoricalEvent): Promise<{ event: HistoricalEvent; factCreated: boolean; factEvaluation?: FactsEvaluation; isDuplicate: boolean; }>;
  backfillHistoricalFacts(): Promise<{ processed: number; created: number; skipped: number; results: { entity: string; event_type: string; attribute: string; year: number; created: boolean; }[]; }>;
}

// Utility function to validate hostname format
// Ensures valid DNS hostname: no empty labels, no leading/trailing dots, valid character set
function isValidHostname(hostname: string): boolean {
  // Must have at least one dot (minimum: label.tld)
  if (!hostname.includes('.')) {
    return false;
  }
  
  // No leading or trailing dots
  if (hostname.startsWith('.') || hostname.endsWith('.')) {
    return false;
  }
  
  // Split into labels (parts between dots)
  const labels = hostname.split('.');
  
  // Must have at least 2 labels (e.g., example.com)
  if (labels.length < 2) {
    return false;
  }
  
  // Validate each label
  for (const label of labels) {
    // No empty labels (catches consecutive dots like "example..com")
    if (label.length === 0) {
      return false;
    }
    
    // Label must be 1-63 characters
    if (label.length > 63) {
      return false;
    }
    
    // Label must contain only valid characters (letters, digits, hyphens)
    // Cannot start or end with hyphen
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) {
      return false;
    }
  }
  
  // TLD (last label) must be at least 2 characters
  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    return false;
  }
  
  return true;
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
    
    // Check which facts already exist in verified_facts
    const existingFacts = await db.select().from(verifiedFacts);
    const existingMap = new Map(
      existingFacts.map(f => [
        `${f.entity}|||${f.attribute}|||${f.source_name}|||${f.as_of_date || ''}`,
        f
      ])
    );

    // Separate facts into new vs updates
    const newFacts: typeof factsToPromote = [];
    const factsToUpdate: typeof factsToPromote = [];
    const logsToInsert: InsertFactsActivityLog[] = [];

    for (const fact of factsToPromote) {
      const key = `${fact.entity}|||${fact.attribute}|||${fact.source_name}|||${fact.as_of_date || ''}`;
      
      if (existingMap.has(key)) {
        factsToUpdate.push(fact);
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
      } else {
        newFacts.push(fact);
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
      }
    }

    // Batch insert all new facts
    if (newFacts.length > 0) {
      const valuesToInsert = newFacts.map(fact => ({
        entity: fact.entity,
        entity_type: fact.entity_type,
        attribute: fact.attribute,
        attribute_class: fact.attribute_class,
        value: fact.value,
        value_type: fact.value_type,
        source_url: fact.source_url,
        source_name: fact.source_name,
        as_of_date: fact.as_of_date,
        last_verified_at: fact.evaluated_at,
      }));
      
      await db.insert(verifiedFacts).values(valuesToInsert);
    }

    // Batch update existing facts using raw SQL for efficiency
    if (factsToUpdate.length > 0) {
      // Build a batch update using CASE statements for each fact
      const valueCases = factsToUpdate.map((fact, idx) => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `WHEN entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond} THEN '${fact.value.replace(/'/g, "''")}'`;
      }).join(' ');
      
      const timestampCases = factsToUpdate.map((fact, idx) => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `WHEN entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond} THEN '${fact.evaluated_at.replace(/'/g, "''")}'`;
      }).join(' ');
      
      const sourceUrlCases = factsToUpdate.map((fact, idx) => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `WHEN entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond} THEN '${fact.source_url.replace(/'/g, "''")}'`;
      }).join(' ');
      
      const valueTypeCases = factsToUpdate.map((fact, idx) => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `WHEN entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond} THEN '${fact.value_type.replace(/'/g, "''")}'`;
      }).join(' ');
      
      const attributeClassCases = factsToUpdate.map((fact, idx) => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `WHEN entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond} THEN '${fact.attribute_class.replace(/'/g, "''")}'`;
      }).join(' ');
      
      // Build WHERE clause to match any of the facts to update
      const whereConditions = factsToUpdate.map(fact => {
        const asOfDateCond = fact.as_of_date 
          ? `AND as_of_date = '${fact.as_of_date}'`
          : `AND as_of_date IS NULL`;
        return `(entity = '${fact.entity.replace(/'/g, "''")}' AND attribute = '${fact.attribute.replace(/'/g, "''")}' AND source_name = '${fact.source_name.replace(/'/g, "''")}' ${asOfDateCond})`;
      }).join(' OR ');
      
      await db.execute(sql.raw(`
        UPDATE verified_facts
        SET 
          value = CASE ${valueCases} END,
          last_verified_at = CASE ${timestampCases} END,
          source_url = CASE ${sourceUrlCases} END,
          value_type = CASE ${valueTypeCases} END,
          attribute_class = CASE ${attributeClassCases} END
        WHERE ${whereConditions}
      `));
    }

    // Batch insert logs
    if (logsToInsert.length > 0) {
      await this.logFactsActivityBatch(logsToInsert);
    }

    // Sync facts_count for all sources in bulk
    await this.syncFactsCount();

    return { promotedCount: newFacts.length + factsToUpdate.length, skippedCount: 0 };
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

  async addAndScoreTrustedSource(domain: string, legitimacy: number = 70, trust: number = 70): Promise<{ success: boolean; error?: string; source?: Source; metrics?: SourceIdentityMetrics; urlReputeStatus?: string; certificateStatus?: string; ownershipStatus?: string; }> {
    try {
      // 1. Normalize domain input
      let normalizedDomain = domain.trim();
      
      // Remove protocol (http://, https://)
      normalizedDomain = normalizedDomain.replace(/^https?:\/\//i, '');
      
      // Remove path, query string, and hash
      normalizedDomain = normalizedDomain.split('/')[0].split('?')[0].split('#')[0];
      
      // Lowercase
      normalizedDomain = normalizedDomain.toLowerCase();
      
      // Validate hostname format using strict DNS rules
      if (!isValidHostname(normalizedDomain)) {
        return { success: false, error: 'Invalid domain format. Expected valid hostname like example.gov (no protocol, path, or malformed labels)' };
      }

      // 2. Check for duplicates
      const [existing] = await db
        .select()
        .from(sources)
        .where(eq(sources.domain, normalizedDomain))
        .limit(1);
      
      if (existing) {
        return { success: false, error: `Source already exists: ${normalizedDomain}` };
      }

      // Continue with normalized domain
      domain = normalizedDomain;

      // 3. Add source to pipeline
      const newSource = await this.insertSource({
        domain,
        status: 'pending_review',
        legitimacy: legitimacy,
        data_quality: trust,
        data_accuracy: trust,
        proprietary_score: 0,
        identity_score: 0,
        facts_count: 0,
      });

      // 4. Promote to trusted (this auto-creates identity metrics with TLD-based url_repute)
      const promotedSource = await this.promoteSource(domain);
      if (!promotedSource) {
        return { success: false, error: 'Failed to promote source' };
      }

      // 5. Get the auto-created identity metrics
      let metrics = await this.getSourceIdentityMetric(domain);
      if (!metrics) {
        return { success: false, error: 'Failed to create identity metrics' };
      }

      // Determine TLD for status reporting
      const allTlds = await this.getAllTldScores();
      const tldMatch = await extractBestMatchingTld(domain, allTlds);
      const urlReputeStatus = tldMatch ? `TLD ${tldMatch} configured` : 'No TLD match, defaulted to 0';

      // 6. Run certificate validation for this specific domain
      const certResult = await checkCertificateValidity(domain);
      const certificateStatus = certResult.status;
      
      // Update certificate score
      if (certResult.score !== metrics.certificate) {
        const urlRepute = metrics.url_repute;
        const ownership = metrics.ownership;
        const identityScore = Math.round((urlRepute + certResult.score + ownership) / 3);
        
        await db
          .update(sourceIdentityMetrics)
          .set({
            certificate: certResult.score,
            identity_score: identityScore,
            updated_at: new Date().toISOString(),
          })
          .where(eq(sourceIdentityMetrics.domain, domain));
        
        // Sync to sources table
        await db
          .update(sources)
          .set({ identity_score: identityScore })
          .where(eq(sources.domain, domain));
        
        metrics = await this.getSourceIdentityMetric(domain);
      }

      // 7. Run WHOIS ownership check for this specific domain
      const ownershipResult = await checkDomainOwnership(domain);
      const ownershipStatus = ownershipResult.status;
      
      // Update ownership score
      if (metrics && ownershipResult.score !== metrics.ownership) {
        const urlRepute = metrics.url_repute;
        const certificate = metrics.certificate;
        const identityScore = Math.round((urlRepute + certificate + ownershipResult.score) / 3);
        
        await db
          .update(sourceIdentityMetrics)
          .set({
            ownership: ownershipResult.score,
            ownership_registrar: ownershipResult.registrar || null,
            ownership_organization: ownershipResult.organization || null,
            ownership_domain_age: ownershipResult.domainAge || null,
            ownership_status: ownershipResult.status,
            identity_score: identityScore,
            updated_at: new Date().toISOString(),
          })
          .where(eq(sourceIdentityMetrics.domain, domain));
        
        // Sync to sources table
        await db
          .update(sources)
          .set({ identity_score: identityScore })
          .where(eq(sources.domain, domain));
        
        metrics = await this.getSourceIdentityMetric(domain);
      }

      // 8. Return success with all details
      return {
        success: true,
        source: promotedSource,
        metrics: metrics || undefined,
        urlReputeStatus,
        certificateStatus,
        ownershipStatus,
      };
    } catch (error: any) {
      console.error('[addAndScoreTrustedSource] Error:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }

  async getDataCoverage(): Promise<DataCoverageResponse> {
    // Define source capabilities based on integration files
    const sourceCapabilities: Record<string, AttributeInfo[]> = {
      'data.worldbank.org': [
        { attribute: 'population', description: 'Total population', dataType: 'numeric', apiCode: 'SP.POP.TOTL' },
        { attribute: 'gdp', description: 'GDP (current US$)', dataType: 'numeric', apiCode: 'NY.GDP.MKTP.CD' },
        { attribute: 'gdp_per_capita', description: 'GDP per capita (current US$)', dataType: 'numeric', apiCode: 'NY.GDP.PCAP.CD' },
        { attribute: 'area', description: 'Land area (sq. km)', dataType: 'numeric', apiCode: 'AG.LND.TOTL.K2' },
        { attribute: 'inflation', description: 'Inflation, consumer prices (annual %)', dataType: 'numeric', apiCode: 'FP.CPI.TOTL.ZG' },
        { attribute: 'life_expectancy', description: 'Life expectancy at birth', dataType: 'numeric', apiCode: 'SP.DYN.LE00.IN' },
        { attribute: 'unemployment', description: 'Unemployment (% of labor force)', dataType: 'numeric', apiCode: 'SL.UEM.TOTL.ZS' },
      ],
      'en.wikipedia.org': [
        { attribute: 'founded_year', description: 'Year of founding/inception', dataType: 'year', apiCode: undefined },
        { attribute: 'population', description: 'Population from Wikipedia', dataType: 'numeric', apiCode: undefined },
        { attribute: 'area', description: 'Land area from Wikipedia', dataType: 'numeric', apiCode: undefined },
      ],
      'www.wikidata.org': [
        { attribute: 'population', description: 'Population (P1082)', dataType: 'numeric', apiCode: 'P1082' },
        { attribute: 'gdp', description: 'Nominal GDP (P2131)', dataType: 'numeric', apiCode: 'P2131' },
        { attribute: 'area', description: 'Area in km² (P2046)', dataType: 'numeric', apiCode: 'P2046' },
        { attribute: 'founded_year', description: 'Inception date (P571)', dataType: 'year', apiCode: 'P571' },
      ],
      'www.imf.org': [
        { attribute: 'gdp', description: 'Nominal GDP in domestic currency', dataType: 'numeric', apiCode: 'NGDP_XDC' },
        { attribute: 'inflation', description: 'Consumer Price Index', dataType: 'numeric', apiCode: 'PCPI_IX' },
        { attribute: 'unemployment', description: 'Unemployment rate (percent)', dataType: 'numeric', apiCode: 'LUR_PT' },
      ],
      'unstats.un.org': [
        { attribute: 'population', description: 'Population statistics', dataType: 'numeric', apiCode: undefined },
      ],
    };

    // Get all sources from database
    const allSources = await this.getAllSources();

    // Filter to only include trusted sources that have configured capabilities
    // This excludes test sources, rejected sources, and pending sources
    const sourcesWithCapabilities = allSources.filter(source => 
      source.status === 'trusted' &&
      sourceCapabilities[source.domain] && 
      sourceCapabilities[source.domain].length > 0
    );

    // Build coverage data
    const sourceCoverage: SourceCoverage[] = sourcesWithCapabilities.map(source => ({
      domain: source.domain,
      status: source.status,
      attributes: sourceCapabilities[source.domain],
      totalFacts: source.facts_count,
    }));

    // Get unique attributes across all sources
    const allAttributesSet = new Set<string>();
    Object.values(sourceCapabilities).forEach(attrs => {
      attrs.forEach(attr => allAttributesSet.add(attr.attribute));
    });
    const allAttributes = Array.from(allAttributesSet).sort();

    return {
      sources: sourceCoverage,
      allAttributes,
    };
  }

  async getAllHistoricalEvents(): Promise<HistoricalEvent[]> {
    const events = await db.select().from(historicalEvents).orderBy(historicalEvents.event_year);
    return events;
  }

  async getEventsByEntity(entity: string): Promise<HistoricalEvent[]> {
    const events = await db
      .select()
      .from(historicalEvents)
      .where(eq(historicalEvents.entity, entity))
      .orderBy(historicalEvents.event_year);
    return events;
  }

  async getEventsByDateRange(entity: string, startYear: number, endYear: number): Promise<HistoricalEvent[]> {
    const events = await db
      .select()
      .from(historicalEvents)
      .where(
        and(
          eq(historicalEvents.entity, entity),
          gte(historicalEvents.event_year, startYear),
          lte(historicalEvents.event_year, endYear)
        )
      )
      .orderBy(historicalEvents.event_year);
    return events;
  }

  async insertHistoricalEvent(event: InsertHistoricalEvent): Promise<HistoricalEvent> {
    const [inserted] = await db.insert(historicalEvents).values(event).returning();
    return inserted;
  }

  async insertHistoricalEventWithFactEvaluation(event: InsertHistoricalEvent): Promise<{ 
    event: HistoricalEvent; 
    factCreated: boolean; 
    factEvaluation?: FactsEvaluation; 
    isDuplicate: boolean; 
  }> {
    // Check if event already exists (deduplication based on entity + year + title)
    const existingEvent = await db
      .select()
      .from(historicalEvents)
      .where(
        and(
          eq(historicalEvents.entity, event.entity),
          eq(historicalEvents.event_year, event.event_year),
          eq(historicalEvents.title, event.title)
        )
      )
      .limit(1);

    const isDuplicate = existingEvent.length > 0;
    const eventRecord = isDuplicate ? existingEvent[0] : await db.insert(historicalEvents).values(event).returning().then(r => r[0]);

    // Determine if we should create a corresponding fact evaluation
    // Map event_type to attribute
    let attribute: string | null = null;
    if (event.event_type === 'founding') {
      attribute = 'founded_year';
    } else if (event.event_type === 'independence') {
      attribute = 'independence_year';
    } else if (event.event_type === 'revolution') {
      attribute = 'revolution_year';
    } else if (event.event_type === 'liberation') {
      attribute = 'liberation_year';
    } else if (event.event_type === 'unification') {
      attribute = 'unification_year';
    } else if (event.event_type === 'war') {
      attribute = 'war_year';
    } else if (event.event_type === 'other') {
      attribute = 'significant_event_year';
    }

    let factEvaluation: FactsEvaluation | undefined;
    let factCreated = false;

    // Always try to create fact if attribute mapping exists, even for duplicate events
    // This enables backfilling facts for events created before the dual-insertion feature
    // Use eventRecord (stored DB record) instead of event (incoming payload) for source info
    const sourceName = eventRecord.source_name || event.source_name;
    const sourceUrl = eventRecord.source_url || event.source_url || `https://${sourceName}`;
    
    if (attribute && sourceName) {
      // Check if fact evaluation already exists for this entity+attribute+source
      const existingFact = await db
        .select()
        .from(factsEvaluation)
        .where(
          and(
            eq(factsEvaluation.entity, eventRecord.entity),
            eq(factsEvaluation.attribute, attribute),
            eq(factsEvaluation.source_name, sourceName)
          )
        )
        .limit(1);

      if (existingFact.length === 0) {
        // Create fact evaluation
        const factData: InsertFactsEvaluation = {
          entity: eventRecord.entity,
          attribute: attribute,
          value: eventRecord.event_year.toString(),
          value_type: 'numeric',
          source_url: sourceUrl,
          source_name: sourceName,
          evaluated_at: new Date().toISOString().split('T')[0],
          as_of_date: eventRecord.event_date || `${eventRecord.event_year}-01-01`,
          attribute_class: 'historical_constant'
        };

        factEvaluation = await this.insertFactsEvaluation(factData);
        factCreated = true;
      }
    }

    return {
      event: eventRecord,
      factCreated,
      factEvaluation,
      isDuplicate
    };
  }

  async backfillHistoricalFacts(): Promise<{ 
    processed: number; 
    created: number; 
    skipped: number; 
    results: { entity: string; event_type: string; attribute: string; year: number; created: boolean; }[]; 
  }> {
    // Get all historical events
    const allEvents = await db.select().from(historicalEvents).orderBy(historicalEvents.entity, historicalEvents.event_year);
    
    const results: { entity: string; event_type: string; attribute: string; year: number; created: boolean; }[] = [];
    let processed = 0;
    let created = 0;
    let skipped = 0;

    for (const event of allEvents) {
      processed++;
      
      // Map event_type to attribute
      let attribute: string | null = null;
      if (event.event_type === 'founding') {
        attribute = 'founded_year';
      } else if (event.event_type === 'independence') {
        attribute = 'independence_year';
      } else if (event.event_type === 'revolution') {
        attribute = 'revolution_year';
      } else if (event.event_type === 'liberation') {
        attribute = 'liberation_year';
      } else if (event.event_type === 'unification') {
        attribute = 'unification_year';
      } else if (event.event_type === 'war') {
        attribute = 'war_year';
      } else if (event.event_type === 'other') {
        attribute = 'significant_event_year';
      }

      if (!attribute || !event.source_name) {
        skipped++;
        continue;
      }

      // Check if fact evaluation already exists
      const existingFact = await db
        .select()
        .from(factsEvaluation)
        .where(
          and(
            eq(factsEvaluation.entity, event.entity),
            eq(factsEvaluation.attribute, attribute),
            eq(factsEvaluation.source_name, event.source_name)
          )
        )
        .limit(1);

      if (existingFact.length === 0) {
        // Create fact evaluation
        const factData: InsertFactsEvaluation = {
          entity: event.entity,
          attribute: attribute,
          value: event.event_year.toString(),
          value_type: 'numeric',
          source_url: event.source_url || `https://${event.source_name}`,
          source_name: event.source_name,
          evaluated_at: new Date().toISOString().split('T')[0],
          as_of_date: event.event_date || `${event.event_year}-01-01`,
          attribute_class: 'historical_constant'
        };

        await this.insertFactsEvaluation(factData);
        created++;
        
        results.push({
          entity: event.entity,
          event_type: event.event_type,
          attribute: attribute,
          year: event.event_year,
          created: true
        });
      } else {
        skipped++;
        
        results.push({
          entity: event.entity,
          event_type: event.event_type,
          attribute: attribute,
          year: event.event_year,
          created: false
        });
      }
    }

    return { processed, created, skipped, results };
  }
}

export const storage = new MemStorage();
