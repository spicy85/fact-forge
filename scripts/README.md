# Data Fetching Scripts

## fetch-country-data.ts

Systematically fetches country data from Wikipedia (Wikidata) and World Bank APIs with minimal API requests.

### What it does:
- Fetches data for ~50 major countries
- Uses **only 3 total API requests**:
  - 1 SPARQL query to Wikidata (all countries, founding year, population, area)
  - 2 batch World Bank queries (GDP + population for all countries)
- Saves directly to PostgreSQL database
- Generates proper citations for each fact

### Attributes fetched:
- **founded_year**: Country founding/independence year
- **population**: Current population 
- **area_km2**: Land area in square kilometers
- **gdp_usd**: Gross Domestic Product in USD

### How to run:

```bash
npx tsx scripts/fetch-country-data.ts
```

Or add to package.json scripts:
```json
{
  "scripts": {
    "fetch-data": "tsx scripts/fetch-country-data.ts"
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
2. Clear existing facts from database
3. Insert fresh data into PostgreSQL
4. Show summary of requests made

Example output:
```
🚀 Starting country data fetch...
📊 Target: 50 major countries

📡 Fetching data from Wikidata (1 request for all countries)...
✅ Fetched 50 countries from Wikidata

📡 Fetching GDP/population from World Bank...
✅ World Bank data fetched (2 batch requests)

🗑️  Cleared existing facts from database
✅ Successfully saved 192 facts to database

✨ Done! Total API requests: 3 (1 Wikidata + 2 World Bank batch calls)
```

## migrate-csv-to-db.ts

One-time migration script to import existing `public/facts.csv` data into the PostgreSQL database.

### What it does:
- Reads `public/facts.csv`
- Clears existing database facts
- Imports all CSV rows into the `facts` table

### How to run:

```bash
npx tsx scripts/migrate-csv-to-db.ts
```

**Note:** This script is only needed when migrating from CSV to database for the first time.
