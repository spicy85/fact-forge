import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { factsEvaluation, sources } from "../shared/schema";
import { calculateSourceTrustScore, calculateRecencyScore, calculateTrustScore } from "../server/evaluation-scoring";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { factsEvaluation, sources } });

async function testEvaluationScoring() {
  console.log("Testing evaluation scoring calculations...\n");

  const testUrl = "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=BR";
  const testDate = "2025-10-16";
  
  console.log("Test 1: Source Trust Score");
  console.log(`URL: ${testUrl}`);
  const sourceTrust = await calculateSourceTrustScore(testUrl);
  console.log(`Calculated source_trust_score: ${sourceTrust}`);
  console.log(`Expected: 90 (average of World Bank: 88, 94, 88)`);
  console.log(`Match: ${sourceTrust === 90 ? '✅' : '❌'}\n`);

  console.log("Test 2: Recency Score (recent date)");
  console.log(`Date: ${testDate}`);
  const recencyRecent = calculateRecencyScore(testDate);
  console.log(`Calculated recency_score: ${recencyRecent}`);
  console.log(`Expected: 100 (within last week)`);
  console.log(`Match: ${recencyRecent === 100 ? '✅' : '❌'}\n`);

  console.log("Test 3: Recency Score (old date)");
  const oldDate = "2024-01-01";
  console.log(`Date: ${oldDate}`);
  const recencyOld = calculateRecencyScore(oldDate);
  console.log(`Calculated recency_score: ${recencyOld}`);
  console.log(`Expected: 10 (older than 1 week)`);
  console.log(`Match: ${recencyOld === 10 ? '✅' : '❌'}\n`);

  console.log("Test 4: Trust Score Calculation");
  const trustScore = calculateTrustScore(90, 100, 50, 1, 1, 1);
  console.log(`Calculated trust_score: ${trustScore}`);
  console.log(`Expected: 80 (weighted average: (90 + 100 + 50) / 3)`);
  console.log(`Match: ${trustScore === 80 ? '✅' : '❌'}\n`);

  console.log("Test 5: Trust Score with Different Weights");
  const trustScoreWeighted = calculateTrustScore(90, 100, 50, 2, 1, 1);
  console.log(`Calculated trust_score (weights 2,1,1): ${trustScoreWeighted}`);
  console.log(`Expected: 83 (weighted average: (90*2 + 100*1 + 50*1) / 4 = 330/4)`);
  console.log(`Match: ${trustScoreWeighted === 83 ? '✅' : '❌'}\n`);

  console.log("All tests completed!");
}

testEvaluationScoring()
  .then(() => {
    console.log("\nTest suite finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test suite failed:", error);
    process.exit(1);
  });
