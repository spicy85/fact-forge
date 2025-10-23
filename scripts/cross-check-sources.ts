import { db } from "../server/db";
import { factsEvaluation, scoringSettings, factsActivityLog, type InsertFactsActivityLog } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchAllIndicatorsForCountry } from "../server/integrations/worldbank-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";
import { readFileSync } from "fs";
import { join } from "path";

// Load country Q-IDs from centralized mapping file
const COUNTRY_QIDS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "public/country-qids.json"), "utf-8")
);

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_PROPERTIES = {
  population: 'P1082',
  gdp_usd: 'P2131',
  area_km2: 'P2046',
  founded_year: 'P571'
};

interface CrossCheckStats {
  totalPairs: number;
  wikipediaAdded: number;
  worldBankAdded: number;
  wikidataAdded: number;
  duplicatesSkipped: number;
  errors: string[];
}

export async function crossCheckAllSources(): Promise<CrossCheckStats> {
  console.log("🔍 Starting cross-check of all sources...\n");

  const stats: CrossCheckStats = {
    totalPairs: 0,
    wikipediaAdded: 0,
    worldBankAdded: 0,
    wikidataAdded: 0,
    duplicatesSkipped: 0,
    errors: []
  };
  
  const activityLogs: InsertFactsActivityLog[] = [];

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  if (!settings) {
    throw new Error("No scoring settings found");
  }

  // Get all unique entity-attribute combinations
  const uniquePairs = await db
    .selectDistinct({
      entity: factsEvaluation.entity,
      attribute: factsEvaluation.attribute
    })
    .from(factsEvaluation);

  stats.totalPairs = uniquePairs.length;
  console.log(`Found ${stats.totalPairs} unique entity-attribute pairs\n`);

  // For each pair, check coverage across sources
  for (const pair of uniquePairs) {
    const { entity, attribute } = pair;
    
    // Check which sources already have this data
    const existing = await db
      .select({ source_trust: factsEvaluation.source_trust })
      .from(factsEvaluation)
      .where(
        and(
          eq(factsEvaluation.entity, entity),
          eq(factsEvaluation.attribute, attribute)
        )
      );

    const existingSources = new Set(existing.map(e => e.source_trust));
    
    // Try to fetch from missing sources
    const sources = [
      { name: 'en.wikipedia.org', fetch: fetchFromWikipedia },
      { name: 'data.worldbank.org', fetch: fetchFromWorldBank },
      { name: 'www.wikidata.org', fetch: fetchFromWikidata }
    ];

    for (const source of sources) {
      if (existingSources.has(source.name)) {
        stats.duplicatesSkipped++;
        continue; // Already have data from this source
      }

      try {
        const result = await source.fetch(entity, attribute, settings);
        if (result) {
          if (source.name === 'en.wikipedia.org') stats.wikipediaAdded++;
          else if (source.name === 'data.worldbank.org') stats.worldBankAdded++;
          else if (source.name === 'www.wikidata.org') stats.wikidataAdded++;
          console.log(`✓ Added ${entity} - ${attribute} from ${source.name}`);
          
          // Queue activity log entry
          activityLogs.push({
            entity,
            attribute,
            action: 'added',
            source: source.name,
            process: 'cross-check-sources',
            value: result.value,
            notes: result.notes || 'Cross-check import'
          });
        } else {
          // Fetcher returned false (duplicate found or unsupported)
          stats.duplicatesSkipped++;
        }
      } catch (error) {
        const errMsg = `Error fetching ${entity} - ${attribute} from ${source.name}: ${error}`;
        stats.errors.push(errMsg);
        console.error(`✗ ${errMsg}`);
      }
    }
  }

  // Batch log all added facts (non-blocking, with error handling)
  if (activityLogs.length > 0) {
    try {
      await db.insert(factsActivityLog).values(activityLogs);
      console.log(`\n✓ Logged ${activityLogs.length} added facts to activity log`);
    } catch (error: any) {
      console.error(`⚠ Warning: Failed to log activity (non-critical): ${error.message}`);
      // Script continues even if logging fails
    }
  }

  console.log("\n=== Cross-Check Complete ===");
  console.log(`Total pairs checked: ${stats.totalPairs}`);
  console.log(`Wikipedia added: ${stats.wikipediaAdded}`);
  console.log(`World Bank added: ${stats.worldBankAdded}`);
  console.log(`Wikidata added: ${stats.wikidataAdded}`);
  console.log(`Duplicates skipped: ${stats.duplicatesSkipped}`);
  console.log(`Errors: ${stats.errors.length}`);

  return stats;
}

