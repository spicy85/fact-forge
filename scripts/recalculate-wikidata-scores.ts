import { db } from "../server/db";
import { factsEvaluation, scoringSettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

async function recalculateWikidataScores() {
  console.log("Recalculating Wikidata trust scores...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found.");
    process.exit(1);
  }

  // Get all Wikidata evaluations
  const wikidataEvals = await db
    .select()
    .from(factsEvaluation)
    .where(eq(factsEvaluation.source_name, "www.wikidata.org"));

  console.log(`Found ${wikidataEvals.length} Wikidata evaluations`);

  let updatedCount = 0;
  let belowThreshold = 0;
  let aboveThreshold = 0;

  for (const evaluation of wikidataEvals) {
    const sourceTrustScore = await calculateSourceTrustScore(evaluation.source_url);
    const recencyScore = calculateRecencyScore(
      evaluation.evaluated_at,
      settings.recency_tier1_days,
      settings.recency_tier1_score,
      settings.recency_tier2_days,
      settings.recency_tier2_score,
      settings.recency_tier3_score
    );
    const consensusScore = 90; // Wikidata has good consensus

    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      settings.source_trust_weight,
      settings.recency_weight,
      settings.consensus_weight
    );

    // Update the evaluation
    await db
      .update(factsEvaluation)
      .set({
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        trust_score: trustScore
      })
      .where(eq(factsEvaluation.id, evaluation.id));

    if (trustScore >= settings.credible_threshold) {
      aboveThreshold++;
    } else {
      belowThreshold++;
    }

    updatedCount++;
  }

  console.log(`\n✅ Updated ${updatedCount} Wikidata evaluations`);
  console.log(`  - Above threshold (${settings.credible_threshold}): ${aboveThreshold}`);
  console.log(`  - Below threshold: ${belowThreshold}`);
}

recalculateWikidataScores()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error recalculating Wikidata scores:", error);
    process.exit(1);
  });
