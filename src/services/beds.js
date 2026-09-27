import { getBedCapacity, validateBedCapacity } from "./db.js";

/**
 * Returns a standardized bed availability response for a single PHC.
 * Handles missing data safely without fabricating zeros.
 * @param {string} phcId
 * @param {boolean} isDemo
 * @returns {Promise<Object>} { data_available: boolean, beds: Object|null, error?: string }
 */
export async function getPHCBedAvailability(phcId, isDemo = false) {
  if (!phcId) {
    return { data_available: false, beds: null, error: "Missing PHC ID" };
  }

  try {
    const bedData = await getBedCapacity(phcId, isDemo);

    if (!bedData) {
      return { data_available: false, beds: null };
    }

    // getBedCapacity already validates the data mathematically via validateBedCapacity.
    return {
      data_available: true,
      beds: bedData
    };
  } catch (err) {
    // This catches unknown PHC errors or corrupted data errors thrown by getBedCapacity
    return { data_available: false, beds: null, error: err.message };
  }
}

/**
 * Retrieves bed availability for multiple PHCs concurrently.
 * @param {string[]} phcIds
 * @param {boolean} isDemo
 * @returns {Promise<Object>} Mapping of phcId to their availability response
 */
export async function getBedAvailabilityForPHCs(phcIds, isDemo = false) {
  if (!phcIds || !Array.isArray(phcIds)) {
    return {};
  }

  const results = {};
  const promises = phcIds.map(async (phcId) => {
    results[phcId] = await getPHCBedAvailability(phcId, isDemo);
  });

  await Promise.all(promises);
  return results;
}

/**
 * Calculates the bed occupancy status based on configured thresholds.
 * Pure function: Does NOT access Firestore.
 * 
 * @param {Object} bedData - The validated bed capacity data
 * @param {Object} [thresholds] - Optional configurable thresholds
 * @returns {Object} Status classification
 */
export function calculateBedStatus(bedData, thresholds = { safeLimit: 70, criticalLimit: 90 }) {
  if (!bedData) {
    return { data_available: false, status: "INSUFFICIENT_DATA" };
  }

  // Re-verify underlying mathematical validity using the central validator
  const validation = validateBedCapacity(bedData);
  if (!validation.valid) {
    return { data_available: false, status: "INVALID_DATA", error: validation.error };
  }

  const { total_beds, occupied_beds, available_beds } = bedData;

  if (total_beds === 0) {
    // 0 total beds could mean lack of operational data or genuine 0 capacity.
    // The safest fallback without context is INSUFFICIENT_DATA
    return { data_available: false, status: "INSUFFICIENT_DATA" };
  }

  const occupancy_percent = (occupied_beds / total_beds) * 100;
  
  let status = "SAFE";
  if (occupancy_percent >= thresholds.criticalLimit) {
    status = "CRITICAL";
  } else if (occupancy_percent >= thresholds.safeLimit) {
    status = "AT_RISK";
  }

  return {
    data_available: true,
    status,
    occupancy_percent,
    available_beds
  };
}

/**
 * Calculates dynamic bed demand based on footfall and an admission rate.
 * @param {number} footfall 
 * @param {number|string} admissionRate 
 * @returns {Object} { estimatedBedDemand: number } or throws an error if invalid
 */
export function calculateDynamicBedDemand(footfall, admissionRate) {
  if (footfall === undefined || footfall === null || footfall === "") {
    throw new Error("Missing footfall");
  }
  const parsedFootfall = Number(footfall);
  if (isNaN(parsedFootfall) || !isFinite(parsedFootfall) || parsedFootfall < 0) {
    throw new Error("Invalid footfall value");
  }

  if (admissionRate === undefined || admissionRate === null || admissionRate === "") {
    throw new Error("Missing admission rate");
  }
  const parsedRate = Number(admissionRate);
  if (isNaN(parsedRate) || !isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
    throw new Error("Invalid admission rate");
  }

  const estimatedBedDemand = Math.round(parsedFootfall * (parsedRate / 100));
  return { estimatedBedDemand };
}

/**
 * Calculates whether the current capacity can handle the estimated demand.
 * @param {number} estimatedDemand 
 * @param {number} availableBeds 
 * @returns {Object} { capacityGap: number, status: "CAPACITY AVAILABLE" | "OVER CAPACITY" }
 */
export function calculateCapacityStatus(estimatedDemand, availableBeds) {
  if (typeof estimatedDemand !== 'number' || isNaN(estimatedDemand) || estimatedDemand < 0) {
    throw new Error("Invalid estimated demand");
  }
  if (typeof availableBeds !== 'number' || isNaN(availableBeds) || availableBeds < 0) {
    throw new Error("Invalid available beds");
  }

  const capacityGap = estimatedDemand - availableBeds;
  const status = capacityGap <= 0 ? "CAPACITY AVAILABLE" : "OVER CAPACITY";

  return { capacityGap, status };
}
