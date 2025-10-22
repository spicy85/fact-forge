import { db } from "../server/db";
import { requestedFacts, factsEvaluation, scoringSettings } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { fetchAllIndicatorsForCountry } from "../server/integrations/worldbank-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Map our country names to Wikidata Q-IDs
const COUNTRY_QIDS: Record<string, string> = {
  'Afghanistan': 'Q889',
  'Argentina': 'Q414',
  'Australia': 'Q408',
  'Austria': 'Q40',
  'Bangladesh': 'Q902',
  'Belgium': 'Q31',
  'Brazil': 'Q155',
  'Canada': 'Q16',
  'Chile': 'Q298',
  'Colombia': 'Q739',
  'Czech Republic': 'Q213',
  'Denmark': 'Q35',
  'Egypt': 'Q79',
  'Finland': 'Q33',
  'France': 'Q142',
  'Germany': 'Q183',
  'Greece': 'Q41',
  'Hungary': 'Q28',
  'India': 'Q668',
  'Indonesia': 'Q252',
  'Ireland': 'Q27',
  'Israel': 'Q801',
  'Italy': 'Q38',
  'Japan': 'Q17',
  'Kingdom of the Netherlands': 'Q29999',
  'Malaysia': 'Q833',
  'Mexico': 'Q96',
  'New Zealand': 'Q664',
  'Nigeria': 'Q1033',
  'Norway': 'Q20',
  'Pakistan': 'Q843',
  'Paraguay': 'Q733',
  'People\'s Republic of China': 'Q148',
  'Philippines': 'Q928',
  'Poland': 'Q36',
  'Portugal': 'Q45',
  'Romania': 'Q218',
  'Russia': 'Q159',
  'Saudi Arabia': 'Q851',
  'Singapore': 'Q334',
  'South Africa': 'Q258',
  'South Korea': 'Q884',
  'Spain': 'Q29',
  'Sweden': 'Q34',
  'Switzerland': 'Q39',
  'Thailand': 'Q869',
  'Turkey': 'Q43',
  'United States': 'Q30',
  'Vietnam': 'Q881'
};

// Attribute to source mapping - which sources support which attributes
const ATTRIBUTE_SOURCE_MAP: Record<string, string[]> = {
  'population': ['wikidata', 'worldbank'],
  'gdp': ['worldbank'],
  'gdp_usd': ['wikidata'],
  'gdp_per_capita': ['worldbank'],
  'area': ['worldbank'],
  'area_km2': ['wikidata'],
  'inflation': ['worldbank'],
  'founded_year': ['wikidata']
};

interface FetchResult {
  entity: string;
  attribute: string;
  value: string;
  evaluatedAt: string;
  sourceUrl: string;
  sourceTrust: string;
  notes: string;
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

async function fetchFromWikidata(entity: string, attribute: string): Promise<FetchResult | null> {
  const qid = COUNTRY_QIDS[entity];
  if (!qid) {
    console.log(`  ⊘ No Wikidata Q-ID for ${entity}`);
    return null;
  }

  let query = '';
  let propertyId = '';
  let attributeName = attribute;

  if (attribute === 'population') {
    propertyId = 'P1082';
    query = `
      SELECT ?value ?pointInTime WHERE {
        wd:${qid} p:P1082 ?statement.
        ?statement ps:P1082 ?value.
        ?statement pq:P585 ?pointInTime.
      }
      ORDER BY DESC(?pointInTime)
      LIMIT 1
    `;
  } else if (attribute === 'gdp_usd') {
    propertyId = 'P2131';
    query = `
      SELECT ?value ?pointInTime WHERE {
        wd:${qid} p:P2131 ?statement.
        ?statement ps:P2131 ?value.
        OPTIONAL { ?statement pq:P585 ?pointInTime. }
      }
      ORDER BY DESC(?pointInTime)
      LIMIT 1
    `;
  } else if (attribute === 'area_km2') {
    propertyId = 'P2046';
    query = `
      SELECT ?value WHERE {
        wd:${qid} wdt:P2046 ?value.
      }
      LIMIT 1
    `;
  } else if (attribute === 'founded_year') {
    propertyId = 'P571';
    query = `
      SELECT ?value WHERE {
        wd:${qid} wdt:P571 ?value.
      }
      LIMIT 1
    `;
  } else {
    console.log(`  ⊘ Wikidata does not support attribute: ${attribute}`);
    return null;
  }

  try {
    const result = await executeSparqlQuery(query);
    const bindings = result?.results?.bindings;
    
    if (!bindings || bindings.length === 0) {
      console.log(`  ⊘ No Wikidata results for ${entity} - ${attribute}`);
      return null;
    }

    const binding = bindings[0];
    let value = binding.value?.value;
    let year = new Date().getFullYear();

    if (binding.pointInTime?.value) {
      const date = new Date(binding.pointInTime.value);
      year = date.getFullYear();
    }

    if (!value) {
      console.log(`  ⊘ No value in Wikidata result for ${entity} - ${attribute}`);
      return null;
    }

    // Extract year from founded_year
    if (attribute === 'founded_year' && value.includes('-')) {
      value = value.split('-')[0];
    }

    const evaluatedAt = `${year}-12-31`;
    
    return {
      entity,
      attribute: attributeName,
      value: value.toString(),
      evaluatedAt,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      sourceTrust: 'www.wikidata.org',
      notes: `Wikidata property ${propertyId}, year ${year}`
    };
  } catch (error: any) {
    console.log(`  ✗ Wikidata error for ${entity} - ${attribute}: ${error.message}`);
    return null;
  }
}

async function fetchFromWorldBank(entity: string, attribute: string): Promise<FetchResult | null> {
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
      console.log(`  ⊘ World Bank does not support attribute: ${attribute}`);
      return null;
    }

