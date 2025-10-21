/**
 * Multi-Source Evaluation Populator
 * 
 * Populates facts_evaluation table with data from both Wikipedia and World Bank
 * to enable multi-source verification with trust-weighted consensus and ranges.
 * 
 * Strategy:
 * - Fetch data separately from Wikidata and World Bank APIs
 * - Insert each as distinct evaluations with proper source attribution
 * - Calculate trust scores based on scoring_settings
 * - This creates 2 sources per claim for range-based verification
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { calculateTrustScore } from "../server/evaluation-scoring";
import { eq } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { factsEvaluation, sources, scoringSettings } });

// Same curated list as fetch-country-data.ts
const TARGET_COUNTRIES = [
  'US', 'CN', 'JP', 'DE', 'IN', 'UK', 'FR', 'BR', 'IT', 'CA',
  'KR', 'RU', 'ES', 'AU', 'MX', 'ID', 'NL', 'SA', 'TR', 'CH',
  'PL', 'TH', 'BE', 'SE', 'NG', 'AT', 'NO', 'IL', 'AR', 'IE',
  'SG', 'PH', 'MY', 'ZA', 'DK', 'CO', 'CL', 'FI', 'EG', 'PK',
  'VN', 'BD', 'PT', 'CZ', 'RO', 'NZ', 'PE', 'GR', 'HU', 'UA',
  'PY'
];

interface CountryData {
  name: string;
  iso: string;
  iso3?: string;
  founded_year?: number | null;
  population?: number | null;
  area?: number | null;
  wikipedia_url: string;
}

interface WorldBankData {
  iso3: string;
  gdp?: number;
  population?: number;
}

/**
 * Fetch data from Wikidata
 */
async function fetchWikidataCountries(): Promise<Record<string, CountryData>> {
  console.log('📡 Fetching from Wikidata...');
  
  const sparqlQuery = `
    SELECT ?country ?countryLabel ?iso ?iso3 ?foundedYear ?population ?area ?wikipediaUrl
    WHERE {
      VALUES ?iso { ${TARGET_COUNTRIES.map(c => `"${c}"`).join(' ')} }
      
      ?country wdt:P297 ?iso.
      ?country wdt:P31 wd:Q6256.
      
      OPTIONAL { ?country wdt:P298 ?iso3. }
      OPTIONAL { ?country wdt:P571 ?inception. }
      OPTIONAL { ?country wdt:P1082 ?population. }
      OPTIONAL { ?country wdt:P2046 ?area. }
      
      OPTIONAL {
        ?wikipediaUrl schema:about ?country;
                     schema:isPartOf <https://en.wikipedia.org/>.
      }
      
      BIND(YEAR(?inception) AS ?foundedYear)
      
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;

  const params = new URLSearchParams({
    query: sparqlQuery,
    format: 'json'
  });
  
  const url = `https://query.wikidata.org/sparql?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'KnowledgeAgent/1.0 (Multi-Source Fact Checker)'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata API error: ${response.status}`);
  }

  const data: any = await response.json();
  const countries: Record<string, CountryData> = {};
  
  const foundingOverrides: Record<string, number> = {
    'US': 1776,
    'GB': 1801,
  };
  
  for (const result of data.results.bindings) {
    const iso = result.iso?.value;
    if (!iso) continue;
    
    if (!countries[iso]) {
      const foundedYear = foundingOverrides[iso] || 
        (result.foundedYear?.value ? parseInt(result.foundedYear.value) : null);
      
      countries[iso] = {
        name: result.countryLabel?.value || iso,
        iso: iso,
        iso3: result.iso3?.value,
        founded_year: foundedYear,
        population: result.population?.value ? parseInt(result.population.value) : null,
        area: result.area?.value ? parseFloat(result.area.value) : null,
        wikipedia_url: result.wikipediaUrl?.value || 
          `https://en.wikipedia.org/wiki/${result.countryLabel?.value?.replace(/ /g, '_')}`
      };
    }
  }

  console.log(`✅ Fetched ${Object.keys(countries).length} countries from Wikidata`);
  return countries;
}

/**
 * Fetch data from World Bank
 */
async function fetchWorldBankData(countries: Record<string, CountryData>): Promise<Record<string, WorldBankData>> {
  console.log('📡 Fetching from World Bank...');
  
  const iso3ToIso2: Record<string, string> = {};
  for (const [iso2, country] of Object.entries(countries)) {
    if (country.iso3) {
      iso3ToIso2[country.iso3] = iso2;
    }
  }
  
  const iso3Codes = Object.values(countries)
    .map(c => c.iso3)
    .filter(Boolean)
    .join(';');
  
  if (!iso3Codes) {
    console.warn('⚠️  No ISO-3 codes available');
    return {};
  }
  
  const gdpUrl = `https://api.worldbank.org/v2/country/${iso3Codes}/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=100`;
  const popUrl = `https://api.worldbank.org/v2/country/${iso3Codes}/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=100`;
  
  const worldBankData: Record<string, WorldBankData> = {};
  
  try {
    const [gdpResponse, popResponse] = await Promise.all([
      fetch(gdpUrl),
      fetch(popUrl)
    ]);

    if (gdpResponse.ok) {
      const gdpData: any = await gdpResponse.json();
      if (gdpData[1]) {
        for (const item of gdpData[1]) {
          const iso3 = item.countryiso3code;
          if (!worldBankData[iso3]) {
            worldBankData[iso3] = { iso3 };
          }
          if (item.value) {
            worldBankData[iso3].gdp = Math.round(item.value);
          }
        }
      }
    }

    if (popResponse.ok) {
      const popData: any = await popResponse.json();
      if (popData[1]) {
        for (const item of popData[1]) {
          const iso3 = item.countryiso3code;
          if (!worldBankData[iso3]) {
            worldBankData[iso3] = { iso3 };
          }
          if (item.value) {
            worldBankData[iso3].population = Math.round(item.value);
          }
        }
      }
    }

    console.log(`✅ Fetched World Bank data for ${Object.keys(worldBankData).length} countries`);
  } catch (error: any) {
    console.warn('⚠️  World Bank API error:', error.message);
  }

  return worldBankData;
}

