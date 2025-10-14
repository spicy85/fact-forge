# Data Fetching Scripts

## fetch-country-data.js

Systematically fetches country data from Wikipedia (Wikidata) and World Bank APIs with minimal API requests.

### What it does:
- Fetches data for ~50 major countries
- Uses **only 3 total API requests**:
  - 1 SPARQL query to Wikidata (all countries, founding year, population, area)
  - 2 batch World Bank queries (GDP + population for all countries)
- Updates `public/facts.csv` with fresh data
- Generates proper citations for each fact

### Attributes fetched:
- **founded_year**: Country founding/independence year
- **population**: Current population 
- **area_km2**: Land area in square kilometers
- **gdp_usd**: Gross Domestic Product in USD

### How to run:

```bash
node scripts/fetch-country-data.js
```

Or add to package.json scripts:
```json
{
  "scripts": {
    "fetch-data": "node scripts/fetch-country-data.js"
  }
}
```

Then run:
```bash
npm run fetch-data
```

### API Efficiency:
✅ Only 3 requests total (not per country!)
✅ Queries specific countries (not all 200+)
✅ Batches all data in minimal calls
✅ No API keys required (public APIs)

### Customization:

To fetch different countries, edit the `TARGET_COUNTRIES` array in the script:

```javascript
const TARGET_COUNTRIES = [
  'US', 'CN', 'JP', // ... add more ISO codes
];
```

### Output:

The script will:
1. Fetch data from APIs
2. Transform to CSV format
3. Write to `public/facts.csv`
4. Show summary of requests made

Example output:
```
🚀 Starting country data fetch...
📊 Target: 50 major countries

📡 Fetching data from Wikidata (1 request for all countries)...
✅ Fetched 50 countries from Wikidata

📡 Fetching GDP/population from World Bank...
✅ World Bank data fetched (2 batch requests)

✅ Successfully updated facts.csv
📁 Location: /path/to/public/facts.csv
📈 Total facts: 180 rows

✨ Done! Total API requests: 3 (1 Wikidata + 2 World Bank batch calls)
```
