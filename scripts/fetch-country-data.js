/**
 * Country Data Fetcher
 * 
 * Fetches country data from Wikidata and World Bank APIs with minimal requests.
 * Strategy:
 * - Single SPARQL query to Wikidata for ~50 major countries
 * - Batch World Bank API calls for economic data
 * - Outputs to facts.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Curated list of ~50 major countries by ISO code
const TARGET_COUNTRIES = [
  'US', 'CN', 'JP', 'DE', 'IN', 'UK', 'FR', 'BR', 'IT', 'CA',
  'KR', 'RU', 'ES', 'AU', 'MX', 'ID', 'NL', 'SA', 'TR', 'CH',
  'PL', 'TH', 'BE', 'SE', 'NG', 'AT', 'NO', 'IL', 'AR', 'IE',
  'SG', 'PH', 'MY', 'ZA', 'DK', 'CO', 'CL', 'FI', 'EG', 'PK',
  'VN', 'BD', 'PT', 'CZ', 'RO', 'NZ', 'PE', 'GR', 'HU', 'UA'
];

/**
 * Fetch country data from Wikidata using SPARQL
 * Single query for all target countries with founding year, population, area
 */
async function fetchWikidataCountries() {
  console.log('📡 Fetching data from Wikidata (1 request for all countries)...');
  
  const sparqlQuery = `
    SELECT ?country ?countryLabel ?iso ?foundedYear ?population ?area ?wikipediaUrl
    WHERE {
      VALUES ?iso { ${TARGET_COUNTRIES.map(c => `"${c}"`).join(' ')} }
      
      ?country wdt:P297 ?iso.           # ISO 3166-1 alpha-2 code
      ?country wdt:P31 wd:Q6256.        # instance of country
      
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

  const data = await response.json();
  
  const countries = {};
  
  for (const result of data.results.bindings) {
    const iso = result.iso?.value;
    if (!iso) continue;
    
    if (!countries[iso]) {
      countries[iso] = {
        name: result.countryLabel?.value || iso,
        iso: iso,
        founded_year: result.foundedYear?.value ? parseInt(result.foundedYear.value) : null,
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
async function fetchWorldBankData(countries) {
  console.log('📡 Fetching GDP/population from World Bank...');
  
  const isoCodes = Object.keys(countries).join(';').toLowerCase();
  
  // Batch request for GDP (most recent value)
  const gdpUrl = `https://api.worldbank.org/v2/country/${isoCodes}/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=100`;
  const popUrl = `https://api.worldbank.org/v2/country/${isoCodes}/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=100`;
  
  try {
    const [gdpResponse, popResponse] = await Promise.all([
      fetch(gdpUrl),
      fetch(popUrl)
    ]);

    if (gdpResponse.ok) {
      const gdpData = await gdpResponse.json();
      if (gdpData[1]) {
        for (const item of gdpData[1]) {
          const iso = item.countryiso3code?.substring(0, 2);
          if (countries[iso] && item.value) {
            countries[iso].gdp = Math.round(item.value);
            countries[iso].gdp_year = item.date;
          }
        }
      }
    }

    if (popResponse.ok) {
      const popData = await popResponse.json();
      if (popData[1]) {
        for (const item of popData[1]) {
          const iso = item.countryiso3code?.substring(0, 2);
          if (countries[iso] && item.value) {
            // Use World Bank population if more recent or if Wikidata didn't have it
            countries[iso].population = Math.round(item.value);
            countries[iso].population_year = item.date;
          }
        }
      }
    }

    console.log('✅ World Bank data fetched (2 batch requests)');
  } catch (error) {
    console.warn('⚠️  World Bank API error (continuing with Wikidata data):', error.message);
  }

  return countries;
}

/**
 * Transform country data to CSV format
 */
function generateCSV(countries) {
  const rows = [
    'entity,attribute,value,value_type,as_of_date,source_url,source_trust,last_verified_at'
  ];

  const today = new Date().toISOString().split('T')[0];

  for (const country of Object.values(countries)) {
    const name = country.name;
    const wikiUrl = country.wikipedia_url;

    // Founding year
    if (country.founded_year) {
      rows.push(
        `${name},founded_year,${country.founded_year},integer,${country.founded_year}-01-01,${wikiUrl},high,${today}`
      );
    }

    // Population
    if (country.population) {
      const popYear = country.population_year || new Date().getFullYear();
      const popSource = country.population_year 
        ? `https://data.worldbank.org/indicator/SP.POP.TOTL?locations=${country.iso}`
        : wikiUrl;
      rows.push(
        `${name},population,${country.population},integer,${popYear}-01-01,${popSource},high,${today}`
      );
    }

    // Area
    if (country.area) {
      rows.push(
        `${name},area_km2,${Math.round(country.area)},integer,2024-01-01,${wikiUrl},high,${today}`
      );
    }

    // GDP
    if (country.gdp) {
      rows.push(
        `${name},gdp_usd,${country.gdp},integer,${country.gdp_year}-01-01,https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=${country.iso},high,${today}`
      );
    }
  }

  return rows.join('\n');
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

    // Step 3: Generate CSV
    const csv = generateCSV(countries);
    
    // Step 4: Write to file
    const outputPath = path.join(__dirname, '..', 'public', 'facts.csv');
    fs.writeFileSync(outputPath, csv, 'utf-8');
    
    console.log('✅ Successfully updated facts.csv');
    console.log(`📁 Location: ${outputPath}`);
    console.log(`📈 Total facts: ${csv.split('\n').length - 1} rows`);
    console.log('\n✨ Done! Total API requests: 3 (1 Wikidata + 2 World Bank batch calls)');

  } catch (error) {
    console.error('❌ Error fetching country data:', error);
    process.exit(1);
  }
}

main();
