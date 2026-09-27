import { getPHCs, predictStockOut } from './db.js';
import { calculateHaversineDistance } from '../utils/haversine.js';

/**
 * Validates that a PHC has a valid numeric latitude and longitude.
 * @param {Object} phc The PHC object to validate
 * @returns {boolean} True if coordinates are valid, false otherwise
 */
export function validatePHCLocation(phc) {
  if (!phc) return false;
  
  const { latitude, longitude } = phc;
  
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false;
  }
  
  if (isNaN(latitude) || isNaN(longitude)) {
    return false;
  }
  
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  
  return true;
}

/**
 * Finds the nearest valid PHCs to a target PHC.
 * @param {string} targetPhcId The ID of the central PHC
 * @param {number} limit The maximum number of PHCs to return
 * @param {Array} mockPhcs Optional array of PHCs for testing without DB access
 * @returns {Promise<Object>} Object containing { location_available: boolean, results: Array }
 */
export async function findNearestPHCs(targetPhcId, limit = 5, mockPhcs = null) {
  let phcs;
  try {
    phcs = mockPhcs || await getPHCs();
  } catch (e) {
    return { location_available: false, results: [] };
  }

  const targetPhc = phcs.find(p => p.phc_id === targetPhcId);
  
  if (!validatePHCLocation(targetPhc)) {
    return { location_available: false, results: [] };
  }

  const results = [];

  for (const phc of phcs) {
    // Exclude the target PHC itself
    if (phc.phc_id === targetPhcId) continue;
    
    // Skip PHCs with invalid coordinates
    if (!validatePHCLocation(phc)) continue;

    const distance = calculateHaversineDistance(
      targetPhc.latitude,
      targetPhc.longitude,
      phc.latitude,
      phc.longitude
    );

    if (distance !== null) {
      results.push({
        phc_id: phc.phc_id,
        name: phc.name,
        address: phc.address,
        state_id: phc.state_id,
        state_name: phc.state_name,
        district_id: phc.district_id,
        district_name: phc.district_name || phc.district,
        latitude: phc.latitude,
        longitude: phc.longitude,
        distance_km: distance
      });
    }
  }

  // Sort by nearest first
  results.sort((a, b) => a.distance_km - b.distance_km);

  // Return the requested limit
  return {
    location_available: true,
    results: results.slice(0, limit)
  };
}

/**
 * Finds all other PHCs belonging to the same district as the target PHC.
 * Does not require latitude or longitude.
 * @param {string} targetPhcId The ID of the central PHC
 * @param {Array} mockPhcs Optional array of PHCs for testing without DB access
 * @returns {Promise<Array>} Array of PHCs in the same district
 */
export async function findPHCsInSameDistrict(targetPhcId, mockPhcs = null) {
  let phcs;
  try {
    phcs = mockPhcs || await getPHCs();
  } catch (e) {
    return [];
  }

  const targetPhc = phcs.find(p => p.phc_id === targetPhcId);
  
  if (!targetPhc || !targetPhc.district_id) {
    return [];
  }

  const results = [];

  for (const phc of phcs) {
    if (phc.phc_id === targetPhcId) continue;

    if (phc.district_id === targetPhc.district_id) {
      results.push({
        phc_id: phc.phc_id,
        name: phc.name,
        state_id: phc.state_id,
        state_name: phc.state_name,
        district_id: phc.district_id,
        district_name: phc.district_name || phc.district
      });
    }
  }

  return results;
}

/**
 * Finds all PHCs located in districts OTHER THAN the target PHC's district.
 * Does not require latitude or longitude.
 * @param {string} targetPhcId The ID of the central PHC
 * @param {Array} mockPhcs Optional array of PHCs for testing without DB access
 * @returns {Promise<Array>} Array of PHCs in other districts
 */
export async function findPHCsInOtherDistricts(targetPhcId, mockPhcs = null) {
  let phcs;
  try {
    phcs = mockPhcs || await getPHCs();
  } catch (e) {
    return [];
  }

  const targetPhc = phcs.find(p => p.phc_id === targetPhcId);
  
  if (!targetPhc || !targetPhc.district_id) {
    return [];
  }

  const results = [];

  for (const phc of phcs) {
    if (phc.phc_id === targetPhcId) continue;

    if (phc.district_id && phc.district_id !== targetPhc.district_id) {
      results.push({
        phc_id: phc.phc_id,
        name: phc.name,
        state_id: phc.state_id,
        state_name: phc.state_name,
        district_id: phc.district_id,
        district_name: phc.district_name || phc.district
      });
    }
  }

  return results;
}

