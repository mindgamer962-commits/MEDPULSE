import { validateBedCapacity } from "./db.js";
import { calculateBedStatus } from "./beds.js";

export const EXPECTED_PHC_CONFIGS = {
  "phc-koth": { total_beds: 20, emergency_beds: 4, icu_beds: 0, occupied_beds: 11 },
  "phc-sanathal": { total_beds: 24, emergency_beds: 4, icu_beds: 0, occupied_beds: 19 },
  "phc-kuha": { total_beds: 30, emergency_beds: 6, icu_beds: 2, occupied_beds: 28 },
  "phc-vataman": { total_beds: 18, emergency_beds: 3, icu_beds: 0, occupied_beds: 8 },
  "phc-mokhasan": { total_beds: 22, emergency_beds: 4, icu_beds: 0, occupied_beds: 16 },
  "phc-adalaj": { total_beds: 30, emergency_beds: 6, icu_beds: 2, occupied_beds: 18 },
  "phc-alipore": { total_beds: 24, emergency_beds: 4, icu_beds: 0, occupied_beds: 13 },
  "phc-gadat": { total_beds: 18, emergency_beds: 3, icu_beds: 0, occupied_beds: 16 },
  "phc-hond": { total_beds: 20, emergency_beds: 4, icu_beds: 0, occupied_beds: 18 },
  "phc-koyali": { total_beds: 26, emergency_beds: 5, icu_beds: 1, occupied_beds: 14 },
  "phc-nakra": { total_beds: 16, emergency_beds: 3, icu_beds: 0, occupied_beds: 13 },
  "phc-kevdra": { total_beds: 18, emergency_beds: 3, icu_beds: 0, occupied_beds: 7 },
  "phc-mojidad": { total_beds: 22, emergency_beds: 4, icu_beds: 0, occupied_beds: 20 },
  "phc-nimgaon": { total_beds: 24, emergency_beds: 4, icu_beds: 0, occupied_beds: 15 },
  "phc-kumathe": { total_beds: 20, emergency_beds: 4, icu_beds: 0, occupied_beds: 17 },
  "phc-jamsar": { total_beds: 26, emergency_beds: 5, icu_beds: 1, occupied_beds: 14 },
  "phc-kaman": { total_beds: 28, emergency_beds: 5, icu_beds: 1, occupied_beds: 26 },
  "phc-borsar": { total_beds: 22, emergency_beds: 4, icu_beds: 0, occupied_beds: 11 },
  "phc-bhankrota": { total_beds: 30, emergency_beds: 6, icu_beds: 2, occupied_beds: 28 },
  "phc-achrol": { total_beds: 24, emergency_beds: 4, icu_beds: 0, occupied_beds: 10 },
  "phc-boraj": { total_beds: 28, emergency_beds: 5, icu_beds: 1, occupied_beds: 20 },
  "phc-mandore": { total_beds: 26, emergency_beds: 5, icu_beds: 1, occupied_beds: 16 },
  "phc-netra": { total_beds: 20, emergency_beds: 4, icu_beds: 0, occupied_beds: 15 },
  "phc-chinhat": { total_beds: 30, emergency_beds: 6, icu_beds: 2, occupied_beds: 18 },
  "phc-mohanlalganj": { total_beds: 28, emergency_beds: 5, icu_beds: 1, occupied_beds: 23 },
  "phc-kakori": { total_beds: 22, emergency_beds: 4, icu_beds: 0, occupied_beds: 20 },
  "phc-malihabad": { total_beds: 24, emergency_beds: 4, icu_beds: 0, occupied_beds: 13 },
  "phc-barabanki-rural": { total_beds: 30, emergency_beds: 6, icu_beds: 2, occupied_beds: 25 }
};

/**
 * Prepares the bed migration dry-run. NO FIRESTORE WRITES.
 * @param {Array} livePhcs - The array of PHC objects fetched from Firestore
 * @returns {Object} Dry-run report
 */
