import { fetchWorldBankIndicator, fetchAllIndicatorsForCountry, INDICATORS } from "../server/integrations/worldbank-api";

async function testAPIs() {
  console.log("Testing World Bank API - Population...");
  const popResult = await fetchWorldBankIndicator('United States', INDICATORS.POPULATION, 'population');
  console.log("Population Result:", JSON.stringify(popResult, null, 2));

  console.log("\nTesting World Bank API - GDP...");
  const gdpResult = await fetchWorldBankIndicator('Canada', INDICATORS.GDP_CURRENT, 'gdp');
  console.log("GDP Result:", JSON.stringify(gdpResult, null, 2));

  console.log("\nTesting World Bank API - All Indicators for Poland...");
  const allIndicators = await fetchAllIndicatorsForCountry('Poland');
  console.log(`\nFetched ${allIndicators.size} indicators for Poland:`);
  for (const [indicator, data] of allIndicators) {
    console.log(`  - ${indicator}: ${data.length} data points`);
    if (data.length > 0) {
      const latest = data[data.length - 1];
      console.log(`    Latest: ${latest.year} = ${latest.value.toLocaleString()}`);
    }
  }
}

testAPIs().catch(console.error);
