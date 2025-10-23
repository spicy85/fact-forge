import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";
import { readFileSync } from "fs";
import { join } from "path";

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Load country Q-IDs from centralized mapping file
const COUNTRY_QIDS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "public/country-qids.json"), "utf-8")
);

// Wikidata property IDs for attributes we want
const PROPERTIES = {
  population: 'P1082',
  gdp: 'P2131',          // nominal GDP
  area: 'P2046',         // area in km²
  founded: 'P571'        // inception date
};

interface WikidataResult {
  entity: string;
  attribute: string;
  value: string;
  year: string;
  as_of_date: string; // ISO date string YYYY-MM-DD
  referenceUrl: string;
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

async function fetchCountryData(countryName: string, qid: string): Promise<WikidataResult[]> {
  const results: WikidataResult[] = [];

  // Query for population (P1082)
  const populationQuery = `
    SELECT ?value ?pointInTime WHERE {
      wd:${qid} p:P1082 ?statement.
      ?statement ps:P1082 ?value.
      ?statement pq:P585 ?pointInTime.
    }
    ORDER BY DESC(?pointInTime)
    LIMIT 1
  `;

  // Query for GDP (P2131)
  const gdpQuery = `
    SELECT ?value ?pointInTime WHERE {
      wd:${qid} p:P2131 ?statement.
      ?statement ps:P2131 ?value.
      OPTIONAL { ?statement pq:P585 ?pointInTime. }
    }
    ORDER BY DESC(?pointInTime)
    LIMIT 1
  `;

  // Query for area (P2046)
  const areaQuery = `
    SELECT ?value WHERE {
      wd:${qid} wdt:P2046 ?value.
    }
    LIMIT 1
  `;

  // Query for founding date (P571)
  const foundedQuery = `
    SELECT ?value WHERE {
      wd:${qid} wdt:P571 ?value.
    }
    LIMIT 1
  `;

  try {
    // Fetch population
    const popData = await executeSparqlQuery(populationQuery);
    if (popData.results?.bindings?.length > 0) {
      const binding = popData.results.bindings[0];
      const pointInTimeValue = binding.pointInTime?.value;
      let year: string;
      let as_of_date: string;
      
      if (pointInTimeValue) {
        const date = new Date(pointInTimeValue);
        year = date.getFullYear().toString();
        // Use the actual date from Wikidata
        as_of_date = pointInTimeValue.split('T')[0]; // Extract YYYY-MM-DD
      } else {
        year = '2023';
        as_of_date = '2023-01-01';
      }
      
      results.push({
        entity: countryName,
        attribute: 'population',
        value: binding.value.value,
        year,
        as_of_date,
        referenceUrl: `https://www.wikidata.org/wiki/${qid}#P1082`
      });
    }

    // Fetch GDP
    const gdpData = await executeSparqlQuery(gdpQuery);
    if (gdpData.results?.bindings?.length > 0) {
      const binding = gdpData.results.bindings[0];
      const pointInTimeValue = binding.pointInTime?.value;
      let year: string;
      let as_of_date: string;
      
      if (pointInTimeValue) {
        const date = new Date(pointInTimeValue);
        year = date.getFullYear().toString();
        // Use the actual date from Wikidata
        as_of_date = pointInTimeValue.split('T')[0]; // Extract YYYY-MM-DD
      } else {
        year = '2023';
        as_of_date = '2023-01-01';
      }
      
      results.push({
        entity: countryName,
        attribute: 'gdp_usd',
        value: binding.value.value,
        year,
        as_of_date,
        referenceUrl: `https://www.wikidata.org/wiki/${qid}#P2131`
      });
    }

    // Fetch area
    const areaData = await executeSparqlQuery(areaQuery);
    if (areaData.results?.bindings?.length > 0) {
      const binding = areaData.results.bindings[0];
      results.push({
        entity: countryName,
        attribute: 'area_km2',
        value: binding.value.value,
        year: '2024',  // Area is generally static
        as_of_date: '2024-01-01',
        referenceUrl: `https://www.wikidata.org/wiki/${qid}#P2046`
      });
    }

    // Fetch founded year
    const foundedData = await executeSparqlQuery(foundedQuery);
    if (foundedData.results?.bindings?.length > 0) {
      const binding = foundedData.results.bindings[0];
      const foundedDate = new Date(binding.value.value);
      const foundedYear = foundedDate.getFullYear().toString();
      const as_of_date = binding.value.value.split('T')[0]; // Extract YYYY-MM-DD
      results.push({
        entity: countryName,
        attribute: 'founded_year',
        value: foundedYear,
        year: foundedYear,
        as_of_date,
        referenceUrl: `https://www.wikidata.org/wiki/${qid}#P571`
      });
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error: any) {
    console.error(`Error fetching ${countryName} data:`, error.message);
  }

  return results;
}

async function main() {
  console.log("Starting Wikidata integration...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found.");
    process.exit(1);
  }

  // Ensure Wikidata source exists
  await ensureSourceExists();

  const sourceUrl = "https://www.wikidata.org/";
  let totalCount = 0;

  console.log("=== Fetching Wikidata Facts ===");
  console.log(`Processing ${Object.keys(COUNTRY_QIDS).length} countries...\n`);

  for (const [countryName, qid] of Object.entries(COUNTRY_QIDS)) {
    console.log(`Fetching ${countryName} (${qid})...`);
    
    const countryResults = await fetchCountryData(countryName, qid);
    
    for (const result of countryResults) {
      const evaluatedAt = `${result.year}-12-31`;
      
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        evaluatedAt,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const consensusScore = 90;  // Wikidata has good consensus from community edits
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        consensusScore,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      try {
        // Check if this exact evaluation already exists
        const existing = await db
          .select()
          .from(factsEvaluation)
          .where(
            and(
              eq(factsEvaluation.entity, result.entity),
              eq(factsEvaluation.attribute, result.attribute),
              eq(factsEvaluation.source_url, result.referenceUrl)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          console.log(`  ⊘ ${result.attribute} already exists`);
          continue;
        }

        await db.insert(factsEvaluation).values({
          entity: result.entity,
          attribute: result.attribute,
          value: result.value,
          value_type: "numeric",
          source_url: result.referenceUrl,
          source_trust: "www.wikidata.org",
          as_of_date: result.as_of_date,
          source_trust_score: sourceTrustScore,
          recency_score: recencyScore,
          consensus_score: consensusScore,
          source_trust_weight: settings.source_trust_weight,
          recency_weight: settings.recency_weight,
          consensus_weight: settings.consensus_weight,
          trust_score: trustScore,
          evaluation_notes: `Wikidata, ${result.year}`,
          evaluated_at: evaluatedAt,
          status: "evaluating"
        });

        totalCount++;
        console.log(`  ✓ ${result.attribute} = ${parseFloat(result.value).toLocaleString()} (${result.year})`);
      } catch (error: any) {
        if (error.code === '23505') {
          console.log(`  ⊘ ${result.attribute} already exists (unique constraint)`);
        } else {
          console.error(`  ✗ Error:`, error.message);
        }
      }
    }
    
    console.log();
  }

  console.log(`\n=== Summary ===`);
  console.log(`✓ Inserted ${totalCount} Wikidata evaluations`);
  console.log(`  Countries: ${Object.keys(COUNTRY_QIDS).length}`);
  console.log(`  Attributes: population, gdp_usd, area_km2, founded_year`);
  console.log("\n✓ Wikidata integration complete! You now have multi-source consensus with Wikipedia + World Bank + Wikidata.\n");
  
  process.exit(0);
}

async function ensureSourceExists() {
  const [wikidata] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "www.wikidata.org"))
    .limit(1);

  if (!wikidata) {
    await db.insert(sources).values({
      domain: "www.wikidata.org",
      public_trust: 80,
      data_accuracy: 85,
      proprietary_score: 85,
      status: "trusted",
      promoted_at: new Date().toISOString(),
      notes: "Wikidata - structured knowledge base from Wikimedia"
    });
    console.log("✓ Created source: www.wikidata.org\n");
  } else {
    console.log("✓ Source exists: www.wikidata.org\n");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
