import { getPHCs, getMedicines, predictStockOut } from '../src/services/db.js';

async function verifyAll() {
  const phcs = await getPHCs();
  const medicines = await getMedicines();

  console.log(`Checking ${phcs.length} PHCs and ${medicines.length} Medicines (Total = ${phcs.length * medicines.length} combinations)...`);

  let forecastableCount = 0;
  let insufficientCount = 0;
  let zeroDemandCount = 0;
  let fallbackCount = 0;
  let currentWindowCount = 0;

  const targetExamples = ['phc-nakra', 'phc-adalaj', 'phc-koth', 'phc-achrol'];
  const exampleResults = {};

  // Process PHCs in parallel batches of 5
  for (let i = 0; i < phcs.length; i += 5) {
    const batch = phcs.slice(i, i + 5);
    await Promise.all(batch.map(async (phc) => {
      for (const med of medicines) {
        const pred = await predictStockOut(phc.phc_id, med.medicine_id);
        if (pred.error) {
          insufficientCount++;
        } else {
          forecastableCount++;
          if (pred.predicted7DayDemand === 0) zeroDemandCount++;

          const isFallback = pred.reasoning && pred.reasoning.includes('historical fallback');
          if (isFallback) fallbackCount++;
          else currentWindowCount++;

          if (targetExamples.includes(phc.phc_id)) {
            const key = phc.name || phc.phc_id;
            if (!exampleResults[key]) exampleResults[key] = [];
            exampleResults[key].push({
              med: med.name,
              stock: pred.currentStock,
              demand7d: pred.predicted7DayDemand,
              dailyDemand: pred.averageDailyDemand,
              daysLeft: pred.estimatedDaysRemaining,
              risk: pred.riskLevel,
              source: isFallback ? 'HISTORICAL_FALLBACK' : 'CURRENT_WINDOW'
            });
          }
        }
      }
    }));
    console.log(`Processed ${Math.min(i + 5, phcs.length)} / ${phcs.length} PHCs...`);
  }

  console.log("\n=== METRICS SUMMARY ===");
  console.log(`Total Evaluated Combinations: ${phcs.length * medicines.length}`);
  console.log(`Now Forecastable (Non-Error): ${forecastableCount} / ${phcs.length * medicines.length}`);
  console.log(`Remaining INSUFFICIENT_DATA: ${insufficientCount}`);
  console.log(`Medicines showing Predicted 7-Day Demand = 0: ${zeroDemandCount}`);
  console.log(`Using Historical Fallback: ${fallbackCount}`);
  console.log(`Using Current 30-Day Window: ${currentWindowCount}`);

  console.log("\n=== DETAILED EXAMPLES ===");
  for (const [phcName, list] of Object.entries(exampleResults)) {
    console.log(`\nPHC: ${phcName}`);
    for (const item of list) {
      console.log(`  - ${item.med.padEnd(14)}: Stock=${String(item.stock).padStart(5)} | 7D Demand=${String(item.demand7d).padStart(5)} | Daily=${String(item.dailyDemand).padStart(5)} | DaysLeft=${String(item.daysLeft).padStart(6)} | Risk=${item.risk} | Source=${item.source}`);
    }
  }
}

verifyAll().catch(err => console.error(err));
