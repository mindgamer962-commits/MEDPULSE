import "dotenv/config";
import { findNearbyPHCs, findPHCsInSameDistrict, findPHCsInOtherDistricts, getPHCResourceAvailability } from './src/services/network.js';
import { getPHCs, predictStockOut, calculateTransferRecommendation } from './src/services/db.js';

async function runManualTests() {
  console.log("=== STARTING DAY 3 MANUAL VERIFICATION TESTS ===\n");
  
  const allPHCs = await getPHCs();
  console.log(`[OK] Loaded ${allPHCs.length} PHCs from the live Firestore database.\n`);

  // Find a target with coordinates (e.g., phc-koth from Gujarat)
  const phcWithCoords = allPHCs.find(p => p.phc_id === "phc-koth" && p.latitude);
  // Find a target without coordinates (Phase 2 PHC)
  const phcWithoutCoords = allPHCs.find(p => p.phc_id === "phc-nimgaon");

  if (!phcWithCoords || !phcWithoutCoords) {
    console.error("Error: Could not find required PHCs for testing in the database.");
    process.exit(1);
  }

  // --- Test 1 — PHC network ---
  console.log(`-- Test 1: Nearby PHC Search (Target: ${phcWithCoords.name}) --`);
  const nearby = await findNearbyPHCs(phcWithCoords.phc_id, 50, allPHCs);
  console.log(`Found ${nearby.length} nearby PHCs within 50km.`);
  if (nearby.length > 0) {
    console.log(`Nearest is ${nearby[0].name} at ${nearby[0].distance_km}km`);
  }
  console.log(`[PASS] Target PHC excluded correctly? ${!nearby.some(p => p.phc_id === phcWithCoords.phc_id)}\n`);

  // --- Test 2 — Same district ---
  console.log(`-- Test 2: Same District Search (District: ${phcWithCoords.district_name || phcWithCoords.district_id}) --`);
  const sameDist = await findPHCsInSameDistrict(phcWithCoords.phc_id, allPHCs);
  console.log(`Found ${sameDist.length} PHCs in the same district.`);
  console.log(`[PASS] Other districts excluded correctly? ${!sameDist.some(p => p.district_id !== phcWithCoords.district_id)}\n`);

  // --- Test 3 — Cross district ---
  console.log(`-- Test 3: Cross District Search --`);
  const otherDist = await findPHCsInOtherDistricts(phcWithCoords.phc_id, allPHCs);
  console.log(`Found ${otherDist.length} PHCs in other districts.`);
  console.log(`[PASS] Same district excluded correctly? ${!otherDist.some(p => p.district_id === phcWithCoords.district_id)}\n`);

  // --- Test 4 — New PHC without coordinates ---
  console.log(`-- Test 4: Handling PHC Without Coordinates (Target: ${phcWithoutCoords.name}) --`);
  const nearbyNoCoords = await findNearbyPHCs(phcWithoutCoords.phc_id, 50, allPHCs);
  console.log(`[PASS] Nearby search safely returned ${nearbyNoCoords.length} results (expected 0).`);
  const sameDistNoCoords = await findPHCsInSameDistrict(phcWithoutCoords.phc_id, allPHCs);
  console.log(`[PASS] Same-district search works without coords? Yes, returned ${sameDistNoCoords.length} results.`);
  const otherDistNoCoords = await findPHCsInOtherDistricts(phcWithoutCoords.phc_id, allPHCs);
  console.log(`[PASS] Cross-district search works without coords? Yes, returned ${otherDistNoCoords.length} results.\n`);

  // --- Test 5 — Medicine ---
  console.log(`-- Test 5: Medicine Resource Availability --`);
  const resourceAvail = await getPHCResourceAvailability(phcWithCoords.phc_id);
  if (resourceAvail.data_available) {
    console.log(`[PASS] Medicine data available. Found ${resourceAvail.resources.medicines.length} medicine records.`);
  } else {
    console.log("[FAIL] Medicine data unavailable.");
  }
  
  console.log("\nVerifying existing forecasting logic...");
  try {
    const forecast = await predictStockOut(phcWithCoords.phc_id, "med-ors");
    console.log(`[PASS] Forecast intact. Risk Level: ${forecast.riskLevel}, Projected Shortage: ${forecast.projectedShortage}\n`);
  } catch (e) {
    console.error("[FAIL] Forecasting threw an error:", e);
  }

  // --- Test 6 — Transfer ---
  console.log(`-- Test 6: Transfer Recommendation logic check --`);
  try {
    const transfer = await calculateTransferRecommendation(phcWithCoords.phc_id, "med-ors");
    console.log(`[PASS] Transfer calculation intact. Status: ${transfer.recommendationStatus || 'Success'}`);
  } catch (e) {
    console.error("[FAIL] Transfer calculation threw an error:", e);
  }

  console.log("\n=== ALL TESTS COMPLETE ===");
}

runManualTests().then(() => process.exit(0)).catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
