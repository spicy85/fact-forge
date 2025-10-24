import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { factsEvaluation, scoringSettings } from "../shared/schema";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { factsEvaluation, scoringSettings } });

async function migrateCsvToDb() {
  console.log("Starting CSV to facts_evaluation migration...");

  // Get scoring settings
  const [settings] = await db.select().from(scoringSettings).limit(1);
  if (!settings) {
    throw new Error('No scoring settings found. Please run initialization first.');
  }

  // Read CSV file
  const csvPath = path.join(process.cwd(), "public", "facts.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.trim().split("\n");

  // Skip header row
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} facts to migrate`);

  console.log("Inserting facts into facts_evaluation...");

  // Parse and insert facts
  let successCount = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const line of dataLines) {
    // CSV format: entity,attribute,value,valueType,asOfDate,sourceUrl,sourceTrust,lastVerifiedAt
    const [entity, attribute, value, valueType, asOfDate, sourceUrl, sourceTrust, lastVerifiedAt] = line.split(",");

    try {
      const evaluatedAt = lastVerifiedAt?.trim() || today;
      const as_of_date = asOfDate?.trim() || undefined;
      const source_url = sourceUrl.trim();
      
      // Calculate scores
      const sourceTrustScore = await calculateSourceTrustScore(source_url);
      const recencyScore = calculateRecencyScore(
        evaluatedAt,
        settings.recency_tier1_days,
        settings.recency_tier1_score,
        settings.recency_tier2_days,
        settings.recency_tier2_score,
        settings.recency_tier3_score
      );
      const trustScore = calculateTrustScore(
        sourceTrustScore,
        recencyScore,
        0, // no consensus for single-source CSV data
        settings.source_trust_weight,
        settings.recency_weight,
        settings.consensus_weight
      );

      await db.insert(factsEvaluation).values({
        entity: entity.trim(),
        entity_type: 'country',
        attribute: attribute.trim(),
        value: value.trim(),
        value_type: valueType.trim() as 'integer' | 'decimal' | 'text',
        source_url: source_url,
        source_name: sourceTrust.trim() as 'high' | 'medium' | 'low',
        as_of_date: as_of_date,
        evaluated_at: evaluatedAt,
        source_trust_score: sourceTrustScore,
        recency_score: recencyScore,
        trust_score: trustScore,
        status: 'pending'
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to insert fact for ${entity} - ${attribute}:`, error);
    }
  }

  console.log(`Migration complete! Successfully migrated ${successCount}/${dataLines.length} facts to facts_evaluation`);
  console.log('💡 Run promotion from admin UI to move high-trust facts to verified_facts');
}

migrateCsvToDb()
  .then(() => {
    console.log("Migration finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
