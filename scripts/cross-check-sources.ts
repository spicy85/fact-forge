import { db } from "../server/db";
import { factsEvaluation, scoringSettings } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchAllIndicatorsForCountry } from "../server/integrations/worldbank-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

// Map our country names to Wikidata Q-IDs
const COUNTRY_QIDS: Record<string, string> = {
  'Argentina': 'Q414', 'Australia': 'Q408', 'Austria': 'Q40', 'Bangladesh': 'Q902',
  'Belgium': 'Q31', 'Brazil': 'Q155', 'Canada': 'Q16', 'Chile': 'Q298',
  'Colombia': 'Q739', 'Czech Republic': 'Q213', 'Denmark': 'Q35', 'Egypt': 'Q79',
  'Finland': 'Q33', 'France': 'Q142', 'Germany': 'Q183', 'Greece': 'Q41',
  'Hungary': 'Q28', 'India': 'Q668', 'Indonesia': 'Q252', 'Ireland': 'Q27',
  'Israel': 'Q801', 'Italy': 'Q38', 'Japan': 'Q17', 'Kingdom of the Netherlands': 'Q29999',
  'Malaysia': 'Q833', 'Mexico': 'Q96', 'New Zealand': 'Q664', 'Nigeria': 'Q1033',
  'Norway': 'Q20', 'Pakistan': 'Q843', 'Paraguay': 'Q733', 'People\'s Republic of China': 'Q148',
  'Philippines': 'Q928', 'Poland': 'Q36', 'Portugal': 'Q45', 'Romania': 'Q218',
  'Russia': 'Q159', 'Saudi Arabia': 'Q851', 'Singapore': 'Q334', 'South Africa': 'Q258',
  'South Korea': 'Q884', 'Spain': 'Q29', 'Sweden': 'Q34', 'Switzerland': 'Q39',
  'Thailand': 'Q869', 'Turkey': 'Q43', 'United States': 'Q30', 'Vietnam': 'Q881'
};

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
        continue; // Already have data from this source
      }

      try {
        const added = await source.fetch(entity, attribute, settings);
        if (added) {
          if (source.name === 'en.wikipedia.org') stats.wikipediaAdded++;
          else if (source.name === 'data.worldbank.org') stats.worldBankAdded++;
          else if (source.name === 'www.wikidata.org') stats.wikidataAdded++;
          console.log(`✓ Added ${entity} - ${attribute} from ${source.name}`);
        }
      } catch (error) {
        const errMsg = `Error fetching ${entity} - ${attribute} from ${source.name}: ${error}`;
        stats.errors.push(errMsg);
        console.error(`✗ ${errMsg}`);
      }
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
): Promise<boolean> {
  // Wikipedia data comes from verified_facts table
  // This function is a placeholder as Wikipedia data is already imported
  return false;
}

async function fetchFromWorldBank(
  entity: string,
  attribute: string,
  settings: any
): Promise<boolean> {
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
    return false; // Attribute not supported by World Bank
  }

  try {
    const indicatorMap = await fetchAllIndicatorsForCountry(entity);
    const dataPoints = indicatorMap.get(indicator);
    
    if (!dataPoints || dataPoints.length === 0) {
      return false;
    }

    const latestData = dataPoints.sort((a, b) => b.year - a.year)[0];
    const evaluatedAt = `${latestData.year}-12-31`;
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
      return false; // Already exists
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

    // Insert new record
    await db.insert(factsEvaluation).values({
      entity,
      attribute,
      value: latestData.value.toString(),
      value_type: "numeric",
      source_url: sourceUrl,
      source_trust: "data.worldbank.org",
      source_trust_score: sourceTrustScore,
      recency_score: recencyScore,
      consensus_score: consensusScore,
      source_trust_weight: settings.source_trust_weight,
      recency_weight: settings.recency_weight,
      consensus_weight: settings.consensus_weight,
      trust_score: trustScore,
      evaluation_notes: `World Bank API, year ${latestData.year}, cross-check`,
      evaluated_at: evaluatedAt,
      status: "evaluating"
    });

    return true;
  } catch (error) {
    throw error;
  }
}

async function fetchFromWikidata(
  entity: string,
  attribute: string,
  settings: any
): Promise<boolean> {
  const qid = COUNTRY_QIDS[entity];
  if (!qid) {
    return false; // Country not in our mapping
  }

  const propertyId = WIKIDATA_PROPERTIES[attribute as keyof typeof WIKIDATA_PROPERTIES];
  if (!propertyId) {
    return false; // Attribute not supported by Wikidata
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
      return false; // No data found
    }

    const result = bindings[0];
    let value = result.value.value;
    let year = '2024';

    // Extract year from value or pointInTime
    if (result.pointInTime) {
      year = result.pointInTime.value.substring(0, 4);
    } else if (attribute === 'founded_year') {
      year = value.substring(0, 4);
      value = year;
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
      return false; // Already exists
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

    // Insert new record
    await db.insert(factsEvaluation).values({
      entity,
      attribute: attributeName,
      value: value.toString(),
      value_type: "numeric",
      source_url: sourceUrl,
      source_trust: "www.wikidata.org",
      source_trust_score: sourceTrustScore,
      recency_score: recencyScore,
      consensus_score: consensusScore,
      source_trust_weight: settings.source_trust_weight,
      recency_weight: settings.recency_weight,
      consensus_weight: settings.consensus_weight,
      trust_score: trustScore,
      evaluation_notes: `Wikidata, ${year}, cross-check`,
      evaluated_at: evaluatedAt,
      status: "evaluating"
    });

    return true;
  } catch (error) {
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  crossCheckAllSources()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
