import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { fetchUNStatsForAllCountries } from "../server/integrations/un-stats-api";
import { fetchIMFDataForAllCountries } from "../server/integrations/imf-api";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

async function main() {
  console.log("Starting UN Stats and IMF data fetch...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found. Please set up scoring settings first.");
    process.exit(1);
  }

  // Ensure UN Stats and IMF sources exist
  await ensureSourcesExist();

  // Fetch data from both APIs
  console.log("\n=== Fetching UN Statistics Data ===");
  const unStatsData = await fetchUNStatsForAllCountries();
  console.log(`✓ Fetched UN Stats data for ${unStatsData.size} countries\n`);

  console.log("=== Fetching IMF Data ===");
  const imfData = await fetchIMFDataForAllCountries();
  console.log(`✓ Fetched IMF data for ${imfData.size} countries\n`);

  // Process and insert UN Stats data
  let unStatsCount = 0;
  let imfCount = 0;

  console.log("=== Inserting UN Stats Evaluations ===");
  for (const [country, dataPoints] of unStatsData) {
    for (const dataPoint of dataPoints) {
      // Get most recent data point for the country/indicator
      const latestData = dataPoints
        .filter(d => d.indicator === dataPoint.indicator)
        .sort((a, b) => b.year - a.year)[0];

      if (dataPoint !== latestData) continue; // Only insert most recent

      const evaluatedAt = `${dataPoint.year}-12-31`; // Assume end of year
      const sourceUrl = `https://unstats.un.org/`;

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
      const consensusScore = 95; // High consensus for UN data
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        consensusScore,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: country,
        attribute: "population",
        value: dataPoint.value.toString(),
        value_type: "numeric",
        source_url: sourceUrl,
        source_trust: "unstats.un.org",
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluation_notes: `Fetched from UN Statistics Division, year ${dataPoint.year}`,
        evaluated_at: evaluatedAt,
        status: "evaluating"
      });

      unStatsCount++;
      console.log(`✓ ${country}: population = ${dataPoint.value.toLocaleString()} (${dataPoint.year})`);
    }
  }

  console.log(`\n✓ Inserted ${unStatsCount} UN Stats evaluations\n`);

  // Process and insert IMF data
  console.log("=== Inserting IMF Evaluations ===");
  for (const [country, dataPoints] of imfData) {
    // Get most recent data for each indicator
    const latestGDP = dataPoints
      .filter(d => d.indicator === 'gdp')
      .sort((a, b) => b.year - a.year)[0];
    
    const latestInflation = dataPoints
      .filter(d => d.indicator === 'inflation')
      .sort((a, b) => b.year - a.year)[0];

    const dataToInsert = [latestGDP, latestInflation].filter(Boolean);

    for (const dataPoint of dataToInsert) {
      const evaluatedAt = `${dataPoint.year}-12-31`;
      const sourceUrl = `https://www.imf.org/`;

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
      const consensusScore = 95; // High consensus for IMF data
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        consensusScore,
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: country,
        attribute: dataPoint.indicator,
        value: dataPoint.value.toString(),
        value_type: "numeric",
        source_url: sourceUrl,
        source_trust: "www.imf.org",
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluation_notes: `Fetched from IMF, year ${dataPoint.year}`,
        evaluated_at: evaluatedAt,
        status: "evaluating"
      });

      imfCount++;
      console.log(`✓ ${country}: ${dataPoint.indicator} = ${dataPoint.value.toLocaleString()} (${dataPoint.year})`);
    }
  }

  console.log(`\n✓ Inserted ${imfCount} IMF evaluations\n`);
  console.log(`=== Summary ===`);
  console.log(`Total evaluations added: ${unStatsCount + imfCount}`);
  console.log(`  - UN Stats: ${unStatsCount}`);
  console.log(`  - IMF: ${imfCount}`);
  console.log("\n✓ Data fetch complete!");
  
  process.exit(0);
}

async function ensureSourcesExist() {
  // Check if UN Stats source exists
  const [unStats] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "unstats.un.org"))
    .limit(1);

  if (!unStats) {
    await db.insert(sources).values({
      domain: "unstats.un.org",
      public_trust: 95,
      data_accuracy: 95,
      proprietary_score: 90,
      status: "pending_review",
      notes: "UN Statistics Division - authoritative source for global statistics"
    });
    console.log("✓ Created source: unstats.un.org");
  }

  // Check if IMF source exists
  const [imf] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "www.imf.org"))
    .limit(1);

  if (!imf) {
    await db.insert(sources).values({
      domain: "www.imf.org",
      public_trust: 92,
      data_accuracy: 94,
      proprietary_score: 88,
      status: "pending_review",
      notes: "International Monetary Fund - authoritative economic data"
    });
    console.log("✓ Created source: www.imf.org");
  }
}

main().catch((error) => {
  console.error("Error fetching data:", error);
  process.exit(1);
});
