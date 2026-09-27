import { 
  getPHCs, 
  getMedicines, 
  forecastDemand, 
  predictStockOut, 
  getFilteredStockTransactions, 
  getInventory, 
  getDailyFootfall, 
  getFootfallStats, 
  findSurplusPHCs,
  calculateTransferRecommendation,
  calculateTransportEstimate
} from '../src/services/db.js';
import { getPHCBedAvailability, calculateBedStatus } from '../src/services/beds.js';
import { forecastBedDemand } from '../src/services/bedForecast.js';
import { getFacilityUnifiedRisk } from '../src/services/unifiedFacilityRisk.js';
import { getStaffRecords, getAttendanceRecords } from '../src/services/workforceDb.js';
import { getWorkforceRisk } from '../src/services/workforceRisk.js';
import { findNearbyWorkforceCapacity } from '../src/services/networkWorkforce.js';

async function verifyAllModules() {
  console.log('=== 1. BED CAPACITY READ VERIFICATION ===');
  const targetPhcs = ['phc-achrol', 'phc-adalaj', 'phc-koth', 'phc-kuha', 'phc-sanathal'];
  for (const phcId of targetPhcs) {
    const res = await getPHCBedAvailability(phcId);
    console.log(`${phcId}: Available=${res.data_available} | Total=${res.beds?.total_beds} | Occupied=${res.beds?.occupied_beds} | Avail=${res.beds?.available_beds} | Emergency=${res.beds?.emergency_beds} | ICU=${res.beds?.icu_beds} | Status=${calculateBedStatus(res.beds).status}`);
  }

  console.log('\n=== 2. BED FORECAST VERIFICATION ===');
  for (const phcId of ['phc-achrol', 'phc-adalaj', 'phc-kuha']) {
    const fc = await forecastBedDemand(phcId, 8);
    console.log(`${phcId}: Status=${fc.overallStatus} | AvailBeds=${fc.currentAvailableBeds} | ForecastCount=${fc.forecast?.length} | Shortage=${fc.earliestPredictedShortage}`);
  }

  console.log('\n=== 3. OVERVIEW / UNIFIED RISK VERIFICATION ===');
  for (const phcId of ['phc-adalaj', 'phc-koth']) {
    const meds = await getMedicines();
    const medPredictions = await Promise.all(meds.map(m => predictStockOut(phcId, m.medicine_id)));
    const unified = await getFacilityUnifiedRisk(phcId, {
      targetDate: '2026-09-14',
      admissionRate: 8,
      medicineResults: medPredictions
    });
    console.log(`${phcId}: OverallRisk=${unified.overallRisk} | Drivers=${unified.riskDrivers.join(', ')} | MedRisk=${unified.medicine.risk} | BedRisk=${unified.beds.risk} | StaffRisk=${unified.personnel.risk}`);
  }

  console.log('\n=== 4. INVENTORY VERIFICATION ===');
  const inv = await getInventory('phc-adalaj');
  console.log(`phc-adalaj Inventory (${inv.length} meds):`);
  inv.forEach(i => console.log(`  - ${i.name.padEnd(14)}: CurrentStock=${String(i.currentStock).padStart(5)} | TotalRecv=${String(i.totalReceived).padStart(5)} | TotalUsed=${String(i.totalUsed).padStart(5)}`));

  console.log('\n=== 5. NETWORK / TRANSFER VERIFICATION ===');
  const surplus = await findSurplusPHCs('phc-nakra', 'med-ors');
  console.log(`Surplus candidates for phc-nakra ORS: count=${surplus.length}`);
  if (surplus.length > 0) {
    console.log(`Top candidate: ${surplus[0].sourcePhc} | SafeSurplus=${surplus[0].safeSurplus} | Class=${surplus[0].classification}`);
  }

  console.log('\n=== 6. PERSONNEL / WORKFORCE VERIFICATION ===');
  const staff = await getStaffRecords('phc-adalaj');
  const attendance = await getAttendanceRecords('2026-09-14', 'phc-adalaj');
  const wfRisk = getWorkforceRisk('phc-adalaj', '2026-09-14', staff, attendance);
  console.log(`phc-adalaj Staff: total=${staff.length} | attendanceCount=${attendance.length} | workforceRisk=${wfRisk.status}`);

  console.log('\n=== END OF VERIFICATION ===');
}

verifyAllModules().catch(err => {
  console.error('Verification failed:', err);
});