async function fetchFromWikipedia(
  entity: string,
  attribute: string,
  settings: any
): Promise<{ value: string; notes: string } | null> {
  // Wikipedia data comes from verified_facts table
  // This function is a placeholder as Wikipedia data is already imported
  return null;
}

async function fetchFromWorldBank(
  entity: string,
  attribute: string,
  settings: any
): Promise<{ value: string; notes: string } | null> {
  // Map our attributes to World Bank indicators
  const attributeToIndicator: Record<string, string> = {
    'population': 'population',
    'gdp': 'gdp',
    'gdp_usd': 'gdp',
    'gdp_per_capita': 'gdp_per_capita',
    'area': 'area',
    'area_km2': 'area',
    'inflation': 'inflation'
  };

  const indicator = attributeToIndicator[attribute];
  if (!indicator) {
    return null; // Attribute not supported by World Bank
  }

  try {
    const indicatorMap = await fetchAllIndicatorsForCountry(entity);
    const dataPoints = indicatorMap.get(indicator);
    
    if (!dataPoints || dataPoints.length === 0) {
      return null;
    }

    const latestData = dataPoints.sort((a, b) => b.year - a.year)[0];
    const evaluatedAt = `${latestData.year}-12-31`;
    const as_of_date = latestData.as_of_date; // Use actual date from World Bank API
    const sourceUrl = "https://data.worldbank.org/";

    // Check for duplicates
    const existing = await db
      .select()
      .from(factsEvaluation)
      .where(
        and(
          eq(factsEvaluation.entity, entity),
          eq(factsEvaluation.attribute, attribute),
          eq(factsEvaluation.source_trust, "data.worldbank.org")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return null; // Already exists
    }

    // Calculate scores
    const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
    const recencyScore = calculateRecencyScore(
      evaluatedAt,
      settings.recency_tier1_days,
      settings.recency_tier1_score,
      settings.recency_tier2_days,
      settings.recency_tier2_score,
      settings.recency_tier3_score
    );
    const consensusScore = 95;
    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      settings.source_trust_weight,
      settings.recency_weight,
      settings.consensus_weight
    );

    const value = latestData.value.toString();
    const notes = `World Bank API, year ${latestData.year}, cross-check`;

    // Insert new record
    await db.insert(factsEvaluation).values({
      entity,
      attribute,
      value,
      value_type: "numeric",
      source_url: sourceUrl,
      source_trust: "data.worldbank.org",
      as_of_date,
      source_trust_score: sourceTrustScore,
      recency_score: recencyScore,
      consensus_score: consensusScore,
      source_trust_weight: settings.source_trust_weight,
      recency_weight: settings.recency_weight,
      consensus_weight: settings.consensus_weight,
      trust_score: trustScore,
      evaluation_notes: notes,
      evaluated_at: evaluatedAt,
      status: "evaluating"
    });

    return { value, notes };
  } catch (error) {
    throw error;
  }
}

