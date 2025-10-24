import { db } from "../server/db";
import { sources, factsEvaluation } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function consolidateWorldBankSources() {
  console.log("Starting World Bank source consolidation...");

  // Step 1: Update all api.worldbank.org URLs and source_trust to data.worldbank.org
  console.log("\nStep 1: Updating api.worldbank.org URLs and source_trust to data.worldbank.org...");
  const updateResult = await db
    .update(factsEvaluation)
    .set({
      source_url: sql`REPLACE(source_url, 'https://api.worldbank.org/', 'https://data.worldbank.org/')`,
      source_name: "data.worldbank.org"
    })
    .where(sql`source_url LIKE 'https://api.worldbank.org/%' OR source_name = 'api.worldbank.org'`)
    .returning({ id: factsEvaluation.id });

  console.log(`Updated ${updateResult.length} facts from api.worldbank.org to data.worldbank.org`);

  // Step 2: Update data.worldbank.org source with better metrics (merge from both)
  console.log("\nStep 2: Updating data.worldbank.org source with merged metrics...");
  await db
    .update(sources)
    .set({
      public_trust: 92,       // Keep higher value from data.worldbank.org
      data_accuracy: 95,      // Keep higher value from api.worldbank.org
      proprietary_score: 94,  // Keep higher value from data.worldbank.org
      notes: "World Bank official data portal - consolidated from API and data portal sources"
    })
    .where(eq(sources.domain, "data.worldbank.org"));

  console.log("Updated data.worldbank.org source with merged metrics");

  // Step 3: Delete api.worldbank.org source
  console.log("\nStep 3: Removing api.worldbank.org source...");
  await db
    .delete(sources)
    .where(eq(sources.domain, "api.worldbank.org"));

  console.log("Deleted api.worldbank.org source");

  console.log("\n✅ World Bank source consolidation complete!");
}

consolidateWorldBankSources()
  .then(() => {
    console.log("Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error consolidating World Bank sources:", error);
    process.exit(1);
  });
