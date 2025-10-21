import { db } from "../server/db";
import { sources } from "@shared/schema";

const knownSources = [
  // Wikipedia domains
  {
    domain: "en.wikipedia.org",
    public_trust: 85,
    data_accuracy: 80,
    proprietary_score: 75,
    status: "trusted",
    facts_count: 192,
    notes: "Primary source for country founding years and basic facts"
  },
  {
    domain: "www.wikidata.org",
    public_trust: 80,
    data_accuracy: 85,
    proprietary_score: 70,
    status: "pending_review",
    facts_count: 0,
    notes: "Structured knowledge base from Wikimedia"
  },
  // World Bank
  {
    domain: "data.worldbank.org",
    public_trust: 90,
    data_accuracy: 95,
    proprietary_score: 85,
    status: "trusted",
    facts_count: 192,
    notes: "Primary source for GDP and economic data"
  },
  {
    domain: "api.worldbank.org",
    public_trust: 90,
    data_accuracy: 95,
    proprietary_score: 85,
    status: "pending_review",
    facts_count: 0,
    notes: "World Bank API endpoint"
  },
  // Government and official sources
  {
    domain: "unstats.un.org",
    public_trust: 95,
    data_accuracy: 95,
    proprietary_score: 90,
    status: "pending_review",
    facts_count: 0,
    notes: "United Nations Statistics Division"
  },
  {
    domain: "www.census.gov",
    public_trust: 95,
    data_accuracy: 98,
    proprietary_score: 90,
    status: "pending_review",
    facts_count: 0,
    notes: "US Census Bureau - official population data"
  },
  {
    domain: "ec.europa.eu",
    public_trust: 90,
    data_accuracy: 92,
    proprietary_score: 85,
    status: "pending_review",
    facts_count: 0,
    notes: "European Commission - official EU data"
  },
  // Research and academic
  {
    domain: "www.imf.org",
    public_trust: 92,
    data_accuracy: 94,
    proprietary_score: 88,
    status: "pending_review",
    facts_count: 0,
    notes: "International Monetary Fund - economic data"
  },
  {
    domain: "data.oecd.org",
    public_trust: 88,
    data_accuracy: 90,
    proprietary_score: 82,
    status: "pending_review",
    facts_count: 0,
    notes: "OECD Data - developed country statistics"
  },
  // Less trusted but potentially useful
  {
    domain: "www.cia.gov",
    public_trust: 70,
    data_accuracy: 85,
    proprietary_score: 65,
    status: "pending_review",
    facts_count: 0,
    notes: "CIA World Factbook - comprehensive but politically sensitive"
  },
  {
    domain: "www.statista.com",
    public_trust: 65,
    data_accuracy: 75,
    proprietary_score: 60,
    status: "pending_review",
    facts_count: 0,
    notes: "Commercial statistics portal - verify with primary sources"
  },
  {
    domain: "tradingeconomics.com",
    public_trust: 60,
    data_accuracy: 70,
    proprietary_score: 55,
    status: "pending_review",
    facts_count: 0,
    notes: "Aggregated economic data - secondary source"
  }
];

async function seedSources() {
  console.log("Starting source seeding...");
  
  for (const source of knownSources) {
    try {
      await db.insert(sources).values(source).onConflictDoNothing();
      console.log(`✓ Seeded: ${source.domain} (${source.status})`);
    } catch (error) {
      console.error(`✗ Failed to seed ${source.domain}:`, error);
    }
  }
  
  console.log("\nSeeding complete!");
  console.log(`Total sources: ${knownSources.length}`);
  console.log(`Trusted: ${knownSources.filter(s => s.status === 'trusted').length}`);
  console.log(`Pending review: ${knownSources.filter(s => s.status === 'pending_review').length}`);
  
  process.exit(0);
}

seedSources().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
