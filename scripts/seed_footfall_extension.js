import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../src/firebase.js";
import { getPHCs, getFootfallStats } from "../src/services/db.js";
import { getPHCBedAvailability } from "../src/services/beds.js";
import { calculateFederatedDemandForecast } from "../src/services/federatedForecast.js";

/**
 * Deterministic PRNG using Mulberry32 algorithm
 * Exactly matches the dry-run implementation.
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic string hash to 32-bit integer
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash >>> 0;
}

/**
 * Extract YYYY-MM-DD from Firestore record
 */
function getDocDateStr(f) {
  if (!f || !f.date) return null;
  if (f.date.toDate) return f.date.toDate().toISOString().split("T")[0];
  if (f.date instanceof Date) return f.date.toISOString().split("T")[0];
  return String(f.date).split("T")[0];
}

async function runSeed() {
  console.log("================================================================================");
  console.log("DAY 17 — FOOTFALL COVERAGE EXTENSION: ACTUAL FIRESTORE SEED");
  console.log("================================================================================\n");

  // 1. Fetch Existing Firestore Data
  const phcs = await getPHCs();
  const colRef = collection(db, "daily_footfall");
  const ffSnap = await getDocs(colRef);
  const existingFootfall = ffSnap.docs.map((d) => d.data());

  const initialCount = existingFootfall.length;
  console.log(`✓ Fetched ${phcs.length} PHCs.`);
  console.log(`✓ Initial daily_footfall count: ${initialCount} (Target post-seed: ${initialCount + 739})\n`);

  const existingKeySet = new Set();
  existingFootfall.forEach((f) => {
    const d = getDocDateStr(f);
    if (d && f.phc_id) {
      existingKeySet.add(`${f.phc_id}_${d}`);
    }
  });

  const TARGET_END_DATE = "2026-09-20";
  const recordsToInsert = [];

  const dowMultipliers = {
    0: 0.85, // Sunday
    1: 1.10, // Monday
    2: 1.05, // Tuesday
    3: 1.00, // Wednesday
    4: 1.00, // Thursday
    5: 1.05, // Friday
    6: 0.95  // Saturday
  };

  for (const phc of phcs) {
    const phcId = phc.phc_id;
    const phcRecords = existingFootfall.filter((f) => f.phc_id === phcId);
    const existingDates = phcRecords.map(getDocDateStr).filter(Boolean).sort();

    const startDateStr = existingDates[0] || "2026-06-24";

    const counts = phcRecords.map((f) => f.patient_count).filter((c) => typeof c === "number" && c >= 0);
    const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 40;
    const minVal = Math.min(...counts);
    const maxVal = Math.max(...counts);
    const variance = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance) || 4.0;

    let curDate = new Date(startDateStr);
    const endDate = new Date(TARGET_END_DATE);

    while (curDate <= endDate) {
      const dateStr = curDate.toISOString().split("T")[0];
      const key = `${phcId}_${dateStr}`;

      if (!existingKeySet.has(key)) {
        // Deterministic generation matching dry run
        const seedStr = `${phcId}_${dateStr}_MEDPULSE_DAY17_CONSTRUCTED`;
        const seedVal = hashString(seedStr);
        const rng = mulberry32(seedVal);

        const u1 = Math.max(1e-6, rng());
        const u2 = rng();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        const dow = curDate.getUTCDay();
        const multiplier = dowMultipliers[dow] ?? 1.0;

        let syntheticCount = Math.round((mean + z * stdDev * 0.6) * multiplier);
        const safeMin = Math.max(5, minVal);
        const safeMax = Math.min(500, maxVal);
        syntheticCount = Math.max(safeMin, Math.min(safeMax, syntheticCount));

        const record = {
          footfall_id: `ff_${phcId}_${dateStr}`,
          phc_id: phcId,
          date: new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth(), curDate.getUTCDate())),
          patient_count: syntheticCount,
          is_constructed_prototype: true,
          data_provenance: "CONSTRUCTED_PROTOTYPE",
          provenance_note: "Constructed prototype operational data for Day 17 evaluation continuity. Not real patient data.",
          created_at: new Date()
        };

        recordsToInsert.push(record);
        existingKeySet.add(key); // prevent intra-run duplicate
      }

      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }
  }

  console.log(`✓ Prepared ${recordsToInsert.length} unique records to insert.`);
  if (recordsToInsert.length !== 739) {
    throw new Error(`Safety Check Failed: Expected exactly 739 records, got ${recordsToInsert.length}. Aborting.`);
  }

  // 2. Commit in Batches (Firestore max batch size = 500)
  const BATCH_SIZE = 400;
  let insertedCount = 0;

  for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
    const chunk = recordsToInsert.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const rec of chunk) {
      const docRef = doc(db, "daily_footfall", rec.footfall_id);
      batch.set(docRef, rec);
    }

    await batch.commit();
    insertedCount += chunk.length;
    console.log(`  - Committed batch of ${chunk.length} records (${insertedCount}/${recordsToInsert.length})...`);
  }

  console.log(`\n✓ All ${insertedCount} records committed to Firestore.\n`);

  // 3. Post-Seed Verification
  console.log("--------------------------------------------------------------------------------");
  console.log("POST-SEED DATABASE VERIFICATION");
  console.log("--------------------------------------------------------------------------------");

  const postSnap = await getDocs(collection(db, "daily_footfall"));
  const allPostRecords = postSnap.docs.map((d) => d.data());
  const finalCount = allPostRecords.length;

  console.log(`✓ Total post-seed daily_footfall count: ${finalCount}`);
  console.log(`✓ Expected count: ${initialCount} + ${insertedCount} = ${initialCount + insertedCount}`);
  
  if (finalCount !== initialCount + insertedCount) {
    throw new Error(`Verification Failed: Expected ${initialCount + insertedCount}, got ${finalCount}.`);
  }

  // Check for any duplicate PHC + date pairs
  const seenKeys = new Set();
  let duplicateCount = 0;
  allPostRecords.forEach((f) => {
    const dStr = getDocDateStr(f);
    const key = `${f.phc_id}_${dStr}`;
    if (seenKeys.has(key)) {
      duplicateCount++;
    } else {
      seenKeys.add(key);
    }
  });

  console.log(`✓ Duplicate PHC/date pairs in database: ${duplicateCount} (Expected: 0)`);
  if (duplicateCount > 0) {
    throw new Error(`Verification Failed: Found ${duplicateCount} duplicate records.`);
  }

  // 4. Live Verification of All 28 PHCs for Sep 14 and Sep 20
  console.log("\n--------------------------------------------------------------------------------");
  console.log("LIVE 28-PHC SIGNAL EVALUATION ON FIRESTORE DATA");
  console.log("--------------------------------------------------------------------------------\n");

  const evaluationResults = [];

  for (const phc of phcs) {
    const phcId = phc.phc_id;
    const bedData = await getPHCBedAvailability(phcId);
    let occRate = 0.5;
    if (bedData && bedData.data_available && bedData.beds) {
      const total = bedData.beds.total_beds;
      const occ = bedData.beds.occupied_beds;
      if (typeof total === "number" && total > 0 && typeof occ === "number") {
        occRate = parseFloat((occ / total).toFixed(4));
      }
    }

    // 2026-09-14
    const stats14 = await getFootfallStats(phcId, "2026-09-14");
    let trendRatio14 = stats14.trendRatio ?? null;
    if (!trendRatio14 && typeof stats14.last7DaysAvg === "number" && typeof stats14.prev7DaysAvg === "number" && stats14.prev7DaysAvg > 0) {
      trendRatio14 = parseFloat((stats14.last7DaysAvg / stats14.prev7DaysAvg).toFixed(4));
    }
    const fed14 = calculateFederatedDemandForecast({
      targetDate: "2026-09-14",
      recentFootfallAvg: typeof stats14.last7DaysAvg === "number" ? stats14.last7DaysAvg : null,
      footfallTrendRatio: trendRatio14,
      currentOccupancyRate: occRate,
      seasonalFactor: 1.0
    });

    // 2026-09-20
    const stats20 = await getFootfallStats(phcId, "2026-09-20");
    let trendRatio20 = stats20.trendRatio ?? null;
    if (!trendRatio20 && typeof stats20.last7DaysAvg === "number" && typeof stats20.prev7DaysAvg === "number" && stats20.prev7DaysAvg > 0) {
      trendRatio20 = parseFloat((stats20.last7DaysAvg / stats20.prev7DaysAvg).toFixed(4));
    }
    const fed20 = calculateFederatedDemandForecast({
      targetDate: "2026-09-20",
      recentFootfallAvg: typeof stats20.last7DaysAvg === "number" ? stats20.last7DaysAvg : null,
      footfallTrendRatio: trendRatio20,
      currentOccupancyRate: occRate,
      seasonalFactor: 1.0
    });

    evaluationResults.push({
      phcId,
      name: phc.name,
      sep14RecentAvg: stats14.last7DaysAvg,
      sep14TrendRatio: trendRatio14,
      sep14Status: fed14.dataStatus,
      sep14Forecast: fed14.forecastDemand ? parseFloat(fed14.forecastDemand.toFixed(2)) : null,
      sep20RecentAvg: stats20.last7DaysAvg,
      sep20TrendRatio: trendRatio20,
      sep20Status: fed20.dataStatus,
      sep20Forecast: fed20.forecastDemand ? parseFloat(fed20.forecastDemand.toFixed(2)) : null
    });
  }

  console.table(evaluationResults);

  const all14Available = evaluationResults.every((r) => r.sep14Status === "AVAILABLE");
  const all20Available = evaluationResults.every((r) => r.sep20Status === "AVAILABLE");

  console.log("\n================================================================================");
  console.log("FINAL POST-SEED VERIFICATION REPORT:");
  console.log(`- Initial Records: ${initialCount}`);
  console.log(`- Inserted Records: ${insertedCount}`);
  console.log(`- Final Total Records: ${finalCount}`);
  console.log(`- Duplicates: 0`);
  console.log(`- 2026-09-14 Availability: ${all14Available ? "28/28 AVAILABLE (100%)" : "FAILED"}`);
  console.log(`- 2026-09-20 Availability: ${all20Available ? "28/28 AVAILABLE (100%)" : "FAILED"}`);
  console.log("================================================================================\n");

  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Seed execution error:", err);
  process.exit(1);
});
