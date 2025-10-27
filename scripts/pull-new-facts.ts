import { db } from "../server/db";
import { factsEvaluation, scoringSettings, factsActivityLog, type InsertFactsActivityLog } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { fetchAllIndicatorsForCountry } from "../server/integrations/worldbank-api";
import { fetchIMFIndicator, INDICATORS as IMF_INDICATORS } from "../server/integrations/imf-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";
import { readFileSync } from "fs";
import { join } from "path";

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Load country Q-IDs from centralized mapping file
const COUNTRY_QIDS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "public/country-qids.json"), "utf-8")
);

// Attribute to source mapping - which sources support which attributes
const ATTRIBUTE_SOURCE_MAP: Record<string, string[]> = {
  'population': ['wikidata', 'worldbank'],
  'gdp': ['worldbank', 'imf'],
  'gdp_usd': ['wikidata'],
  'gdp_per_capita': ['worldbank'],
  'area': ['worldbank'],
  'area_km2': ['wikidata'],
  'inflation': ['worldbank'],
  'inflation_rate': ['imf'],
  'unemployment_rate': ['imf'],
  'founded_year': ['wikidata']
};

interface FetchResult {
  entity: string;
  attribute: string;
  value: string;
  evaluatedAt: string;
  as_of_date: string | null; // ISO date string YYYY-MM-DD or null
  sourceUrl: string;
  sourceName: string;
  notes: string;
}

interface PullStats {
  requested: number;
  found: number;
  duplicates: number;
  inserted: number;
  errors: string[];
}

async function executeSparqlQuery(sparql: string): Promise<any> {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Replit-FactChecker/1.0',
      'Accept': 'application/sparql-results+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata SPARQL query failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchFromWikidataForYear(
  entity: string, 
  attribute: string, 
  targetYear: number
): Promise<FetchResult | null> {
  const qid = COUNTRY_QIDS[entity];
  if (!qid) {
    return null;
  }

  let query = '';
  let propertyId = '';

  // Only support attributes that have temporal data in Wikidata
  if (attribute === 'population') {
    propertyId = 'P1082';
    query = `
      SELECT ?value ?pointInTime WHERE {
        wd:${qid} p:P1082 ?statement.
        ?statement ps:P1082 ?value.
        ?statement pq:P585 ?pointInTime.
        FILTER(YEAR(?pointInTime) = ${targetYear})
      }
      LIMIT 1
    `;
  } else if (attribute === 'gdp_usd') {
    propertyId = 'P2131';
    query = `
      SELECT ?value ?pointInTime WHERE {
        wd:${qid} p:P2131 ?statement.
        ?statement ps:P2131 ?value.
        ?statement pq:P585 ?pointInTime.
        FILTER(YEAR(?pointInTime) = ${targetYear})
      }
      LIMIT 1
    `;
  } else {
    // Attributes like area_km2 and founded_year don't have year-specific data
    return null;
  }

  try {
    const result = await executeSparqlQuery(query);
    const bindings = result?.results?.bindings;
    
    if (!bindings || bindings.length === 0) {
      return null;
    }

    const binding = bindings[0];
    const value = binding.value?.value;
    
    if (!value) {
      return null;
    }

    let as_of_date: string | null = null;
    if (binding.pointInTime?.value) {
      const pointInTimeValue = binding.pointInTime.value;
      as_of_date = pointInTimeValue.split('T')[0]; // Extract YYYY-MM-DD
    }

    const now = new Date();
    const evaluatedAt = now.toISOString().split('T')[0]; // YYYY-MM-DD format for today
    
    return {
      entity,
      attribute,
      value: value.toString(),
      evaluatedAt,
      as_of_date,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      sourceName: 'www.wikidata.org',
      notes: `Wikidata property ${propertyId}, year ${targetYear}`
    };
  } catch (error: any) {
    return null;
  }
}