import { getInventory } from './db.js';

/**
 * Returns the resource availability for a specific PHC using existing data.
 * Does not invent data. Distinguishes between available data and unknown data.
 * @param {string} phcId 
 * @param {Array} mockInventory Optional mock inventory data
 * @returns {Promise<Object>} Resource availability state
 */
export async function getPHCResourceAvailability(phcId, mockInventory = null) {
  let inventory;
  try {
    inventory = mockInventory || await getInventory(phcId);
  } catch (e) {
    return { data_available: false, resources: {} };
  }

  if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
    return { data_available: false, resources: {} };
  }

  // Check if any actual transaction data exists for this PHC.
  // If totalReceived and totalUsed are both 0 for all medicines, the data is essentially non-existent.
  const hasAnyData = inventory.some(item => item.totalReceived > 0 || item.totalUsed > 0);

  if (!hasAnyData) {
    return { data_available: false, resources: {} };
  }

  const resources = {
    medicines: []
  };

  for (const item of inventory) {
    resources.medicines.push({
      medicine_id: item.medicine_id,
      name: item.name,
      current_stock: item.currentStock,
      unit: item.unit
    });
  }

  return {
    data_available: true,
    resources
  };
}

/**
 * Identifies medicine sources from same/other districts.
 * @param {string} destinationPhcId 
 * @param {string} medicineId 
 * @param {Array} mockPhcs Optional mock data for testing
 * @param {Function} mockPredictStockOut Optional mock function for testing
 */
export async function findTransferSourcesByDistrict(destinationPhcId, medicineId, mockPhcs = null, mockPredictStockOut = null) {
  let phcs;
  try {
    phcs = mockPhcs || await getPHCs();
  } catch (e) {
    return [];
  }

  const destPhc = phcs.find(p => p.phc_id === destinationPhcId);
  if (!destPhc || !destPhc.district_id) return [];

  const candidates = [];

  for (const phc of phcs) {
    if (phc.phc_id === destinationPhcId) continue;

    // Use existing stock-out prediction
    let sourceStockOut;
    try {
      sourceStockOut = mockPredictStockOut 
        ? await mockPredictStockOut(phc.phc_id, medicineId)
        : await predictStockOut(phc.phc_id, medicineId);
    } catch(e) {
      continue;
    }
    
    if (!sourceStockOut || sourceStockOut.error) continue;

    const safeSurplus = sourceStockOut.currentStock - sourceStockOut.predicted7DayDemand;
    if (safeSurplus > 0) {
      let distance_km = null;
      if (validatePHCLocation(destPhc) && validatePHCLocation(phc)) {
        distance_km = calculateHaversineDistance(
          destPhc.latitude, destPhc.longitude,
          phc.latitude, phc.longitude
        );
      }

      candidates.push({
        phc_id: phc.phc_id,
        name: phc.name,
        state_id: phc.state_id,
        state_name: phc.state_name,
        district_id: phc.district_id,
        district_name: phc.district_name || phc.district,
        medicine_id: medicineId,
        current_stock: sourceStockOut.currentStock,
        safe_surplus: safeSurplus,
        distance_km,
        classification: phc.district_id === destPhc.district_id ? "SAME_DISTRICT" : "OTHER_DISTRICT"
      });
    }
  }

  // Sort: Same district first, then other district. Within each, nearest distance first.
  candidates.sort((a, b) => {
    if (a.classification === "SAME_DISTRICT" && b.classification === "OTHER_DISTRICT") return -1;
    if (a.classification === "OTHER_DISTRICT" && b.classification === "SAME_DISTRICT") return 1;

    if (a.distance_km === null && b.distance_km !== null) return 1;
    if (a.distance_km !== null && b.distance_km === null) return -1;
    if (a.distance_km !== null && b.distance_km !== null) {
      return a.distance_km - b.distance_km;
    }
    return 0;
  });

  return candidates;
}
