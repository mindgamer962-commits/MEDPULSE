import { collection, getDocs } from "firebase/firestore";
import { db } from "../src/firebase.js";
import { getPHCs } from "../src/services/db.js";
import { getPHCBedAvailability } from "../src/services/beds.js";
import { calculateFederatedDemandForecast, extractFederatedFeatures } from "../src/services/federatedForecast.js";

/**
 * Deterministic PRNG using Mulberry32 algorithm
 * @param {number} seed 
 * @returns {() => number} Returns float in [0, 1)
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
 * @param {string} str 
 * @returns {number}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
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

/**
 * Calculate trailing windows relative to reference date
 */
function getWindows(refDateStr) {
  const parts = refDateStr.split("T")[0].split("-").map(Number);
  const refDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(refDate.getTime());
    d.setUTCDate(refDate.getUTCDate() - i);
    recentDays.push(d.toISOString().split("T")[0]);
  }
  const prevDays = [];
  for (let i = 7; i < 14; i++) {
    const d = new Date(refDate.getTime());
    d.setUTCDate(refDate.getUTCDate() - i);
    prevDays.push(d.toISOString().split("T")[0]);
  }
  return { recentDays, prevDays };
}

/**
 * In-memory Footfall stats calculator
 */
function computeFootfallStatsInMemory(allRecords, phcId, refDateStr) {
  const phcRecords = allRecords.filter((f) => f.phc_id === phcId);
  const { recentDays, prevDays } = getWindows(refDateStr);

  const recentRecords = phcRecords.filter((f) => {
    const dStr = getDocDateStr(f);
    return dStr && recentDays.includes(dStr);
  });
  const prevRecords = phcRecords.filter((f) => {
    const dStr = getDocDateStr(f);
    return dStr && prevDays.includes(dStr);
  });

  let last7DaysAvg = "Insufficient data";
  let prev7DaysAvg = "Insufficient data";

  if (recentRecords.length > 0) {
    const sum = recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0);
    last7DaysAvg = parseFloat((sum / recentRecords.length).toFixed(1));
  }
  if (prevRecords.length > 0) {
    const sum = prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0);
    prev7DaysAvg = parseFloat((sum / prevRecords.length).toFixed(1));
  }

  let trendRatio = null;
  if (typeof last7DaysAvg === "number" && typeof prev7DaysAvg === "number" && prev7DaysAvg > 0) {
    trendRatio = parseFloat((last7DaysAvg / prev7DaysAvg).toFixed(4));
  }

  return { last7DaysAvg, prev7DaysAvg, trendRatio, recentCount: recentRecords.length, prevCount: prevRecords.length };
}

