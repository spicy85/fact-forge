/**
 * Country Data Fetcher
 * 
 * Fetches country data from Wikidata and World Bank APIs with minimal requests.
 * Strategy:
 * - Single SPARQL query to Wikidata for ~50 major countries
 * - Batch World Bank API calls for economic data
 * - Inserts into facts_evaluation table with trust scores
 * - Data then promoted to verified_facts via admin promotion system
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { factsEvaluation, scoringSettings } from "../shared/schema";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { factsEvaluation, scoringSettings } });

// Curated list of ~50 major countries by ISO code
const TARGET_COUNTRIES = [
  'US', 'CN', 'JP', 'DE', 'IN', 'UK', 'FR', 'BR', 'IT', 'CA',
  'KR', 'RU', 'ES', 'AU', 'MX', 'ID', 'NL', 'SA', 'TR', 'CH',
  'PL', 'TH', 'BE', 'SE', 'NG', 'AT', 'NO', 'IL', 'AR', 'IE',
  'SG', 'PH', 'MY', 'ZA', 'DK', 'CO', 'CL', 'FI', 'EG', 'PK',
  'VN', 'BD', 'PT', 'CZ', 'RO', 'NZ', 'PE', 'GR', 'HU', 'UA',
  'PY'  // Paraguay
];

interface Country {
  name: string;
  iso: string;
  iso3?: string;
  founded_year?: number | null;
  population?: number | null;
  area?: number | null;
  wikipedia_url: string;
  gdp?: number;
  gdp_year?: string;
  population_year?: string;
}

/**
 * Fetch country data from Wikidata using SPARQL
 * Single query for all target countries with founding year, population, area
 */
async function fetchWikidataCountries(): Promise<Record<string, Country>> {
  console.log('📡 Fetching data from Wikidata (1 request for all countries)...');
  
  const sparqlQuery = `
    SELECT ?country ?countryLabel ?iso ?iso3 ?foundedYear ?population ?area ?wikipediaUrl
    WHERE {
      VALUES ?iso { ${TARGET_COUNTRIES.map(c => `"${c}"`).join(' ')} }
      
      ?country wdt:P297 ?iso.           # ISO 3166-1 alpha-2 code
      ?country wdt:P31 wd:Q6256.        # instance of country
      
      OPTIONAL { ?country wdt:P298 ?iso3. }          # ISO 3166-1 alpha-3 code
      OPTIONAL { ?country wdt:P571 ?inception. }     # inception date
      OPTIONAL { ?country wdt:P1082 ?population. }   # population
      OPTIONAL { ?country wdt:P2046 ?area. }         # area in km²
      
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
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'KnowledgeAgent/1.0 (Country Fact Checker)'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  
  const countries: Record<string, Country> = {};
  
  // Manual overrides for known incorrect dates from Wikidata
  const foundingOverrides: Record<string, number> = {
    'US': 1776,  // Declaration of Independence, not 1784
    'GB': 1801,  // Act of Union (modern UK)
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
        wikipedia_url: result.wikipediaUrl?.value || `https://en.wikipedia.org/wiki/${result.countryLabel?.value?.replace(/ /g, '_')}`
      };
    }
  }

  console.log(`✅ Fetched ${Object.keys(countries).length} countries from Wikidata`);
  return countries;
}

/**
 * Fetch GDP and population data from World Bank API
 * Uses batch requests for efficiency
 */
async function fetchWorldBankData(countries: Record<string, Country>): Promise<Record<string, Country>> {
  console.log('📡 Fetching GDP/population from World Bank...');
  
  // Build ISO-3 to ISO-2 mapping from Wikidata results
  const iso3ToIso2: Record<string, string> = {};
  for (const [iso2, country] of Object.entries(countries)) {
    if (country.iso3) {
      iso3ToIso2[country.iso3] = iso2;
    }
  }
  
  // Use ISO-3 codes for World Bank API (they require ISO-3)
  const iso3Codes = Object.values(countries)
    .map(c => c.iso3)
    .filter(Boolean)
    .join(';');
  
  if (!iso3Codes) {
    console.warn('⚠️  No ISO-3 codes available for World Bank queries');
    return countries;
  }
  
  // Batch request for GDP (most recent value)
  const gdpUrl = `https://api.worldbank.org/v2/country/${iso3Codes}/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=100`;
  const popUrl = `https://api.worldbank.org/v2/country/${iso3Codes}/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=100`;
  
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
          const iso2 = iso3ToIso2[iso3];
          if (iso2 && countries[iso2] && item.value) {
            countries[iso2].gdp = Math.round(item.value);
            countries[iso2].gdp_year = item.date;
          }
        }
      }
    }

    if (popResponse.ok) {
      const popData: any = await popResponse.json();
      if (popData[1]) {
        let updateCount = 0;
        for (const item of popData[1]) {
          const iso3 = item.countryiso3code;
          const iso2 = iso3ToIso2[iso3];
          if (iso2 && countries[iso2] && item.value) {
            // Use World Bank population data (prioritize over Wikidata)
            countries[iso2].population = Math.round(item.value);
            countries[iso2].population_year = item.date;
            updateCount++;
          }
        }
        console.log(`  📊 Updated population for ${updateCount} countries from World Bank`);
      }
    }

    console.log('✅ World Bank data fetched (2 batch requests)');
  } catch (error: any) {
    console.warn('⚠️  World Bank API error (continuing with Wikidata data):', error.message);
  }

  return countries;
}

