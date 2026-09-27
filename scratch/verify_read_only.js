import { 
  getPHCs, 
  getMedicines, 
  forecastDemand, 
  getFilteredStockTransactions, 
  getInventory, 
  getDailyFootfall, 
  getFootfallStats, 
  checkForDuplicateFootfall 
} from '../src/services/db.js';
import { forecastBedDemand } from '../src/services/bedForecast.js';
import { getPHCBedAvailability } from '../src/services/beds.js';

async function verifyReadOnly() {
  console.log('=== START READ-ONLY VERIFICATION ===\n');

  const testPhcId = 'phc-adalaj';
  const testMedId = 'med-paracetamol';
  const testDate = '2026-09-14';

  // 1. Verify PHCs & Medicines baseline count
  console.log('1. Baseline Check:');
  const phcs = await getPHCs();
  console.log(`- PHCs Count: ${phcs.length} (Expected: 28)`);
  const meds = await getMedicines();
  console.log(`- Medicines Count: ${meds.length} (Expected: 5)`);
  const bedsCheck = await getPHCBedAvailability(testPhcId);
  console.log(`- Bed Data for ${testPhcId}: Available=${bedsCheck.data_available}, Total=${bedsCheck.beds?.total_beds}, Occupied=${bedsCheck.beds?.occupied_beds}`);

  // 2. forecastDemand
  console.log('\n2. Testing forecastDemand(phcId, medicineId):');
  const fc = await forecastDemand(testPhcId, testMedId);
  console.log('- Result:', {
    totalForecast: fc.totalForecast,
    averageDailyDemand: fc.averageDailyDemand,
    currentStock: fc.currentStock,
    trend: fc.trend,
    isHistoricalFallback: fc.isHistoricalFallback,
    error: fc.error
  });

  // 3. getFilteredStockTransactions
  console.log('\n3. Testing getFilteredStockTransactions(phcId, medicineId):');
  const txs = await getFilteredStockTransactions(testPhcId, testMedId);
  console.log(`- Documents returned: ${txs.length}`);
  if (txs.length > 0) {
    console.log(`- Latest Tx Sample: Type=${txs[0].transaction_type}, Qty=${txs[0].quantity}`);
  }

  // 4. getInventory
  console.log('\n4. Testing getInventory(phcId):');
  const inv = await getInventory(testPhcId);
  console.log(`- Inventory items count: ${inv.length}`);
  inv.forEach(item => {
    console.log(`  * ${item.name}: CurrentStock=${item.currentStock}, TotalRecv=${item.totalReceived}, TotalUsed=${item.totalUsed}`);
  });

  // 5. getDailyFootfall(phcId)
  console.log('\n5. Testing getDailyFootfall(phcId):');
  const ffs = await getDailyFootfall(testPhcId);
  console.log(`- Footfall documents returned: ${ffs.length}`);
  if (ffs.length > 0) {
    console.log(`- Latest Footfall Record Date:`, ffs[0].date?.toDate ? ffs[0].date.toDate().toISOString().split('T')[0] : ffs[0].date);
  }

  // 6. getFootfallStats(phcId)
  console.log('\n6. Testing getFootfallStats(phcId):');
  const stats = await getFootfallStats(testPhcId, testDate);
  console.log('- Footfall stats:', stats);

  // 7. checkForDuplicateFootfall(phcId, date)
  console.log('\n7. Testing checkForDuplicateFootfall(phcId, date):');
  const dupCheck = await checkForDuplicateFootfall(testPhcId, testDate);
  console.log(`- Duplicate check for ${testDate}: Found=${!!dupCheck}, PatientCount=${dupCheck?.patient_count}`);

  // 8. forecastBedDemand(phcId)
  console.log('\n8. Testing forecastBedDemand(phcId):');
  const bedFc = await forecastBedDemand(testPhcId, 8);
  console.log('- Bed Forecast:', {
    overallStatus: bedFc.overallStatus,
    currentAvailableBeds: bedFc.currentAvailableBeds,
    forecastDays: bedFc.forecast?.length,
    earliestShortage: bedFc.earliestPredictedShortage
  });

  console.log('\n=== VERIFICATION COMPLETE ===');
}

verifyReadOnly().catch(err => console.error('Verification failed with error:', err));
