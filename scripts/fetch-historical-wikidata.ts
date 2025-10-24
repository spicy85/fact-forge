import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";
import { readFileSync } from "fs";
import { join } from "path";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

const COUNTRY_QIDS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "public/country-qids.json"), "utf-8")
);

interface HistoricalDataPoint {
  entity: string;
  attribute: string;
  value: string;
  year: string;
  as_of_date: string;
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

async function fetchHistoricalData(countryName: string, qid: string, startYear: number, endYear: number): Promise<HistoricalDataPoint[]> {
  const results: HistoricalDataPoint[] = [];

  // Query for historical population data (P1082) with point-in-time qualifiers (P585)
  const populationQuery = `
    SELECT ?value ?pointInTime WHERE {
      wd:${qid} p:P1082 ?statement.
      ?statement ps:P1082 ?value.
      ?statement pq:P585 ?pointInTime.
      FILTER(YEAR(?pointInTime) >= ${startYear} && YEAR(?pointInTime) <= ${endYear})
    }
    ORDER BY ?pointInTime
  `;

  // Query for historical GDP data (P2131) with point-in-time qualifiers (P585)
  const gdpQuery = `
    SELECT ?value ?pointInTime WHERE {
      wd:${qid} p:P2131 ?statement.
      ?statement ps:P2131 ?value.
      ?statement pq:P585 ?pointInTime.
      FILTER(YEAR(?pointInTime) >= ${startYear} && YEAR(?pointInTime) <= ${endYear})
    }
    ORDER BY ?pointInTime
  `;

  try {
    console.log(`  Fetching population data...`);
    const popData = await executeSparqlQuery(populationQuery);
    if (popData.results?.bindings?.length > 0) {
      for (const binding of popData.results.bindings) {
        const pointInTimeValue = binding.pointInTime?.value;
        if (pointInTimeValue) {
          const date = new Date(pointInTimeValue);
          const year = date.getFullYear().toString();
          const as_of_date = pointInTimeValue.split('T')[0];
          
          results.push({
            entity: countryName,
            attribute: 'population',
            value: binding.value.value,
            year,
            as_of_date,
            referenceUrl: `https://www.wikidata.org/wiki/${qid}#P1082`
          });
        }
      }
      console.log(`    ✓ Found ${popData.results.bindings.length} population data points`);
    } else {
      console.log(`    ⊘ No population data found`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`  Fetching GDP data...`);
    const gdpData = await executeSparqlQuery(gdpQuery);
    if (gdpData.results?.bindings?.length > 0) {
      for (const binding of gdpData.results.bindings) {
        const pointInTimeValue = binding.pointInTime?.value;
        if (pointInTimeValue) {
          const date = new Date(pointInTimeValue);
          const year = date.getFullYear().toString();
          const as_of_date = pointInTimeValue.split('T')[0];
          
          results.push({
            entity: countryName,
            attribute: 'gdp',
            value: binding.value.value,
            year,
            as_of_date,
            referenceUrl: `https://www.wikidata.org/wiki/${qid}#P2131`
          });
        }
      }
      console.log(`    ✓ Found ${gdpData.results.bindings.length} GDP data points`);
    } else {
      console.log(`    ⊘ No GDP data found`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error: any) {
    console.error(`  ✗ Error fetching historical data for ${countryName}:`, error.message);
  }

  return results;
}

async function main() {
  const targetCountry = "United States";
  const startYear = 1975;
  const currentYear = new Date().getFullYear();

  console.log("=== Fetching Historical Wikidata Data ===");
  console.log(`Country: ${targetCountry}`);
  console.log(`Time range: ${startYear}-${currentYear}`);
  console.log(`Attributes: population, GDP\n`);

  const qid = COUNTRY_QIDS[targetCountry];
  if (!qid) {
    console.error(`Error: No Wikidata QID found for "${targetCountry}"`);
    process.exit(1);
  }

  const [settings] = await db.select().from(scoringSettings).limit(1);
  if (!settings) {
    console.error("No scoring settings found.");
    process.exit(1);
  }

  await ensureSourceExists();

  console.log(`Fetching ${targetCountry} (${qid})...\n`);
  const historicalData = await fetchHistoricalData(targetCountry, qid, startYear, currentYear);

  if (historicalData.length === 0) {
    console.log("\nNo historical data found.");
    process.exit(0);
  }

  console.log(`\n=== Inserting ${historicalData.length} data points into facts_evaluation ===\n`);

  const sourceUrl = "https://www.wikidata.org/";
  let insertedCount = 0;
  let skippedCount = 0;

  for (const dataPoint of historicalData) {
    const evaluatedAt = new Date().toISOString().split('T')[0];
    
    const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
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

    try {
      const existing = await db
        .select()
        .from(factsEvaluation)
        .where(
          and(
            eq(factsEvaluation.entity, dataPoint.entity),
            eq(factsEvaluation.attribute, dataPoint.attribute),
            eq(factsEvaluation.as_of_date, dataPoint.as_of_date),
            eq(factsEvaluation.source_url, dataPoint.referenceUrl)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skippedCount++;
        continue;
      }

      // Determine attribute class
      const getAttributeClass = (attr: string): string => {
        if (attr === 'founded_year' || attr === 'independence_date') return 'historical_constant';
        if (attr === 'area' || attr === 'capital_city' || attr === 'official_language' || attr === 'life_expectancy') return 'static';
        return 'time_series'; // population, gdp, gdp_per_capita, inflation
      };
      const attributeClass = getAttributeClass(dataPoint.attribute);

      await db.insert(factsEvaluation).values({
        entity: dataPoint.entity,
        attribute: dataPoint.attribute,
        attribute_class: attributeClass,
        value: dataPoint.value,
        value_type: "numeric",
        source_url: dataPoint.referenceUrl,
        source_name: "www.wikidata.org",
        as_of_date: dataPoint.as_of_date,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluation_notes: `Wikidata historical, ${dataPoint.year}`,
        evaluated_at: evaluatedAt,
        status: "evaluating"
      });

      insertedCount++;
      const formattedValue = parseFloat(dataPoint.value).toLocaleString();
      console.log(`✓ ${dataPoint.year}: ${dataPoint.attribute} = ${formattedValue}`);

    } catch (error: any) {
      if (error.code === '23505') {
        skippedCount++;
      } else {
        console.error(`✗ Error inserting ${dataPoint.year} ${dataPoint.attribute}:`, error.message);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`✓ Inserted: ${insertedCount} historical data points`);
  console.log(`⊘ Skipped: ${skippedCount} (already exist)`);
  console.log(`📊 Time span: ${startYear}-${currentYear} (${currentYear - startYear + 1} years)`);
  console.log(`🌎 Country: ${targetCountry}`);
  console.log(`\nNext step: Run promotion to move high-trust facts to verified_facts`);
  
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
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