/**
 * Save country data to facts_evaluation table with trust scores
 */
async function saveToDatabase(countries: Record<string, Country>): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  let factCount = 0;

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  if (!settings) {
    throw new Error('No scoring settings found. Please run initialization first.');
  }

  console.log('💾 Inserting/updating facts in facts_evaluation table');

  for (const country of Object.values(countries)) {
    const name = country.name;
    const wikiUrl = country.wikipedia_url;
    const entityType = 'country';

    // Founding year
    if (country.founded_year) {
      const sourceUrl = wikiUrl;
      const as_of_date = `${country.founded_year}-01-01`;
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        today,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        0, // no consensus for single-source data
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        entity_type: entityType,
        attribute: 'founded_year',
        value: country.founded_year.toString(),
        value_type: 'integer',
        source_url: sourceUrl,
        source_name: 'high',
        as_of_date: as_of_date,
        evaluated_at: today,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        trust_score: trustScore,
        status: 'pending'
      });
      factCount++;
    }

    // Population
    if (country.population) {
      const popYear = country.population_year || new Date().getFullYear().toString();
      const sourceUrl = country.population_year 
        ? `https://data.worldbank.org/indicator/SP.POP.TOTL?locations=${country.iso}`
        : wikiUrl;
      const as_of_date = `${popYear}-01-01`;
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        today,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        0,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        entity_type: entityType,
        attribute: 'population',
        value: country.population.toString(),
        value_type: 'integer',
        source_url: sourceUrl,
        source_name: 'high',
        as_of_date: as_of_date,
        evaluated_at: today,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        trust_score: trustScore,
        status: 'pending'
      });
      factCount++;
    }

    // Area
    if (country.area) {
      const sourceUrl = wikiUrl;
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        today,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        0,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        entity_type: entityType,
        attribute: 'area',
        value: Math.round(country.area).toString(),
        value_type: 'integer',
        source_url: sourceUrl,
        source_name: 'high',
        evaluated_at: today,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        trust_score: trustScore,
        status: 'pending'
      });
      factCount++;
    }

    // GDP
    if (country.gdp) {
      const gdpYear = country.gdp_year || new Date().getFullYear().toString();
      const sourceUrl = `https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=${country.iso}`;
      const as_of_date = `${gdpYear}-01-01`;
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        today,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        0,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: name,
        entity_type: entityType,
        attribute: 'gdp',
        value: country.gdp.toString(),
        value_type: 'integer',
        source_url: sourceUrl,
        source_name: 'high',
        as_of_date: as_of_date,
        evaluated_at: today,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        trust_score: trustScore,
        status: 'pending'
      });
      factCount++;
    }
  }

  return factCount;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting country data fetch...\n');
  console.log(`📊 Target: ${TARGET_COUNTRIES.length} major countries\n`);

  try {
    // Step 1: Fetch from Wikidata (1 request)
    let countries = await fetchWikidataCountries();
    console.log('');

    // Step 2: Enhance with World Bank data (2 batch requests)
    countries = await fetchWorldBankData(countries);
    console.log('');

    // Step 3: Save to facts_evaluation with scores
    const factCount = await saveToDatabase(countries);
    
    console.log(`✅ Successfully saved ${factCount} facts to facts_evaluation`);
    console.log('💡 Run promotion from admin UI to move high-trust facts to verified_facts');
    console.log('\n✨ Done! Total API requests: 3 (1 Wikidata + 2 World Bank batch calls)');

  } catch (error: any) {
    console.error('❌ Error fetching country data:', error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('\n✅ Data fetch complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
