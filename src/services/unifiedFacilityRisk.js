import { predictStockOut, getMedicines } from './db.js';
import { forecastBedDemand } from './bedForecast.js';
import { getStaffRecords, getAttendanceRecords } from './workforceDb.js';
import { getWorkforceRisk } from './workforceRisk.js';

/**
 * Unified Facility Risk Service
 *
 * Pure decision-support classifier combining Medicine, Bed Capacity, and Personnel Attendance risks.
 * Zero Firestore access. Zero database writes.
 * Reuses existing audited domain service outputs without duplicating their underlying calculations.
 */

export const UNIFIED_RISK_STATUS = {
  SAFE: 'SAFE',
  AT_RISK: 'AT_RISK',
  CRITICAL: 'CRITICAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
};

export const RISK_SEVERITY = {
  SAFE: 0,
  AT_RISK: 1,
  CRITICAL: 2
};

/**
 * Normalizes Medicine Risk output into unified status.
 *
 * @param {string|Object} input - Medicine risk level string or predictStockOut result
 * @returns {{ risk: string, originalStatus: string|null, details: Object|null }}
 */
export function normalizeMedicineRisk(input) {
  if (!input) {
    return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null };
  }

  let status = null;
  let details = null;

  if (typeof input === 'string') {
    status = input;
  } else if (typeof input === 'object') {
    details = input;
    if (input.error) {
      return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: input.error, details };
    }
    status = input.riskLevel || input.status || input.risk || null;
  }

  if (status === 'CRITICAL') {
    return { risk: UNIFIED_RISK_STATUS.CRITICAL, originalStatus: status, details };
  }
  if (status === 'AT_RISK') {
    return { risk: UNIFIED_RISK_STATUS.AT_RISK, originalStatus: status, details };
  }
  if (status === 'SAFE') {
    return { risk: UNIFIED_RISK_STATUS.SAFE, originalStatus: status, details };
  }

  return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: status, details };
}

/**
 * Normalizes Bed Capacity Risk output into unified status.
 *
 * @param {string|Object} input - Bed status string or forecastBedDemand result
 * @returns {{ risk: string, originalStatus: string|null, details: Object|null }}
 */
export function normalizeBedRisk(input) {
  if (!input) {
    return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null };
  }

  let status = null;
  let details = null;

  if (typeof input === 'string') {
    status = input;
  } else if (typeof input === 'object') {
    details = input;
    status = input.overallStatus || input.status || input.risk || null;
  }

  if (status === 'OVER_CAPACITY' || status === 'CRITICAL') {
    return { risk: UNIFIED_RISK_STATUS.CRITICAL, originalStatus: status, details };
  }
  if (status === 'AT_RISK') {
    return { risk: UNIFIED_RISK_STATUS.AT_RISK, originalStatus: status, details };
  }
  if (status === 'CAPACITY_AVAILABLE' || status === 'SAFE') {
    return { risk: UNIFIED_RISK_STATUS.SAFE, originalStatus: status, details };
  }

  return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: status, details };
}

/**
 * Normalizes Personnel / Workforce Risk output into unified status.
 *
 * @param {string|Object} input - Personnel status string or getWorkforceRisk result
 * @returns {{ risk: string, originalStatus: string|null, details: Object|null }}
 */
export function normalizePersonnelRisk(input) {
  if (!input) {
    return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null };
  }

  let status = null;
  let details = null;

  if (typeof input === 'string') {
    status = input;
  } else if (typeof input === 'object') {
    details = input;
    if (input.dataStatus && input.dataStatus !== 'AVAILABLE') {
      return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: input.status || input.dataStatus, details };
    }
    status = input.status || input.workforceStatus || input.risk || null;
  }

  if (status === 'CRITICAL') {
    return { risk: UNIFIED_RISK_STATUS.CRITICAL, originalStatus: status, details };
  }
  if (status === 'AT_RISK') {
    return { risk: UNIFIED_RISK_STATUS.AT_RISK, originalStatus: status, details };
  }
  if (status === 'ADEQUATE' || status === 'SAFE') {
    return { risk: UNIFIED_RISK_STATUS.SAFE, originalStatus: status, details };
  }

  return { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: status, details };
}