export function prepareBedMigration(livePhcs) {
  const EXPECTED_COUNT = 28;
  const expectedIds = Object.keys(EXPECTED_PHC_CONFIGS);
  
  if (!livePhcs || !Array.isArray(livePhcs)) {
    return {
      status: "FAILED",
      expectedPHCs: EXPECTED_COUNT,
      actualPHCs: 0,
      missingPHCs: expectedIds,
      unexpectedPHCs: [],
      duplicatePHCs: [],
      records: []
    };
  }

  const liveIds = livePhcs.map(p => p.phc_id).filter(Boolean);
  const actualCount = liveIds.length;
  
  // Find duplicates
  const seen = new Set();
  const duplicatePHCs = [];
  for (const id of liveIds) {
    if (seen.has(id)) {
      duplicatePHCs.push(id);
    }
    seen.add(id);
  }

  // Find missing
  const missingPHCs = expectedIds.filter(id => !seen.has(id));
  
  // Find unexpected
  const expectedSet = new Set(expectedIds);
  const unexpectedPHCs = Array.from(seen).filter(id => !expectedSet.has(id));

  if (
    actualCount !== EXPECTED_COUNT ||
    missingPHCs.length > 0 ||
    unexpectedPHCs.length > 0 ||
    duplicatePHCs.length > 0
  ) {
    return {
      status: "FAILED",
      expectedPHCs: EXPECTED_COUNT,
      actualPHCs: actualCount,
      missingPHCs,
      unexpectedPHCs,
      duplicatePHCs,
      records: []
    };
  }

  // Generate proposed records
  const proposedRecords = [];
  let validCount = 0;
  let invalidCount = 0;

  let totalBeds = 0;
  let totalOccupied = 0;
  let totalAvailable = 0;
  let totalEmergency = 0;
  let totalIcu = 0;
  let safeCount = 0;
  let atRiskCount = 0;
  let criticalCount = 0;

  for (const phc of livePhcs) {
    const config = EXPECTED_PHC_CONFIGS[phc.phc_id];
    const available_beds = config.total_beds - config.occupied_beds;
    
    const record = {
      phc_id: phc.phc_id,
      total_beds: config.total_beds,
      occupied_beds: config.occupied_beds,
      available_beds,
      emergency_beds: config.emergency_beds,
      icu_beds: config.icu_beds,
      last_updated: new Date().toISOString() // Deterministic string for dry run display
    };

    const validation = validateBedCapacity(record);
    const isValid = validation.valid;

    if (isValid) {
      validCount++;
      totalBeds += record.total_beds;
      totalOccupied += record.occupied_beds;
      totalAvailable += record.available_beds;
      totalEmergency += record.emergency_beds;
      totalIcu += record.icu_beds;

      const statusObj = calculateBedStatus(record);
      if (statusObj.status === "SAFE") safeCount++;
      else if (statusObj.status === "AT_RISK") atRiskCount++;
      else if (statusObj.status === "CRITICAL") criticalCount++;
    } else {
      invalidCount++;
    }

    proposedRecords.push({
      ...record,
      phc_name: phc.name,
      isValid,
      validationError: validation.error || null,
      status: isValid ? calculateBedStatus(record).status : "INVALID"
    });
  }

  // Final check: if any records are invalid, migration itself should fail validation
  if (invalidCount > 0) {
    return {
      status: "FAILED",
      expectedPHCs: EXPECTED_COUNT,
      actualPHCs: actualCount,
      missingPHCs,
      unexpectedPHCs,
      duplicatePHCs,
      invalidRecords: invalidCount,
      records: proposedRecords
    };
  }

  return {
    status: "SUCCESS",
    totalPHCs: EXPECTED_COUNT,
    proposedRecords: proposedRecords.length,
    validRecords: validCount,
    invalidRecords: invalidCount,
    records: proposedRecords,
    summary: {
      total_beds: totalBeds,
      total_occupied_beds: totalOccupied,
      total_available_beds: totalAvailable,
      total_emergency_beds: totalEmergency,
      total_icu_beds: totalIcu,
      safe_count: safeCount,
      at_risk_count: atRiskCount,
      critical_count: criticalCount,
      invalid_count: invalidCount
    }
  };
}

