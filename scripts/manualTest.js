import 'dotenv/config';
import { getPHCs, getMedicines, predictStockOut, generateTransferRecommendation } from '../src/services/db.js';
import { findTransferSourcesByDistrict } from '../src/services/network.js';

async function validatePHC(phcId, stateName) {
  console.log(`\n================================`);
  console.log(`VALIDATING: ${phcId} (${stateName})`);
  
  const phcs = await getPHCs();
  const p = phcs.find(x => x.phc_id === phcId);
  
  if (!p) {
    console.log(`[!] PHC ${phcId} not found in database.`);
    return;
  }
  
  // 1. BASIC INFORMATION
  console.log(`Name: ${p.name}`);
  console.log(`Address: ${p.address}`);
  console.log(`State: ${p.state || p.state_name}`);
  console.log(`District: ${p.district || p.district_name}`);
  
  // 2. LOCATION
  const hasValidCoords = p.latitude && p.longitude && !isNaN(p.latitude) && !isNaN(p.longitude);
  console.log(`Lat: ${p.latitude}, Lng: ${p.longitude} (Valid: ${hasValidCoords})`);
  
  if (!hasValidCoords) {
    console.log(`[!] Coordinates invalid or missing for ${phcId}`);
    return;
  }
  
  // 3. NETWORK (Nearby PHCs)
  // Simulate UI call for Network Intelligence
  const medicines = await getMedicines();
  let foundShortage = false;
  
  console.log("\n--- Network & Forecasting Data ---");
  for (const m of medicines) {
    try {
      const pred = await predictStockOut(p.phc_id, m.medicine_id);
      if (pred && pred.error && pred.error.includes("Insufficient historical data")) {
        console.log(`Medicine: ${m.name} | Forecast: Insufficient Data`);
      } else if (pred && !pred.error) {
        console.log(`Medicine: ${m.name} | Stock: ${pred.currentStock} | Demand: ${pred.predicted7DayDemand} | Shortage Risk: ${pred.estimatedDaysRemaining <= 7}`);
        
        // 4. TRANSFER
        if (pred.currentStock < pred.predicted7DayDemand && !foundShortage) {
          foundShortage = true;
          console.log("\n--- Active Transfer Recommendation Found ---");
          const rec = await generateTransferRecommendation(p.phc_id, m.medicine_id);
          console.log(`Status: ${rec.recommendationStatus}`);
          if (rec.recommendationStatus === "RECOMMENDED") {
            console.log(`Need: ${rec.destinationNeed}`);
            rec.allocations.forEach(a => {
              console.log(` -> Source: ${a.sourceName} | Qty: ${a.quantity} | Dist: ${a.distanceKm}km`);
            });
          } else {
             console.log(`Reason: ${rec.reason}`);
          }
        }
      }
    } catch(e) {
      console.log(`Medicine: ${m.name} | Error: ${e.message}`);
    }
  }
}

async function runValidations() {
  // MAHARASHTRA
  await validatePHC('phc-nimgaon', 'Maharashtra');
  await validatePHC('phc-jamsar', 'Maharashtra');
  
  // RAJASTHAN
  await validatePHC('phc-bhankrota', 'Rajasthan');
  await validatePHC('phc-achrol', 'Rajasthan');
  
  // UTTAR PRADESH
  await validatePHC('phc-chinhat', 'Uttar Pradesh');
  await validatePHC('phc-mohanlalganj', 'Uttar Pradesh');
  
  // PHASE 1 REGRESSION
  await validatePHC('phc-koth', 'Haryana');
  await validatePHC('phc-alipore', 'Delhi');
}

runValidations().catch(console.error).then(() => process.exit(0));