async function fetchFromWorldBankForYear(
  entity: string, 
  attribute: string,
  targetYear: number
): Promise<FetchResult | null> {
  try {
    const indicatorMap = await fetchAllIndicatorsForCountry(entity);
    
    const attributeMap: Record<string, string> = {
      'population': 'population',
      'gdp': 'gdp',
      'gdp_per_capita': 'gdp_per_capita',
      'area': 'area',
      'inflation': 'inflation'
    };

    const indicatorName = Object.entries(attributeMap).find(([k, v]) => v === attribute)?.[0];
    if (!indicatorName) {
      return null;
    }

    const dataPoints = indicatorMap.get(indicatorName);
    if (!dataPoints || dataPoints.length === 0) {
      return null;
    }

    // Find data for the specific year
    const yearData = dataPoints.find(d => d.year === targetYear);
    if (!yearData) {
      return null;
    }

    const now = new Date();
    const evaluatedAt = now.toISOString().split('T')[0]; // YYYY-MM-DD format for today
    const as_of_date = yearData.as_of_date; // Use actual date from World Bank API

    return {
      entity,
      attribute,
      value: yearData.value.toString(),
      evaluatedAt,
      as_of_date,
      sourceUrl: 'https://data.worldbank.org/',
      sourceName: 'data.worldbank.org',
      notes: `World Bank API, year ${yearData.year}`
    };
  } catch (error: any) {
    return null;
  }
}

async function fetchFromIMFForYear(
  entity: string, 
  attribute: string,
  targetYear: number
): Promise<FetchResult | null> {
  try {
    // Map our attribute names to IMF indicator codes
    const attributeToIMFIndicator: Record<string, { code: string, name: string }> = {
      'gdp': { code: IMF_INDICATORS.GDP_CURRENT, name: 'gdp' },
      'inflation_rate': { code: IMF_INDICATORS.INFLATION, name: 'inflation_rate' },
      'unemployment_rate': { code: IMF_INDICATORS.UNEMPLOYMENT, name: 'unemployment_rate' }
    };

    const indicatorInfo = attributeToIMFIndicator[attribute];
    if (!indicatorInfo) {
      return null;
    }

    // Fetch data for the specific year range (just that year)
    const response = await fetchIMFIndicator(
      entity, 
      indicatorInfo.code, 
      indicatorInfo.name,
      targetYear,
      targetYear
    );

    if (!response.success || !response.data || response.data.length === 0) {
      return null;
    }

    // Find data for the specific year
    const yearData = response.data.find(d => d.year === targetYear);
    if (!yearData) {
      return null;
    }

    const now = new Date();
    const evaluatedAt = now.toISOString().split('T')[0]; // YYYY-MM-DD format for today
    const as_of_date = yearData.as_of_date; // Use actual date from IMF API

    return {
      entity,
      attribute,
      value: yearData.value.toString(),
      evaluatedAt,
      as_of_date,
      sourceUrl: 'https://www.imf.org/',
      sourceName: 'www.imf.org',
      notes: `IMF IFS API, indicator ${indicatorInfo.code}, year ${yearData.year}`
    };
  } catch (error: any) {
    return null;
  }
}

async function checkDuplicate(
  entity: string,
  attribute: string,
  sourceName: string,
  as_of_date: string | null
): Promise<boolean> {
  const conditions = [
    eq(factsEvaluation.entity, entity),
    eq(factsEvaluation.attribute, attribute),
    eq(factsEvaluation.source_name, sourceName)
  ];

  if (as_of_date) {
    conditions.push(eq(factsEvaluation.as_of_date, as_of_date));
  }

  const existing = await db
    .select()
    .from(factsEvaluation)
    .where(and(...conditions))
    .limit(1);

  return existing.length > 0;
}