/**
 * Aggregates multiple medicine stock-out prediction outputs into a single facility-level medicine risk signal.
 * Follows highest severity: CRITICAL > AT_RISK > SAFE > INSUFFICIENT_DATA.
 *
 * @param {Array<Object>} medicineResults - Array of predictStockOut outputs or mock results
 * @returns {{
 *   risk: string,
 *   originalStatus: string,
 *   details: {
 *     totalMonitored: number,
 *     evaluatedCount: number,
 *     criticalMedicines: Array<Object>,
 *     atRiskMedicines: Array<Object>,
 *     safeMedicines: Array<Object>,
 *     errorMedicines: Array<Object>,
 *     medicineRiskDrivers: string[],
 *     results: Array<Object>
 *   }
 * }}
 */
export function aggregateFacilityMedicineRisk(medicineResults) {
  if (!Array.isArray(medicineResults) || medicineResults.length === 0) {
    return {
      risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      originalStatus: 'INSUFFICIENT_DATA',
      details: {
        totalMonitored: 0,
        evaluatedCount: 0,
        criticalMedicines: [],
        atRiskMedicines: [],
        safeMedicines: [],
        errorMedicines: [],
        medicineRiskDrivers: [],
        results: []
      }
    };
  }

  const criticalMedicines = [];
  const atRiskMedicines = [];
  const safeMedicines = [];
  const errorMedicines = [];

  for (const m of medicineResults) {
    if (!m || m.error) {
      errorMedicines.push(m || { error: 'Unknown medicine error' });
    } else if (m.riskLevel === 'CRITICAL' || m.status === 'CRITICAL') {
      criticalMedicines.push(m);
    } else if (m.riskLevel === 'AT_RISK' || m.status === 'AT_RISK') {
      atRiskMedicines.push(m);
    } else if (m.riskLevel === 'SAFE' || m.status === 'SAFE') {
      safeMedicines.push(m);
    } else {
      errorMedicines.push(m);
    }
  }

  const evaluatedCount = criticalMedicines.length + atRiskMedicines.length + safeMedicines.length;

  if (evaluatedCount === 0) {
    return {
      risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      originalStatus: 'INSUFFICIENT_DATA',
      details: {
        totalMonitored: medicineResults.length,
        evaluatedCount: 0,
        criticalMedicines: [],
        atRiskMedicines: [],
        safeMedicines: [],
        errorMedicines,
        medicineRiskDrivers: [],
        results: medicineResults
      }
    };
  }

  let aggregatedRisk = UNIFIED_RISK_STATUS.SAFE;
  let medicineRiskDrivers = [];

  if (criticalMedicines.length > 0) {
    aggregatedRisk = UNIFIED_RISK_STATUS.CRITICAL;
    medicineRiskDrivers = criticalMedicines.map(m => m.medicineName || m.name || m.medicineId || 'Unknown Medicine');
  } else if (atRiskMedicines.length > 0) {
    aggregatedRisk = UNIFIED_RISK_STATUS.AT_RISK;
    medicineRiskDrivers = atRiskMedicines.map(m => m.medicineName || m.name || m.medicineId || 'Unknown Medicine');
  }

  return {
    risk: aggregatedRisk,
    originalStatus: aggregatedRisk,
    details: {
      totalMonitored: medicineResults.length,
      evaluatedCount,
      criticalMedicines,
      atRiskMedicines,
      safeMedicines,
      errorMedicines,
      medicineRiskDrivers,
      results: medicineResults
    }
  };
}

/**
 * Calculates Unified Facility Risk by combining normalized signals from Medicine, Bed Capacity, and Personnel.
 *
 * Rule:
 * 1. If any component has INSUFFICIENT_DATA / missing / invalid: overallRisk is INSUFFICIENT_DATA (data safety).
 * 2. If complete: highest severity determines overall risk (CRITICAL > AT_RISK > SAFE).
 * 3. Primary risk driver(s) and transparent human-readable reason are generated.
 *
 * @param {Object} params
 * @param {string|Object} params.medicineRisk - Medicine risk level or predictStockOut object
 * @param {string|Object} params.bedRisk - Bed capacity status or forecastBedDemand object
 * @param {string|Object} params.personnelRisk - Workforce status or getWorkforceRisk object
 * @returns {Object} Unified facility risk result object
 */
