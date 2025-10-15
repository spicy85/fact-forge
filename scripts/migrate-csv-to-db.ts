import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { facts } from "../shared/schema";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { facts } });

async function migrateCsvToDb() {
  console.log("Starting CSV to database migration...");

  // Read CSV file
  const csvPath = path.join(process.cwd(), "public", "facts.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.trim().split("\n");

  // Skip header row
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} facts to migrate`);

  // Clear existing facts
  await db.delete(facts);
  console.log("Cleared existing facts from database");

  // Parse and insert facts
  let successCount = 0;
  for (const line of dataLines) {
    // Simple CSV parsing (assuming no commas in values)
    const [entity, attribute, value, valueType, asOfDate, sourceUrl, sourceTrust, lastVerifiedAt] = line.split(",");

    try {
      await db.insert(facts).values({
        entity: entity.trim(),
        attribute: attribute.trim(),
        value: value.trim(),
        valueType: valueType.trim(),
        asOfDate: asOfDate.trim(),
        sourceUrl: sourceUrl.trim(),
        sourceTrust: sourceTrust.trim(),
        lastVerifiedAt: lastVerifiedAt.trim(),
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to insert fact for ${entity} - ${attribute}:`, error);
    }
  }

  console.log(`Migration complete! Successfully migrated ${successCount}/${dataLines.length} facts`);
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
