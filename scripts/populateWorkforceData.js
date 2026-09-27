import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import { generatePrototypeWorkforce, validatePrototypeWorkforce } from '../src/services/workforceData.js';
import { calculateAttendanceMetrics } from '../src/services/attendanceMetrics.js';
import { calculateWorkforceRisk, WORKFORCE_STATUS } from '../src/services/workforceRisk.js';
import { findNearbyWorkforceCapacity } from '../src/services/networkWorkforce.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('Error: Firebase Project ID is missing. Check your .env file.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runWorkforcePopulation() {
  console.log('================================================================');
  console.log('DAY 9 — STEP 7C: POPULATE CONSTRUCTED PROTOTYPE WORKFORCE DATA');
  console.log('================================================================');
  console.log('PROVENANCE NOTE:');
  console.log('"These workforce and attendance values are synthetic operational data');
  console.log('used to demonstrate the MedPulse workflow. They are not official');
  console.log('government staffing or attendance records."\n');

  // 1. Fetch & Verify 28 PHCs
  console.log('STEP 1: Fetching PHCs from Firestore...');
  const phcsSnap = await getDocs(collection(db, 'phcs'));
  const phcs = phcsSnap.docs.map(d => ({ phc_id: d.id, ...d.data() }));

  if (phcs.length !== 28) {
    console.error(`FATAL: Expected 28 PHCs, found ${phcs.length}. Aborting.`);
    process.exit(1);
  }
  console.log(`✓ Verified ${phcs.length} PHCs in Firestore.`);

  // 2. Check for existing authoritative records
  console.log('STEP 2: Checking existing staff records for safety...');
  const existingStaffSnap = await getDocs(collection(db, 'staff'));
  for (const doc of existingStaffSnap.docs) {
    const data = doc.data();
    if (data.datasetType && data.datasetType !== 'CONSTRUCTED_PROTOTYPE') {
      console.error(`FATAL: Detected non-prototype staff document ${doc.id}. Aborting to protect data.`);
      process.exit(1);
    }
  }
  console.log(`✓ Safety check passed (${existingStaffSnap.size} existing prototype records found).`);

  // 3. Generate Prototype Dataset
  console.log('STEP 3: Generating deterministic prototype workforce for 28 PHCs (target: 2026-09-14)...');
  const targetDate = '2026-09-14';
  const dataset = generatePrototypeWorkforce(phcs, targetDate);
  console.log(`✓ Generated ${dataset.staff.length} staff records and ${dataset.staffAttendance.length} attendance records.`);

  // 4. Validate Dataset Integrity
  console.log('STEP 4: Validating generated records against 15 integrity constraints...');
  const validation = validatePrototypeWorkforce(dataset, phcs);
  if (!validation.isValid) {
    console.error('FATAL: Validation failed with errors:', validation.errors);
    process.exit(1);
  }
  console.log('✓ All 15 validation constraints passed with 0 errors.');

  // 5. Execute Controlled Batch Writes
  console.log('STEP 5: Executing idempotent Firestore batch write...');
  const operations = [];
  for (const s of dataset.staff) {
    operations.push({ ref: doc(db, 'staff', s.staff_id), data: s });
  }
  for (const a of dataset.staffAttendance) {
    operations.push({ ref: doc(db, 'staff_attendance', a.attendance_id), data: a });
  }
  const metaRef = doc(db, 'workforce_dataset_metadata', dataset.metadata.id);
  operations.push({ ref: metaRef, data: dataset.metadata });

  const BATCH_SIZE = 400;
  let writesCount = 0;

  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data);
      writesCount++;
    }
    await batch.commit();
    console.log(`  Committed batch chunk (${Math.min(i + BATCH_SIZE, operations.length)}/${operations.length})...`);
  }
  console.log(`✓ Successfully committed ${writesCount} documents across staff, staff_attendance, and metadata.`);

  // 6. Read-Back Verification and Calculation
  console.log('\nSTEP 6: Read-back verification across all 28 PHCs...');
  const staffReadSnap = await getDocs(collection(db, 'staff'));
  const attReadSnap = await getDocs(collection(db, 'staff_attendance'));

  const readStaff = staffReadSnap.docs.map(d => d.data());
  const readAtt = attReadSnap.docs.map(d => d.data());

  const riskCounts = { ADEQUATE: 0, AT_RISK: 0, CRITICAL: 0, INSUFFICIENT_DATA: 0 };
  const verificationTable = [];

  for (const phc of phcs) {
    const metrics = calculateAttendanceMetrics(phc.phc_id, targetDate, readStaff, readAtt);
    const risk = calculateWorkforceRisk(metrics);

    riskCounts[risk.status] = (riskCounts[risk.status] || 0) + 1;

    verificationTable.push({
      PHC: phc.name,
      'PHC ID': phc.phc_id,
      Staff: metrics.totalAssigned,
      Present: metrics.present,
      Late: metrics.late,
      Absent: metrics.absent,
      Leave: metrics.authorizedLeave,
      'Attendance %': `${metrics.attendancePercentage}%`,
      'Workforce Risk': risk.status
    });
  }

  console.table(verificationTable);

  console.log('\nRisk Distribution Summary:');
  console.log(`  ADEQUATE: ${riskCounts.ADEQUATE} PHCs`);
  console.log(`  AT_RISK:  ${riskCounts.AT_RISK} PHCs`);
  console.log(`  CRITICAL: ${riskCounts.CRITICAL} PHCs`);
  console.log(`  INSUFFICIENT_DATA: ${riskCounts.INSUFFICIENT_DATA} PHCs`);

  if (riskCounts.ADEQUATE === 0 || riskCounts.AT_RISK === 0 || riskCounts.CRITICAL === 0) {
    console.error('ERROR: Missing risk states in distribution. Must contain ADEQUATE, AT_RISK, and CRITICAL.');
    process.exit(1);
  }

  // 7. Network Workforce Intelligence Verification
  console.log('\nSTEP 7: Verifying Network Workforce Capacity on 5 sample PHCs...');
  const samplePhcIds = ['phc-adalaj', 'phc-nakra', 'phc-chinhat', 'phc-borsar', 'phc-barabanki-rural'];
  for (const phcId of samplePhcIds) {
    const netRes = await findNearbyWorkforceCapacity(phcId, {
      targetDate,
      mockPhcs: phcs,
      mockStaff: readStaff,
      mockAttendance: readAtt
    });
    console.log(`\nPHC: ${phcId} (Source Risk: ${netRes.sourceWorkforce.status}, ${netRes.sourceWorkforce.attendancePercentage}%)`);
    console.log(`  Nearest 3 PHCs:`);
    netRes.nearby.slice(0, 3).forEach(n => {
      console.log(`    - ${n.name} (${n.distance_km} km): ${n.workforceStatus} (${n.attendancePercentage}%) | Assigned: ${n.totalAssigned}, Present: ${n.present}`);
    });
  }

  console.log('\n================================================================');
  console.log('✓ DAY 9 STEP 7C WORKFORCE DATA POPULATION COMPLETE');
  console.log('================================================================');
}

runWorkforcePopulation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