export async function pullNewFacts(
  entities: string[],
  attributes: string[],
  years: number[]
): Promise<PullStats> {
  console.log("=== Pull New Facts ===\n");
  console.log(`Entities: ${entities.join(', ')}`);
  console.log(`Attributes: ${attributes.join(', ')}`);
  console.log(`Years: ${years.join(', ')}\n`);

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    throw new Error("No scoring settings found.");
  }

  const stats: PullStats = {
    requested: entities.length * attributes.length * years.length,
    found: 0,
    duplicates: 0,
    inserted: 0,
    errors: []
  };

  const activityLogs: InsertFactsActivityLog[] = [];

  for (const entity of entities) {
    for (const attribute of attributes) {
      // Determine which sources support this attribute
      const supportedSources = ATTRIBUTE_SOURCE_MAP[attribute] || [];
      
      if (supportedSources.length === 0) {
        stats.errors.push(`No sources support attribute: ${attribute}`);
        continue;
      }

      for (const year of years) {
        console.log(`\nQuerying: ${entity} - ${attribute} - ${year}`);
        
        let fetchResult: FetchResult | null = null;

        // Try each source in order
        for (const source of supportedSources) {
          if (source === 'wikidata') {
            fetchResult = await fetchFromWikidataForYear(entity, attribute, year);
          } else if (source === 'worldbank') {
            fetchResult = await fetchFromWorldBankForYear(entity, attribute, year);
          } else if (source === 'imf') {
            fetchResult = await fetchFromIMFForYear(entity, attribute, year);
          }

          if (fetchResult) {
            console.log(`  ✓ Found in ${source}: ${fetchResult.value}`);
            break; // Found data, stop trying other sources
          }
        }

        if (!fetchResult) {
          console.log(`  ⊘ No data available`);
          continue;
        }

        stats.found++;

        // Check for duplicates
        const isDuplicate = await checkDuplicate(
          fetchResult.entity,
          fetchResult.attribute,
          fetchResult.sourceName,
          fetchResult.as_of_date
        );

        if (isDuplicate) {
          console.log(`  ⊘ Already exists, skipping`);
          stats.duplicates++;
          continue;
        }

        // Calculate scores
        const sourceTrustScore = await calculateSourceTrustScore(fetchResult.sourceUrl);
        const recencyScore = calculateRecencyScore(
          fetchResult.evaluatedAt,
          settings.recency_tier1_days,
          settings.recency_tier1_score,
          settings.recency_tier2_days,
          settings.recency_tier2_score,
          settings.recency_tier3_score
        );

        // Consensus score will be calculated later when we have multiple sources
        const consensusScore = 0;

        const trustScore = calculateTrustScore(
          sourceTrustScore,
          recencyScore,
          consensusScore,
          settings.source_trust_weight,
          settings.recency_weight,
          settings.consensus_weight
        );

        // Insert into facts_evaluation
        await db.insert(factsEvaluation).values({
          entity: fetchResult.entity,
          entity_type: 'country',
          attribute: fetchResult.attribute,
          attribute_class: 'time_series', // Will be set properly later
          value: fetchResult.value,
          value_type: 'number',
          source_url: fetchResult.sourceUrl,
          source_name: fetchResult.sourceName,
          as_of_date: fetchResult.as_of_date,
          source_trust_score: sourceTrustScore,
          recency_score: recencyScore,
          consensus_score: consensusScore,
          source_trust_weight: settings.source_trust_weight,
          recency_weight: settings.recency_weight,
          consensus_weight: settings.consensus_weight,
          trust_score: trustScore,
          evaluation_notes: fetchResult.notes,
          evaluated_at: fetchResult.evaluatedAt,
          status: 'evaluating'
        });

        console.log(`  ✓ Inserted into facts_evaluation`);
        stats.inserted++;

        // Log activity
        activityLogs.push({
          entity: fetchResult.entity,
          attribute: fetchResult.attribute,
          source: fetchResult.sourceName,
          action: 'added',
          process: 'pull-new-facts',
          value: fetchResult.value,
          notes: `Pulled from ${fetchResult.sourceName} for year ${year}`
        });
      }
    }
  }

  // Bulk insert activity logs
  if (activityLogs.length > 0) {
    await db.insert(factsActivityLog).values(activityLogs);
  }

  console.log("\n=== Summary ===");
  console.log(`Requested combinations: ${stats.requested}`);
  console.log(`Found: ${stats.found}`);
  console.log(`Duplicates skipped: ${stats.duplicates}`);
  console.log(`Inserted: ${stats.inserted}`);
  if (stats.errors.length > 0) {
    console.log(`Errors: ${stats.errors.length}`);
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  return stats;
}

// CLI execution
// Note: This script is primarily designed to be called from the API endpoint
// For CLI usage, create a separate wrapper script or use tsx directly
