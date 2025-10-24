import { db } from "../server/db";
import { factsEvaluation } from "../shared/schema";
import { eq, or, sql } from "drizzle-orm";

async function fixWorldBankSourceTrust() {
  console.log("Fixing World Bank source_trust column...\n");

  // Update all facts with api.worldbank.org in source_trust to data.worldbank.org
  const updateResult = await db
    .update(factsEvaluation)
    .set({
      source_name: "data.worldbank.org"
    })
    .where(eq(factsEvaluation.source_name, "api.worldbank.org"))
    .returning({ id: factsEvaluation.id });

  console.log(`✓ Updated ${updateResult.length} facts to use data.worldbank.org in source_trust`);

  // Verify the fix
  const remainingApiRefs = await db
    .select()
    .from(factsEvaluation)
    .where(eq(factsEvaluation.source_name, "api.worldbank.org"));

  if (remainingApiRefs.length === 0) {
    console.log(`✓ All facts now correctly reference data.worldbank.org`);
  } else {
    console.log(`⚠ Warning: ${remainingApiRefs.length} facts still reference api.worldbank.org`);
  }

  console.log("\n✅ Fix complete!");
}

fixWorldBankSourceTrust()
  .then(() => {
    console.log("Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error fixing World Bank source_name:", error);
    process.exit(1);
  });
