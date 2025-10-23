import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { fetchWorldBankDataForAllCountries } from "../server/integrations/worldbank-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

async function main() {
  console.log("Starting World Bank data fetch...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found. Please set up scoring settings first.");
    process.exit(1);
  }

  // Ensure World Bank source exists and is trusted
  await ensureSourceExists();

  // Fetch data from World Bank
  console.log("=== Fetching World Bank Data ===");
  const worldBankData = await fetchWorldBankDataForAllCountries();
  console.log(`✓ Fetched data for ${worldBankData.size} countries\n`);

  // Process and insert World Bank data
  let totalCount = 0;
  const sourceUrl = "https://data.worldbank.org/";

  console.log("=== Inserting World Bank Evaluations ===");
  for (const [country, indicatorMap] of worldBankData) {
    for (const [indicatorName, dataPoints] of indicatorMap) {
      // Get most recent data point for each indicator
      const latestData = dataPoints.sort((a, b) => b.year - a.year)[0];

      if (!latestData) continue;

      const evaluatedAt = new Date().toISOString().split('T')[0];

      // Map indicator codes to attributes
      const attributeMap: Record<string, string> = {
        'population': 'population',
        'gdp': 'gdp',
        'gdp_per_capita': 'gdp_per_capita',
        'area': 'area',
        'inflation': 'inflation'
      };

      const attribute = attributeMap[indicatorName];
      if (!attribute) continue;

      // Calculate scores
      const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
      const recencyScore = calculateRecencyScore(
        evaluatedAt,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const consensusScore = 95; // High consensus for World Bank data
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
          source_trust: "data.worldbank.org",
          as_of_date: latestData.as_of_date,
          source_trust_score: sourceTrustScore,
          recency_score: recencyScore,
          consensus_score: consensusScore,
          source_trust_weight: settings.source_trust_weight,
          recency_weight: settings.recency_weight,
          consensus_weight: settings.consensus_weight,
          trust_score: trustScore,
          evaluation_notes: `Fetched from World Bank API, year ${latestData.year}, indicator ${latestData.indicator}`,
          evaluated_at: evaluatedAt,
          status: "evaluating"
        });

        totalCount++;
        console.log(`✓ ${country}: ${attribute} = ${latestData.value.toLocaleString()} (${latestData.year})`);
      } catch (error: any) {
        // Skip duplicates
        if (error.code === '23505') {
          console.log(`  ⊘ ${country}: ${attribute} already exists, skipping`);
        } else {
          console.error(`  ✗ Error inserting ${country} ${attribute}:`, error.message);
        }
      }
    }
  }

  console.log(`\n✓ Inserted ${totalCount} World Bank evaluations`);
  console.log("\n=== Summary ===");
  console.log(`Total new evaluations added: ${totalCount}`);
  console.log("\n✓ Data fetch complete!");
  
  process.exit(0);
}

async function ensureSourceExists() {
  // Check if World Bank source exists
  const [worldBank] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "data.worldbank.org"))
    .limit(1);

  if (!worldBank) {
    await db.insert(sources).values({
      domain: "data.worldbank.org",
      public_trust: 95,
      data_accuracy: 98,
      proprietary_score: 92,
      status: "trusted",
      promoted_at: new Date().toISOString(),
      notes: "World Bank - authoritative source for global economic and development data"
    });
    console.log("✓ Created and promoted source: data.worldbank.org\n");
  } else if (worldBank.status !== 'trusted') {
    await db
      .update(sources)
      .set({ 
        status: 'trusted',
        promoted_at: new Date().toISOString()
      })
      .where(eq(sources.domain, "data.worldbank.org"));
    console.log("✓ Promoted source to trusted: data.worldbank.org\n");
  } else {
    console.log("✓ Source already exists and is trusted: data.worldbank.org\n");
  }
}

main().catch((error) => {
  console.error("Error fetching data:", error);
  process.exit(1);
});
