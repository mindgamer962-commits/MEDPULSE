import { getPHCs, getMedicines } from '../src/services/db.js';
import { prepareBedMigration, executeBedMigration } from '../src/services/migration.js';
import { db } from '../src/firebase.js';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

async function runSingleBedMigration() {
  console.log('=== STARTING BED MIGRATION EXECUTION ===');

  // 1. Fetch live PHCs
  const livePhcs = await getPHCs();
  console.log(`Fetched ${livePhcs.length} live PHCs.`);

  if (livePhcs.length !== 28) {
    throw new Error(`Expected exactly 28 live PHCs, found ${livePhcs.length}`);
  }

  // 2. Prepare Proposal
  const proposal = prepareBedMigration(livePhcs);
  console.log(`Proposal status: ${proposal.status}, Valid records: ${proposal.validRecords}/${proposal.totalPHCs}`);

  if (proposal.status !== 'SUCCESS') {
    throw new Error(`Migration preparation failed: ${JSON.stringify(proposal)}`);
  }

  // 3. Execute Migration EXACTLY ONCE
  console.log('Executing atomic batched write for 28 bed records...');
  const execResult = await executeBedMigration(proposal.records);
  console.log('Execution result:', execResult);

  // 4. Read-Only Post-Migration Verification
  console.log('\n=== PERFORMING POST-MIGRATION READ-ONLY VERIFICATION ===');
  const verificationRows = [];
  let allValid = true;

  for (const proposed of proposal.records) {
    const docRef = doc(db, 'beds', proposed.phc_id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      console.error(`FAIL: Missing /beds/${proposed.phc_id}`);
      allValid = false;
      verificationRows.push({
        phc_id: proposed.phc_id,
        total: proposed.total_beds,
        occupied: proposed.occupied_beds,
        available: proposed.available_beds,
        validation: 'FAILED: Missing document'
      });
      continue;
    }

    const data = snap.data();
    const docIdMatch = snap.id === data.phc_id && data.phc_id === proposed.phc_id;
    const totalValid = typeof data.total_beds === 'number' && data.total_beds === proposed.total_beds && data.total_beds >= 0;
    const occupiedValid = typeof data.occupied_beds === 'number' && data.occupied_beds === proposed.occupied_beds && data.occupied_beds >= 0 && data.occupied_beds <= data.total_beds;
    const availableValid = typeof data.available_beds === 'number' && data.available_beds === (data.total_beds - data.occupied_beds) && data.available_beds === proposed.available_beds;
    const emergencyValid = data.emergency_beds === undefined || (typeof data.emergency_beds === 'number' && data.emergency_beds >= 0 && data.emergency_beds <= data.total_beds && data.emergency_beds === proposed.emergency_beds);
    const icuValid = data.icu_beds === undefined || (typeof data.icu_beds === 'number' && data.icu_beds >= 0 && data.icu_beds <= data.total_beds && data.icu_beds === proposed.icu_beds);
    const lastUpdatedValid = !!data.last_updated && !isNaN(new Date(data.last_updated).getTime());

    const isRecordValid = docIdMatch && totalValid && occupiedValid && availableValid && emergencyValid && icuValid && lastUpdatedValid;
    if (!isRecordValid) allValid = false;

    verificationRows.push({
      phc_id: proposed.phc_id,
      total: data.total_beds,
      occupied: data.occupied_beds,
      available: data.available_beds,
      emergency: data.emergency_beds,
      icu: data.icu_beds,
      validation: isRecordValid ? 'VALID' : 'INVALID'
    });
  }

  // 5. Check PHCs & Medicines integrity
  const finalPhcs = await getPHCs();
  const finalMeds = await getMedicines();

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`Live PHCs count: ${finalPhcs.length}`);
  console.log(`Live Medicines count: ${finalMeds.length}`);
  console.log(`All 28 bed records valid: ${allValid}`);

  console.log('\n--- DETAILED BED RECORDS TABLE ---');
  for (const r of verificationRows) {
    console.log(`${r.phc_id.padEnd(20)} | total: ${String(r.total).padStart(2)} | occupied: ${String(r.occupied).padStart(2)} | available: ${String(r.available).padStart(2)} | ${r.validation}`);
  }

  console.log('\n=== MIGRATION COMPLETE ===');
}

runSingleBedMigration().catch(err => {
  console.error('Migration failed with error:', err);
  process.exit(1);
});