async function runDryRun() {
  console.log("================================================================================");
  console.log("DAY 17 — FOOTFALL COVERAGE EXTENSION DRY RUN (READ-ONLY SIMULATION)");
  console.log("================================================================================\n");

  // 1. Fetch Existing Firestore Records
  const phcs = await getPHCs();
  const ffSnap = await getDocs(collection(db, "daily_footfall"));
  const existingFootfall = ffSnap.docs.map((d) => d.data());

  console.log(`✓ Fetched ${phcs.length} PHCs from Firestore.`);
  console.log(`✓ Fetched ${existingFootfall.length} existing daily_footfall records.\n`);

  const TARGET_END_DATE = "2026-09-20";
  const candidateRecords = [];
  const perPhcSummary = [];

  // Day-of-week multipliers to preserve realistic clinic rhythm
  const dowMultipliers = {
    0: 0.85, // Sunday
    1: 1.10, // Monday (peak)
    2: 1.05, // Tuesday
    3: 1.00, // Wednesday
    4: 1.00, // Thursday
    5: 1.05, // Friday
    6: 0.95  // Saturday
  };

  for (const phc of phcs) {
    const phcId = phc.phc_id;
    const phcRecords = existingFootfall.filter((f) => f.phc_id === phcId);
    const existingDateMap = new Map();
    phcRecords.forEach((f) => {
      const d = getDocDateStr(f);
      if (d) existingDateMap.set(d, f);
    });

    const existingDates = [...existingDateMap.keys()].sort();
    const startDateStr = existingDates[0] || "2026-06-24";
    const latestExistingDate = existingDates[existingDates.length - 1] || "NONE";

    // Baseline stats
    const counts = phcRecords.map((f) => f.patient_count).filter((c) => typeof c === "number" && c >= 0);
    const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 40;
    const minVal = Math.min(...counts);
    const maxVal = Math.max(...counts);
    const variance = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance) || 4.0;

    let generatedForPhc = 0;
    let curDate = new Date(startDateStr);
    const endDate = new Date(TARGET_END_DATE);

    while (curDate <= endDate) {
      const dateStr = curDate.toISOString().split("T")[0];

      // SAFETY CHECK: NEVER OVERWRITE EXISTING
      if (!existingDateMap.has(dateStr)) {
        // Deterministic generation
        const seedStr = `${phcId}_${dateStr}_MEDPULSE_DAY17_CONSTRUCTED`;
        const seedVal = hashString(seedStr);
        const rng = mulberry32(seedVal);

        // Box-Muller transform for normal distribution
        const u1 = Math.max(1e-6, rng());
        const u2 = rng();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        const dow = curDate.getUTCDay();
        const multiplier = dowMultipliers[dow] ?? 1.0;

        let syntheticCount = Math.round((mean + z * stdDev * 0.6) * multiplier);
        // Clamp strictly within historical range (or safe fallback)
        const safeMin = Math.max(5, minVal);
        const safeMax = Math.min(500, maxVal);
        syntheticCount = Math.max(safeMin, Math.min(safeMax, syntheticCount));

        const record = {
          footfall_id: `ff_${phcId}_${dateStr}`,
          phc_id: phcId,
          date: new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth(), curDate.getUTCDate())),
          dateStr: dateStr,
          patient_count: syntheticCount,
          is_constructed_prototype: true,
          data_provenance: "CONSTRUCTED_PROTOTYPE",
          provenance_note: "Constructed prototype operational data for Day 17 evaluation continuity. Not real patient data.",
          created_at: new Date()
        };

        candidateRecords.push(record);
        generatedForPhc++;
      }

      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    perPhcSummary.push({
      phcId,
      name: phc.name,
      latestExistingDate,
      existingCount: phcRecords.length,
      candidateCount: generatedForPhc,
      histMean: Math.round(mean),
      histRange: `${minVal}-${maxVal}`
    });
  }

  console.log("--------------------------------------------------------------------------------");
  console.log("1. DRY RUN CANDIDATE SUMMARY");
  console.log("--------------------------------------------------------------------------------");
  console.table(perPhcSummary);

  console.log(`\nTOTAL CANDIDATE RECORDS GENERATED IN DRY RUN: ${candidateRecords.length}`);
  console.log(`CONFIRMATION: ZERO FIRESTORE WRITES EXECUTED.\n`);

  // 2. Candidate Record Verification
  console.log("--------------------------------------------------------------------------------");
  console.log("2. CANDIDATE RECORDS INTEGRITY & PROVENANCE SAMPLE (FIRST 10 & LAST 10)");
  console.log("--------------------------------------------------------------------------------");
  const sample = [...candidateRecords.slice(0, 10), ...candidateRecords.slice(-10)];
  console.table(
    sample.map((r) => ({
      footfall_id: r.footfall_id,
      phc_id: r.phc_id,
      date: r.dateStr,
      patient_count: r.patient_count,
      is_constructed_prototype: r.is_constructed_prototype,
      data_provenance: r.data_provenance
    }))
  );

  // 3. Simulated In-Memory Evaluation
  console.log("\n--------------------------------------------------------------------------------");
  console.log("3. HYPOTHETICAL POST-SEEDING VALIDATION (TARGET DATES: 2026-09-14 & 2026-09-20)");
  console.log("--------------------------------------------------------------------------------\n");

  const combinedRecords = [...existingFootfall, ...candidateRecords];

  const validationResults = [];

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

    // Evaluate on 2026-09-14
    const stats14 = computeFootfallStatsInMemory(combinedRecords, phcId, "2026-09-14");
    const fed14 = calculateFederatedDemandForecast({
      targetDate: "2026-09-14",
      recentFootfallAvg: typeof stats14.last7DaysAvg === "number" ? stats14.last7DaysAvg : null,
      footfallTrendRatio: stats14.trendRatio,
      currentOccupancyRate: occRate,
      seasonalFactor: 1.0
    });

    // Evaluate on 2026-09-20
    const stats20 = computeFootfallStatsInMemory(combinedRecords, phcId, "2026-09-20");
    const fed20 = calculateFederatedDemandForecast({
      targetDate: "2026-09-20",
      recentFootfallAvg: typeof stats20.last7DaysAvg === "number" ? stats20.last7DaysAvg : null,
      footfallTrendRatio: stats20.trendRatio,
      currentOccupancyRate: occRate,
      seasonalFactor: 1.0
    });

    validationResults.push({
      phcId,
      name: phc.name,
      sep14RecentAvg: stats14.last7DaysAvg,
      sep14TrendRatio: stats14.trendRatio,
      sep14Status: fed14.dataStatus,
      sep14Forecast: fed14.forecastDemand ? parseFloat(fed14.forecastDemand.toFixed(2)) : null,
      sep20RecentAvg: stats20.last7DaysAvg,
      sep20TrendRatio: stats20.trendRatio,
      sep20Status: fed20.dataStatus,
      sep20Forecast: fed20.forecastDemand ? parseFloat(fed20.forecastDemand.toFixed(2)) : null
    });
  }

  console.table(validationResults);

  const allAvailable14 = validationResults.every((r) => r.sep14Status === "AVAILABLE");
  const allAvailable20 = validationResults.every((r) => r.sep20Status === "AVAILABLE");

  console.log("\n================================================================================");
  console.log("FINAL DRY RUN AUDIT VERDICT:");
  console.log(`- 2026-09-14: All 28 PHCs AVAILABLE? ${allAvailable14 ? "YES (28/28)" : "NO"}`);
  console.log(`- 2026-09-20: All 28 PHCs AVAILABLE? ${allAvailable20 ? "YES (28/28)" : "NO"}`);
  console.log(`- Total Candidate Records: ${candidateRecords.length}`);
  console.log(`- Firestore Writes Executed: 0 (ZERO)`);
  console.log("================================================================================\n");

  process.exit(0);
}

runDryRun().catch((err) => {
  console.error("Dry run error:", err);
  process.exit(1);
});