export function calculateUnifiedFacilityRisk({ medicineRisk, bedRisk, personnelRisk } = {}) {
  const normMedicine = normalizeMedicineRisk(medicineRisk);
  const normBeds = normalizeBedRisk(bedRisk);
  const normPersonnel = normalizePersonnelRisk(personnelRisk);

  const missingComponents = [];
  if (normMedicine.risk === UNIFIED_RISK_STATUS.INSUFFICIENT_DATA) missingComponents.push('MEDICINE');
  if (normBeds.risk === UNIFIED_RISK_STATUS.INSUFFICIENT_DATA) missingComponents.push('BEDS');
  if (normPersonnel.risk === UNIFIED_RISK_STATUS.INSUFFICIENT_DATA) missingComponents.push('PERSONNEL');

  const isComplete = missingComponents.length === 0;

  const components = {
    medicine: normMedicine,
    beds: normBeds,
    personnel: normPersonnel
  };

  // 1. Data-Quality Safety Check:
  // If any component lacks sufficient data, we do NOT compute a false clinical/operational overall status.
  if (!isComplete) {
    const formattedMissing = missingComponents.map(c => c.toLowerCase()).join(' and ');
    return {
      overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      riskDrivers: [],
      reason: `Unified facility risk cannot be determined because required data is unavailable or insufficient for: ${formattedMissing}.`,
      components,
      dataQuality: {
        isComplete: false,
        missingComponents
      }
    };
  }

  // 2. Highest-Severity Evaluation:
  const compList = [
    { name: 'MEDICINE', label: 'medicine', risk: normMedicine.risk, sev: RISK_SEVERITY[normMedicine.risk] },
    { name: 'BEDS', label: 'bed', risk: normBeds.risk, sev: RISK_SEVERITY[normBeds.risk] },
    { name: 'PERSONNEL', label: 'personnel', risk: normPersonnel.risk, sev: RISK_SEVERITY[normPersonnel.risk] }
  ];

  const maxSev = Math.max(...compList.map(c => c.sev));

  let overallRisk = UNIFIED_RISK_STATUS.SAFE;
  if (maxSev === RISK_SEVERITY.CRITICAL) {
    overallRisk = UNIFIED_RISK_STATUS.CRITICAL;
  } else if (maxSev === RISK_SEVERITY.AT_RISK) {
    overallRisk = UNIFIED_RISK_STATUS.AT_RISK;
  }

  // 3. Primary Risk Driver(s) Identification
  let riskDrivers = [];
  if (overallRisk !== UNIFIED_RISK_STATUS.SAFE) {
    riskDrivers = compList.filter(c => c.sev === maxSev).map(c => c.name);
  }

  // 4. Human-Readable Reason Generation
  let reason = '';
  if (overallRisk === UNIFIED_RISK_STATUS.SAFE) {
    reason = 'All monitored operational domains (medicine, beds, personnel) are within safe operational parameters.';
  } else {
    const driverLabels = compList.filter(c => c.sev === maxSev).map(c => c.label);
    const joinedLabels = driverLabels.length === 1
      ? driverLabels[0]
      : driverLabels.slice(0, -1).join(', ') + ' and ' + driverLabels[driverLabels.length - 1];
    
    const isPlural = driverLabels.length > 1;
    reason = `Overall ${overallRisk} because ${joinedLabels} risk${isPlural ? 's are' : ' is'} ${overallRisk}.`;
  }

  return {
    overallRisk,
    riskDrivers,
    reason,
    components,
    dataQuality: {
      isComplete: true,
      missingComponents: []
    }
  };
}

/**
 * Orchestrates domain signal retrieval and evaluates unified facility risk for a selected PHC and target date.
 * Zero Firestore writes. Reuses existing audited domain functions without duplicating calculations.
 *
 * @param {string} phcId - Primary PHC identifier
 * @param {Object} [options={}] - Configuration and dependency injection options
 * @param {string} [options.targetDate='2026-09-14'] - Personnel attendance target date
 * @param {number} [options.admissionRate=8] - Bed forecast admission rate (%)
 * @param {Object} [options.phc] - Pre-fetched PHC document
 * @param {Array<Object>} [options.medicines] - Pre-fetched list of medicines to monitor
 * @param {Array<Object>} [options.staff] - Pre-fetched staff list
 * @param {Array<Object>} [options.attendance] - Pre-fetched attendance list
 * @param {Object} [options.mockMedicineResults] - Injected medicine predictions (testing)
 * @param {Object} [options.mockBedForecast] - Injected bed forecast (testing)
 * @param {Object} [options.mockWorkforceRisk] - Injected personnel risk (testing)
 * @returns {Promise<Object>} Consolidated Unified Facility Risk payload
 */