import { writeBatch as fbWriteBatch, doc as fbDoc, getDoc as fbGetDoc } from "firebase/firestore";
import { db as defaultDb } from "../firebase.js";

/**
 * Validates and executes an atomic batched write for the migration.
 */
export async function executeBedMigration(proposedRecords, dbInstance = defaultDb, deps = { writeBatch: fbWriteBatch, doc: fbDoc }) {
  if (!proposedRecords || proposedRecords.length !== 28) {
    throw new Error("Migration execution failed: Proposed records count must be exactly 28.");
  }

  // Pre-write validation
  for (const record of proposedRecords) {
    if (!record.phc_id) throw new Error("Migration execution failed: Missing phc_id in a record.");
    const validation = validateBedCapacity(record);
    if (!validation.valid) {
      throw new Error(`Migration execution failed: Invalid bed capacity data for ${record.phc_id}.`);
    }
    if (record.occupied_beds > record.total_beds || record.available_beds !== (record.total_beds - record.occupied_beds)) {
      throw new Error(`Migration execution failed: Mathematical inconsistency for ${record.phc_id}.`);
    }
  }

  // Atomic batch write
  const batch = deps.writeBatch(dbInstance);
  proposedRecords.forEach(record => {
    const docRef = deps.doc(dbInstance, "beds", record.phc_id);
    const writeData = {
      phc_id: record.phc_id,
      total_beds: record.total_beds,
      occupied_beds: record.occupied_beds,
      available_beds: record.available_beds,
      emergency_beds: record.emergency_beds,
      icu_beds: record.icu_beds,
      last_updated: record.last_updated
    };
    batch.set(docRef, writeData);
  });

  try {
    await batch.commit();
    return {
      status: "SUCCESS",
      writtenRecords: 28,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Migration atomic batch commit failed: ${error.message}`);
  }
}

/**
 * Performs a read-back verification against the exact approved proposal.
 */
export async function verifyBedMigration(proposedRecords, dbInstance = defaultDb, deps = { doc: fbDoc, getDoc: fbGetDoc }) {
  if (!proposedRecords || proposedRecords.length !== 28) {
    return { status: "FAILED", reason: "Invalid proposal array length." };
  }

  const results = {
    status: "VERIFIED",
    expectedRecords: 28,
    foundRecords: 0,
    matchingRecords: 0,
    mismatchedRecords: 0,
    missingRecords: 0,
    records: []
  };

  for (const proposed of proposedRecords) {
    const docRef = deps.doc(dbInstance, "beds", proposed.phc_id);
    const docSnap = await deps.getDoc(docRef);

    if (!docSnap.exists()) {
      results.missingRecords++;
      results.status = "FAILED_MISSING_RECORD";
      results.records.push({ phc_id: proposed.phc_id, match: false, reason: "Missing in Firestore" });
      continue;
    }

    results.foundRecords++;
    const data = docSnap.data();

    const matches = (
      data.phc_id === proposed.phc_id &&
      data.total_beds === proposed.total_beds &&
      data.occupied_beds === proposed.occupied_beds &&
      data.available_beds === proposed.available_beds &&
      data.emergency_beds === proposed.emergency_beds &&
      data.icu_beds === proposed.icu_beds
    );

    if (matches) {
      results.matchingRecords++;
      results.records.push({ phc_id: proposed.phc_id, match: true });
    } else {
      results.mismatchedRecords++;
      results.status = "FAILED_MISMATCHED_RECORD";
      results.records.push({ 
        phc_id: proposed.phc_id, 
        match: false, 
        reason: "Values in Firestore do not match proposed values",
        foundData: data,
        expectedData: proposed
      });
    }
  }

  if (results.matchingRecords !== 28) {
    results.status = "FAILED";
  }

  return results;
}
