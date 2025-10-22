import { db } from "../server/db";
import { factsEvaluation } from "../shared/schema";
import { sql } from "drizzle-orm";

/**
 * Remove duplicate entries from facts_evaluation table
 * Keeps the most recent entry (highest ID) for each unique combination of:
 * entity, attribute, value, source_url, evaluated_at
 */
async function main() {
  console.log("Starting duplicate removal from facts_evaluation...\n");

  // Find and delete duplicates, keeping only the entry with the highest ID
  // A duplicate is defined as: same entity, attribute, value, and source_url
  const result = await db.execute(sql`
    DELETE FROM facts_evaluation
    WHERE id IN (
      SELECT id
      FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (
            PARTITION BY entity, attribute, value, source_url 
            ORDER BY id DESC
          ) as row_num
        FROM facts_evaluation
      ) t
      WHERE row_num > 1
    )
  `);

  console.log(`✓ Removed duplicate entries`);
  console.log(`  Rows affected: ${result.rowCount || 0}\n`);

  // Verify no duplicates remain
  const duplicateCheck = await db.execute(sql`
    SELECT 
      entity, 
      attribute, 
      value, 
      source_url,
      COUNT(*) as duplicate_count
    FROM facts_evaluation 
    GROUP BY entity, attribute, value, source_url
    HAVING COUNT(*) > 1
  `);

  if (duplicateCheck.rows.length > 0) {
    console.log(`⚠️  Warning: ${duplicateCheck.rows.length} duplicate groups still exist`);
    console.log(duplicateCheck.rows);
  } else {
    console.log(`✓ Verification complete: No duplicates found\n`);
  }

  // Show final count
  const totalCount = await db.execute(sql`SELECT COUNT(*) as total FROM facts_evaluation`);
  console.log(`Total evaluations remaining: ${totalCount.rows[0].total}`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