export async function getFacilityUnifiedRisk(phcId, options = {}) {
  const targetDate = options.targetDate || '2026-09-14';
  const admissionRate = typeof options.admissionRate === 'number' ? options.admissionRate : 8;

  if (!phcId) {
    return {
      phcId: null,
      phcName: 'Unknown Facility',
      district: 'General',
      state: 'Rajasthan',
      targetDate,
      medicine: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
      beds: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
      personnel: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
      overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      riskDrivers: [],
      reason: 'Unified facility risk cannot be determined because no facility ID was provided.',
      dataQuality: {
        isComplete: false,
        missingComponents: ['MEDICINE', 'BEDS', 'PERSONNEL']
      }
    };
  }

  // 1. MEDICINE SIGNAL (Evaluated across monitored medicines)
  let medicineResults = [];
  let aggregatedMedRisk = null;

  if (options.medicineResults || options.mockMedicineResults) {
    medicineResults = options.medicineResults || options.mockMedicineResults;
    aggregatedMedRisk = aggregateFacilityMedicineRisk(medicineResults);
  } else {
    try {
      let monitoredMeds = options.medicines;
      if (!monitoredMeds) {
        monitoredMeds = await getMedicines();
      }

      if (Array.isArray(monitoredMeds) && monitoredMeds.length > 0) {
        const medPredictions = await Promise.all(
          monitoredMeds.map(async (med) => {
            try {
              const res = await predictStockOut(phcId, med.medicine_id);
              return {
                ...res,
                medicineId: med.medicine_id,
                medicineName: med.name
              };
            } catch (err) {
              return {
                medicineId: med.medicine_id,
                medicineName: med.name,
                error: err.message || 'Error evaluating medicine'
              };
            }
          })
        );
        medicineResults = medPredictions;
        aggregatedMedRisk = aggregateFacilityMedicineRisk(medicineResults);
      } else {
        aggregatedMedRisk = {
          risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
          originalStatus: 'NO_MEDICINES_MONITORED',
          details: null
        };
      }
    } catch (err) {
      aggregatedMedRisk = {
        risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
        originalStatus: err.message || 'MEDICINE_SERVICE_ERROR',
        details: null
      };
    }
  }

  // 2. BED SIGNAL (Forecast bed demand)
  let bedForecast = null;
  if (options.mockBedForecast) {
    bedForecast = options.mockBedForecast;
  } else {
    try {
      bedForecast = await forecastBedDemand(phcId, admissionRate);
    } catch (err) {
      bedForecast = {
        overallStatus: 'INSUFFICIENT_DATA',
        error: err.message || 'BED_SERVICE_ERROR'
      };
    }
  }

  // 3. PERSONNEL SIGNAL (Evaluate workforce attendance risk)
  let workforceRisk = null;
  if (options.mockWorkforceRisk) {
    workforceRisk = options.mockWorkforceRisk;
  } else {
    try {
      let staffList = options.staff;
      let attendanceList = options.attendance;

      if (!staffList) {
        staffList = await getStaffRecords(phcId);
      }
      if (!attendanceList) {
        attendanceList = await getAttendanceRecords(targetDate, phcId);
      }

      workforceRisk = getWorkforceRisk(phcId, targetDate, staffList || [], attendanceList || []);
    } catch (err) {
      workforceRisk = {
        status: 'INSUFFICIENT_DATA',
        dataStatus: 'ERROR',
        reason: err.message || 'WORKFORCE_SERVICE_ERROR'
      };
    }
  }

  // 4. UNIFIED COMPOSITION
  const unified = calculateUnifiedFacilityRisk({
    medicineRisk: aggregatedMedRisk,
    bedRisk: bedForecast,
    personnelRisk: workforceRisk
  });

  const phcObj = options.phc || {};

  return {
    phcId,
    phcName: phcObj.name || phcObj.phc_name || phcId,
    district: phcObj.district || phcObj.district_name || 'General',
    state: phcObj.state || 'Rajasthan',
    targetDate,
    medicine: {
      risk: unified.components.medicine.risk,
      originalStatus: unified.components.medicine.originalStatus,
      details: aggregatedMedRisk?.details || aggregatedMedRisk
    },
    beds: {
      risk: unified.components.beds.risk,
      originalStatus: unified.components.beds.originalStatus,
      details: bedForecast
    },
    personnel: {
      risk: unified.components.personnel.risk,
      originalStatus: unified.components.personnel.originalStatus,
      details: workforceRisk
    },
    overallRisk: unified.overallRisk,
    riskDrivers: unified.riskDrivers,
    reason: unified.reason,
    dataQuality: unified.dataQuality
  };
}
