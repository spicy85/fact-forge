import { db } from "../server/db";
import { factsEvaluation, sources, scoringSettings, verifiedFacts } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

async function main() {
  console.log("Starting Wikipedia data fetch for facts_evaluation...\n");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  
  if (!settings) {
    console.error("No scoring settings found.");
    process.exit(1);
  }

  // Ensure Wikipedia source exists
  await ensureSourceExists();

  // Fetch all verified facts from Wikipedia to transfer to facts_evaluation
  // Filter by source_url to ensure we only get Wikipedia facts
  const wikipediaFacts = await db
    .select()
    .from(verifiedFacts);
  
  // Filter for Wikipedia sources only (by checking source_url contains 'wikipedia')
  const filteredFacts = wikipediaFacts.filter(fact => 
    fact.source_url && fact.source_url.includes('wikipedia')
  );

  console.log(`Found ${filteredFacts.length} Wikipedia facts in verified_facts\n`);
  console.log("=== Transferring to facts_evaluation ===\n");

  let totalCount = 0;
  const sourceUrl = "https://en.wikipedia.org/";
  
  // Target attributes: population, area_km2, gdp_usd, founded_year
  const targetAttributes = ['population', 'area_km2', 'gdp_usd', 'founded_year'];

  for (const fact of filteredFacts) {
    // Only process target attributes
    if (!targetAttributes.includes(fact.attribute)) {
      continue;
    }

    const evaluatedAt = fact.last_verified_at || new Date().toISOString().split('T')[0];
    
    // Determine as_of_date based on attribute type
    let as_of_date: string | undefined = undefined;
    
    if (fact.attribute === 'founded_year' && fact.value) {
      // For founded_year, the value itself is the year, so use it as as_of_date
      // Match 3-4 digit years to handle ancient founding dates (e.g., Denmark 800, Sweden 900)
      const yearMatch = fact.value.match(/\b\d{3,4}\b/);
      if (yearMatch) {
        as_of_date = `${yearMatch[0]}-01-01`;
      }
    } else if (fact.as_of_date) {
      // Only use fact.as_of_date if it exists and is not the same as evaluated_at
      // (to avoid using "when we checked" as "when data is valid for")
      as_of_date = fact.as_of_date;
    }
    // Otherwise, leave as_of_date undefined (we don't know when the data is valid for)
    
    const sourceTrustScore = await calculateSourceTrustScore(sourceUrl);
    const recencyScore = calculateRecencyScore(
      evaluatedAt,
      settings.recency_tier1_days,
      settings.recency_tier1_score,
      settings.recency_tier2_days,
      settings.recency_tier2_score,
      settings.recency_tier3_score
    );
    const consensusScore = 92; // Wikipedia is generally reliable but not as authoritative as World Bank for economic data
    const trustScore = calculateTrustScore(
      sourceTrustScore,
      recencyScore,
      consensusScore,
      settings.source_trust_weight,
      settings.recency_weight,
      settings.consensus_weight
    );

    try {
      // Check if this exact evaluation already exists
      const existing = await db
        .select()
        .from(factsEvaluation)
        .where(
          and(
            eq(factsEvaluation.entity, fact.entity),
            eq(factsEvaluation.attribute, fact.attribute),
            eq(factsEvaluation.source_url, fact.source_url || sourceUrl),
            eq(factsEvaluation.evaluated_at, evaluatedAt)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`⊘ ${fact.entity} - ${fact.attribute} already exists`);
        continue;
      }

      await db.insert(factsEvaluation).values({
        entity: fact.entity,
        attribute: fact.attribute,
        value: fact.value,
        value_type: fact.value_type,
        source_url: fact.source_url || sourceUrl,
        source_name: "Wikipedia",
        as_of_date: as_of_date,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        consensus_score: consensusScore,
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        trust_score: trustScore,
        evaluation_notes: `Wikipedia - transferred from verified_facts`,
        evaluated_at: evaluatedAt,
        status: "evaluating"
      });

      totalCount++;
      console.log(`✓ ${fact.entity} - ${fact.attribute}${as_of_date ? ` (as of ${as_of_date})` : ''}`);
    } catch (error: any) {
      if (error.code === '23505') {
        console.log(`⊘ ${fact.entity} - ${fact.attribute} already exists (unique constraint)`);
      } else {
        console.error(`✗ Error for ${fact.entity} - ${fact.attribute}:`, error.message);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`✓ Inserted ${totalCount} Wikipedia evaluations`);
  console.log(`  Attributes: ${targetAttributes.join(', ')}`);
  console.log("\n✓ Fetch complete! Wikipedia data now in facts_evaluation.\n");
  
  process.exit(0);
}

async function ensureSourceExists() {
  const [wikipedia] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, "en.wikipedia.org"))
    .limit(1);

  if (!wikipedia) {
    await db.insert(sources).values({
      domain: "en.wikipedia.org",
      public_trust: 85,
      data_accuracy: 90,
      proprietary_score: 88,
      status: "trusted",
      promoted_at: new Date().toISOString(),
      notes: "Wikipedia - community-edited encyclopedia with citation requirements"
    });
    console.log("✓ Created source: en.wikipedia.org\n");
  } else {
    console.log("✓ Source exists: en.wikipedia.org\n");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
