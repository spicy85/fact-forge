import { fetchIMFGDP } from "../server/integrations/imf-api";
import { fetchUNPopulation } from "../server/integrations/un-stats-api";

async function testAPIs() {
  console.log("Testing IMF API...");
  const imfResult = await fetchIMFGDP('United States');
  console.log("IMF Result:", JSON.stringify(imfResult, null, 2));

  console.log("\nTesting UN Stats API...");
  const unResult = await fetchUNPopulation('United States');
  console.log("UN Result:", JSON.stringify(unResult, null, 2));
}

testAPIs().catch(console.error);
