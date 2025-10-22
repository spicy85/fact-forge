import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { fetchAllIndicatorsForCountry } from "../server/integrations/worldbank-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

// All 48 countries in the database
const ALL_COUNTRIES = [
  'Argentina', 'Australia', 'Austria', 'Bangladesh', 'Belgium', 'Brazil',
  'Canada', 'Chile', 'Colombia', 'Czech Republic', 'Denmark', 'Egypt',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'India',
  'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Kingdom of the Netherlands',
  'Malaysia', 'Mexico', 'New Zealand', 'Nigeria', 'Norway', 'Pakistan',
  'Paraguay', 'People\'s Republic of China', 'Philippines', 'Poland',
  'Portugal', 'Romania', 'Russia', 'Saudi Arabia', 'Singapore', 'South Africa',
  'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Thailand', 'Turkey',
  'United States', 'Vietnam'
];

async function main() {
  console.log("Starting World Bank data fetch (subset)...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found.");
    process.exit(1);
  }

  // Ensure World Bank source exists
  await ensureSourceExists();

  let totalCount = 0;
  const sourceUrl = "https://api.worldbank.org/";

  console.log("=== Fetching & Inserting World Bank Data ===");
  console.log(`Processing ${ALL_COUNTRIES.length} countries...\n`);
  
  for (const country of ALL_COUNTRIES) {
    console.log(`Fetching ${country}...`);
    const indicatorMap = await fetchAllIndicatorsForCountry(country);
    
    for (const [indicatorName, dataPoints] of indicatorMap) {
      const latestData = dataPoints.sort((a, b) => b.year - a.year)[0];
      if (!latestData) continue;

      const evaluatedAt = `${latestData.year}-12-31`;
      const attributeMap: Record<string, string> = {
        'population': 'population',
        'gdp': 'gdp',
        'gdp_per_capita': 'gdp_per_capita',
        'area': 'area',
        'inflation': 'inflation'
      };

      const attribute = attributeMap[indicatorName];
      if (!attribute) continue;

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

      try {
        await db.insert(factsEvaluation).values({
          entity: country,
          attribute: attribute,
          value: latestData.value.toString(),
          value_type: "numeric",
          source_url: sourceUrl,
          source_trust: "api.worldbank.org",
          source_trust_score: sourceTrustScore,
          recency_score: recencyScore,
          consensus_score: consensusScore,
          source_trust_weight: settings.source_trust_weight,
          recency_weight: settings.recency_weight,
          consensus_weight: settings.consensus_weight,
          trust_score: trustScore,
          evaluation_notes: `World Bank API, year ${latestData.year}`,
          evaluated_at: evaluatedAt,
          status: "evaluating"
        });

        totalCount++;
        console.log(`  ✓ ${attribute} = ${latestData.value.toLocaleString()} (${latestData.year})`);
      } catch (error: any) {
        if (error.code === '23505') {
          console.log(`  ⊘ ${attribute} already exists`);
        } else {
          console.error(`  ✗ Error:`, error.message);
        }
      }
    }
    console.log();
  }

  console.log(`\n=== Summary ===`);
  console.log(`✓ Inserted ${totalCount} World Bank evaluations`);
  console.log(`  Countries: ${ALL_COUNTRIES.length}`);
  console.log(`  Indicators: population, gdp, gdp_per_capita, area, inflation`);
  console.log("\n✓ Fetch complete! You now have multi-source consensus with Wikipedia + World Bank.\n");
  
  process.exit(0);
}

async function ensureSourceExists() {
  const [worldBank] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "api.worldbank.org"))
    .limit(1);

  if (!worldBank) {
    await db.insert(sources).values({
      domain: "api.worldbank.org",
      public_trust: 95,
      data_accuracy: 98,
      proprietary_score: 92,
      status: "trusted",
      promoted_at: new Date().toISOString(),
      notes: "World Bank - authoritative source for global economic and development data"
    });
    console.log("✓ Created source: api.worldbank.org\n");
  } else {
    console.log("✓ Source exists: api.worldbank.org\n");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
