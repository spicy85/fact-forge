import { storage } from "../server/storage";

async function populateEvaluationTable() {
  console.log("Populating facts_evaluation table with ALL verified facts...\n");

  const verifiedFacts = await storage.getAllVerifiedFacts();
  console.log(`Found ${verifiedFacts.length} verified facts to copy\n`);

  let successCount = 0;
  const today = new Date();

  for (let i = 0; i < verifiedFacts.length; i++) {
    const fact = verifiedFacts[i];
    
    const daysAgo = i % 15;
    const evaluatedDate = new Date(today);
    evaluatedDate.setDate(evaluatedDate.getDate() - daysAgo);
    const evaluatedAt = evaluatedDate.toISOString().split('T')[0];
    
    const consensusScore = 40 + Math.floor(Math.random() * 40);
    
    try {
      await storage.insertFactsEvaluation({
        entity: fact.entity,
        attribute: fact.attribute,
        value: fact.value,
        value_type: fact.value_type,
        source_url: fact.source_url,
        source_trust: fact.source_trust,
        consensus_score: consensusScore,
        evaluation_notes: `Automated evaluation: Checking ${fact.attribute} for ${fact.entity}`,
        evaluated_at: evaluatedAt,
        status: "pending",
      });
      
      successCount++;
      console.log(`✓ ${successCount}. ${fact.entity} - ${fact.attribute}: ${fact.value} (evaluated: ${evaluatedAt}, consensus: ${consensusScore})`);
    } catch (error) {
      console.error(`✗ Failed to insert evaluation for ${fact.entity} - ${fact.attribute}:`, error);
    }
  }

  console.log(`\n✅ Successfully inserted ${successCount}/${verifiedFacts.length} evaluation records`);
  
  const allEvaluations = await storage.getAllFactsEvaluation();
  console.log(`📊 Total evaluations in table: ${allEvaluations.length}`);
}

populateEvaluationTable()
  .then(() => {
    console.log("\nPopulation complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Population failed:", error);
    process.exit(1);
  });