    const dataPoints = indicatorMap.get(indicatorName);
    if (!dataPoints || dataPoints.length === 0) {
      console.log(`  ⊘ No World Bank data for ${entity} - ${attribute}`);
      return null;
    }

    const latestData = dataPoints.sort((a, b) => b.year - a.year)[0];
    const evaluatedAt = `${latestData.year}-12-31`;

    return {
      entity,
      attribute,
      value: latestData.value.toString(),
      evaluatedAt,
      sourceUrl: 'https://data.worldbank.org/',
      sourceTrust: 'data.worldbank.org',
      notes: `World Bank API, year ${latestData.year}`
    };
  } catch (error: any) {
    console.log(`  ✗ World Bank error for ${entity} - ${attribute}: ${error.message}`);
    return null;
  }
}

export async function fulfillRequestedFacts() {
  console.log("=== Fulfill Requested Facts ===\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    throw new Error("No scoring settings found.");
  }

  // Fetch all requested facts
  const requests = await db.select().from(requestedFacts);
  
  console.log(`Found ${requests.length} requested facts\n`);

  if (requests.length === 0) {
    console.log("✓ No requests to process\n");
    return {
      fulfilledCount: 0,
      notFoundCount: 0,
      alreadyExistsCount: 0,
      totalRequests: 0
    };
  }

  let fulfilledCount = 0;
  let notFoundCount = 0;
  let alreadyExistsCount = 0;

  for (const request of requests) {
    console.log(`\nProcessing: ${request.entity} - ${request.attribute} (${request.request_count} requests)`);
    
    // Determine which sources support this attribute
    const supportedSources = ATTRIBUTE_SOURCE_MAP[request.attribute] || [];
    
    if (supportedSources.length === 0) {
      console.log(`  ⊘ No sources support attribute: ${request.attribute}`);
      notFoundCount++;
      continue;
    }

    console.log(`  Sources to try: ${supportedSources.join(', ')}`);

    let fetchResult: FetchResult | null = null;

    // Try each source in order
    for (const source of supportedSources) {
      if (source === 'wikidata') {
        fetchResult = await fetchFromWikidata(request.entity, request.attribute);
      } else if (source === 'worldbank') {
        fetchResult = await fetchFromWorldBank(request.entity, request.attribute);
      }

      if (fetchResult) {
        break; // Found data, stop trying other sources
      }
    }

    if (!fetchResult) {
      console.log(`  ⊘ Could not find data from any source`);
      notFoundCount++;
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
    const consensusScore = fetchResult.sourceTrust.includes('wikidata') ? 88 : 95;
    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      settings.source_trust_weight,
      settings.recency_weight,
      settings.consensus_weight
    );

    try {
      // Check if this exact evaluation already exists (deduplication)
      const existing = await db
        .select()
        .from(factsEvaluation)
        .where(
          and(
            eq(factsEvaluation.entity, fetchResult.entity),
            eq(factsEvaluation.attribute, fetchResult.attribute),
            eq(factsEvaluation.source_url, fetchResult.sourceUrl),
            eq(factsEvaluation.evaluated_at, fetchResult.evaluatedAt)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ⊘ Already exists in facts_evaluation`);
        alreadyExistsCount++;
        
        // Remove from requested_facts since it already exists
        await db.delete(requestedFacts).where(eq(requestedFacts.id, request.id));
        console.log(`  ✓ Removed from requested_facts`);
        fulfilledCount++;
        continue;
      }

      // Insert into facts_evaluation
      await db.insert(factsEvaluation).values({
        entity: fetchResult.entity,
        attribute: fetchResult.attribute,
        value: fetchResult.value,
        value_type: "numeric",
        source_url: fetchResult.sourceUrl,
        source_trust: fetchResult.sourceTrust,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluation_notes: fetchResult.notes,
        evaluated_at: fetchResult.evaluatedAt,
        status: "evaluating"
      });

      console.log(`  ✓ Inserted into facts_evaluation: ${fetchResult.value}`);

      // Remove from requested_facts
      await db.delete(requestedFacts).where(eq(requestedFacts.id, request.id));
      console.log(`  ✓ Removed from requested_facts`);
      
      fulfilledCount++;
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`  ⊘ Already exists (unique constraint)`);
        alreadyExistsCount++;
        
        // Still remove from requested_facts
        await db.delete(requestedFacts).where(eq(requestedFacts.id, request.id));
        console.log(`  ✓ Removed from requested_facts`);
        fulfilledCount++;
      } else {
        console.error(`  ✗ Error:`, error.message);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`✓ Fulfilled: ${fulfilledCount} (including ${alreadyExistsCount} already existing)`);
  console.log(`⊘ Not found: ${notFoundCount}`);
  console.log(`📊 Remaining in requested_facts: ${notFoundCount}`);
  console.log("\n✓ Process complete!\n");

  return {
    fulfilledCount,
    notFoundCount,
    alreadyExistsCount,
    totalRequests: requests.length
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  fulfillRequestedFacts()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
