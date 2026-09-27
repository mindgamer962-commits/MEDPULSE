import 'dotenv/config';
import { db } from '../src/firebase.js';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { prepareBedMigration, EXPECTED_PHC_CONFIGS } from '../src/services/migration.js';

async function runVerification() {
  console.log('--- STARTING VERIFICATION ---');
  try {
    const bedsRef = collection(db, 'beds');
    const snapshot = await getDocs(bedsRef);
    
    const liveRecords = [];
    snapshot.forEach(doc => {
      liveRecords.push({ id: doc.id, ...doc.data() });
    });

    // 1. Expected vs Found
    const expectedIds = Object.keys(EXPECTED_PHC_CONFIGS);
    const foundIds = liveRecords.map(r => r.id);
    
    const missing = expectedIds.filter(id => !foundIds.includes(id));
    const unexpected = foundIds.filter(id => !expectedIds.includes(id));
    
    console.log(JSON.stringify({
      type: 'AUDIT',
      expected: expectedIds.length,
      found: liveRecords.length,
      missing: missing.length,
      missingIds: missing,
      unexpected: unexpected.length,
      unexpectedIds: unexpected
    }));

    // 2. Exact Match
    let matching = 0;
    let mismatched = 0;
    let totalBeds = 0;
    let totalOccupied = 0;
    let totalAvailable = 0;
    let totalEmergency = 0;
    let totalIcu = 0;
    
    let safe = 0;
    let atRisk = 0;
    let critical = 0;

    for (const record of liveRecords) {
      const expected = EXPECTED_PHC_CONFIGS[record.id];
      if (!expected) continue;

      const calcAvailable = record.total_beds - record.occupied_beds;
      const isMatch = 
        record.total_beds === expected.total_beds &&
        record.emergency_beds === expected.emergency_beds &&
        record.icu_beds === expected.icu_beds &&
        record.occupied_beds === expected.occupied_beds &&
        record.available_beds === calcAvailable &&
        record.occupied_beds >= 0 && record.occupied_beds <= record.total_beds &&
        record.emergency_beds >= 0 && record.emergency_beds <= record.total_beds &&
        record.icu_beds >= 0 && record.icu_beds <= record.total_beds;

      if (isMatch) {
        matching++;
      } else {
        mismatched++;
        console.error('MISMATCH', record.id, record, expected);
      }

      totalBeds += record.total_beds;
      totalOccupied += record.occupied_beds;
      totalAvailable += record.available_beds;
      totalEmergency += record.emergency_beds;
      totalIcu += record.icu_beds;

      // Calculate status
      const occupancyRate = record.occupied_beds / record.total_beds;
      if (occupancyRate >= 0.9) critical++;
      else if (occupancyRate >= 0.7) atRisk++;
      else safe++;
    }

    console.log(JSON.stringify({
      type: 'MATCH',
      checked: expectedIds.length,
      matching,
      mismatched
    }));

    console.log(JSON.stringify({
      type: 'AGGREGATE',
      totalBeds,
      totalOccupied,
      totalAvailable,
      totalEmergency,
      totalIcu,
      safe,
      atRisk,
      critical
    }));
    
    process.exit(0);

  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  }
}

runVerification();