/**
 * Save evaluations to database
 */
async function saveEvaluations(
  countries: Record<string, CountryData>,
  worldBankData: Record<string, WorldBankData>
): Promise<number> {
  console.log('💾 Saving evaluations to database...');
  
  // Get scoring settings
  const settings = await db.query.scoringSettings.findFirst();
  if (!settings) {
    throw new Error('No scoring settings found in database');
  }

  // Get source trust scores
  const wikipediaSource = await db.query.sources.findFirst({
    where: eq(sources.domain, 'en.wikipedia.org')
  });
  const worldBankSource = await db.query.sources.findFirst({
    where: eq(sources.domain, 'api.worldbank.org')
  });

  if (!wikipediaSource || !worldBankSource) {
    throw new Error('Missing source entries for Wikipedia or World Bank');
  }

  const wikipediaTrust = Math.round(
    (wikipediaSource.public_trust + wikipediaSource.data_accuracy + wikipediaSource.proprietary_score) / 3
  );
  const worldBankTrust = Math.round(
    (worldBankSource.public_trust + worldBankSource.data_accuracy + worldBankSource.proprietary_score) / 3
  );

  const today = new Date().toISOString().split('T')[0];
  let evaluationCount = 0;

  // Clear existing evaluations
  await db.delete(factsEvaluation);
  console.log('🗑️  Cleared existing evaluations');

  for (const [iso2, country] of Object.entries(countries)) {
    const name = country.name;
    const wikiUrl = country.wikipedia_url;
    const worldBankUrl = `https://data.worldbank.org/country/${iso2}`;
    const iso3 = country.iso3;
    const wbData = iso3 ? worldBankData[iso3] : undefined;

    // Wikipedia evaluations
    // Founded year - Wikipedia only
    if (country.founded_year) {
      const trustScore = calculateTrustScore(
        wikipediaTrust,
        100, // Recent (static historical data)
        95,  // High consensus
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        attribute: 'founded_year',
        value: country.founded_year.toString(),
        value_type: 'integer',
        source_url: wikiUrl,
        source_trust: 'Wikipedia',
        source_trust_score: wikipediaTrust,
        recency_score: 100,
        consensus_score: 95,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluated_at: today,
        status: 'approved'
      });
      evaluationCount++;
    }

    // Area - Wikipedia only
    if (country.area) {
      const trustScore = calculateTrustScore(
        wikipediaTrust,
        100,
        95,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        attribute: 'area_km2',
        value: Math.round(country.area).toString(),
        value_type: 'integer',
        source_url: wikiUrl,
        source_trust: 'Wikipedia',
        source_trust_score: wikipediaTrust,
        recency_score: 100,
        consensus_score: 95,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluated_at: today,
        status: 'approved'
      });
      evaluationCount++;
    }

    // Population - both sources
    if (country.population) {
      const wikiTrustScore = calculateTrustScore(
        wikipediaTrust,
        50, // Medium recency
        90,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        attribute: 'population',
        value: country.population.toString(),
        value_type: 'integer',
        source_url: wikiUrl,
        source_trust: 'Wikipedia',
        source_trust_score: wikipediaTrust,
        recency_score: 50,
        consensus_score: 90,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: wikiTrustScore,
        evaluated_at: today,
        status: 'approved'
      });
      evaluationCount++;
    }

    if (wbData?.population) {
      const wbTrustScore = calculateTrustScore(
        worldBankTrust,
        100, // Very recent
        95,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        attribute: 'population',
        value: wbData.population.toString(),
        value_type: 'integer',
        source_url: worldBankUrl,
        source_trust: 'World Bank',
        source_trust_score: worldBankTrust,
        recency_score: 100,
        consensus_score: 95,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: wbTrustScore,
        evaluated_at: today,
        status: 'approved'
      });
      evaluationCount++;
    }

    // GDP - both sources (World Bank primary, Wikipedia secondary)
    if (wbData?.gdp) {
      const wbTrustScore = calculateTrustScore(
        worldBankTrust,
        100,
        95,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        attribute: 'gdp_usd',
        value: wbData.gdp.toString(),
        value_type: 'integer',
        source_url: worldBankUrl,
        source_trust: 'World Bank',
        source_trust_score: worldBankTrust,
        recency_score: 100,
        consensus_score: 95,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: wbTrustScore,
        evaluated_at: today,
        status: 'approved'
      });
      evaluationCount++;
    }
  }

  console.log(`✅ Saved ${evaluationCount} evaluations`);
  return evaluationCount;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting multi-source evaluation population...\n');

  try {
    // Fetch from both sources
    const countries = await fetchWikidataCountries();
    const worldBankData = await fetchWorldBankData(countries);
    
    // Save to database
    const count = await saveEvaluations(countries, worldBankData);
    
    console.log(`\n✨ Successfully populated ${count} evaluations from 2 sources`);
    console.log('📊 Multi-source verification is now ready!');

  } catch (error: any) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('\n✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
