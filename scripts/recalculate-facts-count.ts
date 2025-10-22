import { db } from "../server/db";
import { sources, factsEvaluation } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { extractDomain } from "../server/utils";

async function recalculateFactsCount() {
  console.log("Starting facts_count recalculation for all sources...\n");

  // Step 1: Get all facts and extract their domains
  console.log("Step 1: Fetching all facts...");
  const allFacts = await db.select().from(factsEvaluation);
  console.log(`Found ${allFacts.length} total facts`);

  // Step 2: Group facts by domain
  console.log("\nStep 2: Grouping facts by domain...");
  const factsByDomain = new Map<string, number>();
  
  for (const fact of allFacts) {
    const domain = extractDomain(fact.source_url);
    factsByDomain.set(domain, (factsByDomain.get(domain) || 0) + 1);
  }

  console.log(`Facts grouped into ${factsByDomain.size} unique domains:`);
  for (const [domain, count] of factsByDomain.entries()) {
    console.log(`  - ${domain}: ${count} facts`);
  }

  // Step 3: Update facts_count for each source
  console.log("\nStep 3: Updating facts_count in sources table...");
  const allSources = await db.select().from(sources);
  
  for (const source of allSources) {
    const count = factsByDomain.get(source.domain) || 0;
    await db
      .update(sources)
      .set({ facts_count: count })
      .where(eq(sources.domain, source.domain));
    
    console.log(`  - ${source.domain}: updated to ${count} facts`);
  }

  console.log("\n✅ Facts count recalculation complete!");
  
  // Step 4: Show summary
  console.log("\nFinal Summary:");
  const updatedSources = await db.select().from(sources);
  for (const source of updatedSources) {
    console.log(`  ${source.domain}: ${source.facts_count} facts (status: ${source.status})`);
  }
}

recalculateFactsCount()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error recalculating facts count:", error);
    process.exit(1);
  });