async function fetchFromWikidata(
  entity: string,
  attribute: string,
  settings: any
): Promise<{ value: string; notes: string } | null> {
  const qid = COUNTRY_QIDS[entity];
  if (!qid) {
    return null; // Country not in our mapping
  }

  const propertyId = WIKIDATA_PROPERTIES[attribute as keyof typeof WIKIDATA_PROPERTIES];
  if (!propertyId) {
    return null; // Attribute not supported by Wikidata
  }

  try {
    let sparqlQuery = '';
    let attributeName = attribute;

    if (attribute === 'founded_year') {
      sparqlQuery = `
        SELECT ?value WHERE {
          wd:${qid} p:P571 ?statement.
          ?statement ps:P571 ?value.
        }
        LIMIT 1
      `;
    } else {
      sparqlQuery = `
        SELECT ?value ?pointInTime WHERE {
          wd:${qid} p:${propertyId} ?statement.
          ?statement ps:${propertyId} ?value.
          OPTIONAL { ?statement pq:P585 ?pointInTime. }
        }
        ORDER BY DESC(?pointInTime)
        LIMIT 1
      `;
    }

    const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparqlQuery)}&format=json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Replit-FactChecker/1.0',
        'Accept': 'application/sparql-results+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL query failed: ${response.status}`);
    }

    const data = await response.json();
    const bindings = data.results.bindings;

    if (bindings.length === 0) {
      return null; // No data found
    }

    const result = bindings[0];
    let value = result.value.value;
    let year: string;
    let as_of_date: string | null = null;

    // Extract year and date from value or pointInTime
    if (result.pointInTime) {
      const pointInTimeValue = result.pointInTime.value;
      year = pointInTimeValue.substring(0, 4);
      as_of_date = pointInTimeValue.split('T')[0]; // Extract YYYY-MM-DD
    } else if (attribute === 'founded_year') {
      // For founded_year, the value itself contains the date
      const foundedDate = value.substring(0, 10); // Extract YYYY-MM-DD
      year = value.substring(0, 4);
      as_of_date = foundedDate.split('T')[0];
      value = year;
    } else {
      // No point-in-time qualifier available - use current year for evaluation date only
      year = new Date().getFullYear().toString();
      // as_of_date remains null - we don't fabricate dates
    }

    const evaluatedAt = `${year}-12-31`;
    const sourceUrl = `https://www.wikidata.org/wiki/${qid}#${propertyId}`;

    // Check for duplicates
    const existing = await db
      .select()
      .from(factsEvaluation)
      .where(
        and(
          eq(factsEvaluation.entity, entity),
          eq(factsEvaluation.attribute, attributeName),
          eq(factsEvaluation.source_trust, "www.wikidata.org")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return null; // Already exists
    }

    // Calculate scores
    const sourceTrustScore = await calculateSourceTrustScore("https://www.wikidata.org/");
    const recencyScore = calculateRecencyScore(
      evaluatedAt,
      settings.recency_tier1_days,
      settings.recency_tier1_score,
      settings.recency_tier2_days,
      settings.recency_tier2_score,
      settings.recency_tier3_score
    );
    const consensusScore = 90;
    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      settings.source_trust_weight,
      settings.recency_weight,
      settings.consensus_weight
    );

    const valueStr = value.toString();
    const notes = `Wikidata, ${year}, cross-check`;

    // Insert new record
    await db.insert(factsEvaluation).values({
      entity,
      attribute: attributeName,
      value: valueStr,
      value_type: "numeric",
      source_url: sourceUrl,
      source_trust: "www.wikidata.org",
      as_of_date,
      source_trust_score: sourceTrustScore,
      recency_score: recencyScore,
      consensus_score: consensusScore,
      source_trust_weight: settings.source_trust_weight,
      recency_weight: settings.recency_weight,
      consensus_weight: settings.consensus_weight,
      trust_score: trustScore,
      evaluation_notes: notes,
      evaluated_at: evaluatedAt,
      status: "evaluating"
    });

    return { value: valueStr, notes };
  } catch (error) {
    throw error;
  }
}

// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  crossCheckAllSources()
    .then(() => {
      console.log("\n✓ Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n✗ Script failed:", error);
      process.exit(1);
    });
}
