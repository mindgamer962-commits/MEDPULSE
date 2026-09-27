import { getPHCs, getMedicines, predictStockOut, getFootfallStats } from './db.js';
import { getFacilityUnifiedRisk, UNIFIED_RISK_STATUS } from './unifiedFacilityRisk.js';
import {
  calculateFederatedDemandForecast,
  compareDemandForecasts,
  FEDERATED_MODEL_METADATA
} from './federatedForecast.js';

/**
 * System Instruction for Gemini Multi-Resource Operational Explanation.
 * Strictly enforces explanation-only behavior with zero decision-making, recalculation, or transfer generation.
 */
export const GEMINI_SYSTEM_INSTRUCTION = `You are MedPulse's clinical supply-chain and facility operations explanation assistant.
Your role is to explain already-calculated multi-resource operational states (medicine, beds, personnel, demand, unified facility risk, and federated demand forecast) to a health officer.
The medicine, bed, personnel, demand, and unified-risk values supplied in the structured input are authoritative.
The supplied unifiedRisk.overallRisk is the deterministic MedPulse facility risk. Do not recalculate or change it.
Deterministic MedPulse risk values are authoritative.
The federated forecast is an additional predictive intelligence signal and is not authoritative.
Do not recalculate risk, demand, bed capacity, attendance, stock-out dates, or any other numerical value.
Do not replace deterministic risk with federated predictions.
Explain meaningful agreement or divergence between deterministic demand and federated forecast signals.
Never invent missing federated values if marked INSUFFICIENT_DATA.
Do not create a transfer quantity.
Do not recommend a source PHC.
Do not approve or reject a transfer.
Do not recommend staff reassignment.
Do not modify or instruct the system to modify data.
Explain relationships between the supplied operational signals.
If data is missing or marked INSUFFICIENT_DATA, explicitly state that limitation.
Do not invent causes that are not supported by the supplied data.
Keep the explanation concise, factual, and operational. Return ONLY the explanation text.`;

/**
 * Builds the structured multi-resource context for Gemini explanation.
 * Combines existing deterministic outputs from:
 * - Medicine risk & stockout
 * - Bed demand & capacity forecast
 * - Personnel attendance & workforce risk
 * - Footfall statistics
 * - Unified facility risk
 * - Federated demand forecast (additional predictive signal)
 *
 * ZERO Firestore writes. All calculations are performed by existing services.
 *
 * @param {Object} params
 * @param {string} params.phcId - Facility ID
 * @param {string} [params.medicineId] - Optional specific target medicine ID
 * @param {string} [params.targetDate='2026-09-14'] - Attendance date
 * @param {number} [params.admissionRate=8] - Bed forecast admission rate (%)
 * @param {Object} [params.mockPHCs] - Injected PHC baseline list (testing)
 * @param {Object} [params.mockMedicines] - Injected Medicine baseline list (testing)
 * @param {Object} [params.mockUnifiedRisk] - Injected Unified Risk (testing)
 * @param {Object} [params.mockFootfallStats] - Injected Footfall Stats (testing)
 * @param {Object} [params.mockTargetMedicine] - Injected Target Medicine object (testing)
 * @param {Object} [params.mockFederatedForecast] - Injected Federated Forecast object (testing)
 * @param {Object} [params.operationalContext] - Optional operational context for federated feature extraction
 * @returns {Promise<Object>} Structured multi-resource context for Gemini
 */
export async function buildMultiResourceGeminiContext({
  phcId,
  medicineId = null,
  targetDate = '2026-09-14',
  admissionRate = 8,
  mockPHCs = null,
  mockMedicines = null,
  mockUnifiedRisk = null,
  mockFootfallStats = null,
  mockTargetMedicine = null,
  mockFederatedForecast = null,
  operationalContext = null
} = {}) {
  if (!phcId) {
    throw new Error('phcId is required to build Gemini context.');
  }

  // 1. Resolve PHC Metadata
  let phcs = mockPHCs;
  if (!phcs) {
    try {
      phcs = await getPHCs();
    } catch {
      phcs = [];
    }
  }
  const phc = phcs.find((p) => p.phc_id === phcId) || {
    phc_id: phcId,
    name: `PHC ${phcId}`,
    district: 'General',
    state: 'Rajasthan'
  };

  // 2. Resolve Medicine Metadata (if medicineId supplied)
  let medicines = mockMedicines;
  if (!medicines) {
    try {
      medicines = await getMedicines();
    } catch {
      medicines = [];
    }
  }

  // 3. Resolve Target Medicine details if medicineId is supplied
  let targetMedicine = null;
  if (mockTargetMedicine !== undefined && mockTargetMedicine !== null) {
    targetMedicine = mockTargetMedicine;
  } else if (medicineId) {
    const med = medicines.find((m) => m.medicine_id === medicineId);
    if (med) {
      try {
        const stockOut = await predictStockOut(phcId, medicineId);
        if (stockOut && !stockOut.error) {
          targetMedicine = {
            medicineId: med.medicine_id,
            name: med.name,
            unit: med.unit || 'units',
            currentStock: stockOut.currentStock,
            predicted7DayDemand: stockOut.predicted7DayDemand,
            averageDailyDemand: stockOut.averageDailyDemand,
            estimatedDaysRemaining: stockOut.estimatedDaysRemaining,
            projectedStockOutDate: stockOut.stockOutDate,
            riskLevel: stockOut.riskLevel
          };
        }
      } catch (err) {
        console.warn('Target medicine stockout retrieval failed:', err.message);
        targetMedicine = null;
      }
    }
  }

  // 4. Resolve Demand / Footfall Stats
  let footfallStats = mockFootfallStats;
  if (footfallStats === undefined) {
    try {
      footfallStats = await getFootfallStats(phcId, targetDate);
    } catch {
      footfallStats = null;
    }
  }

  // 5. Resolve Unified Facility Risk (Multi-Resource Aggregator)
  let unifiedRisk = mockUnifiedRisk;
  if (!unifiedRisk) {
    try {
      unifiedRisk = await getFacilityUnifiedRisk(phcId, {
        targetDate,
        admissionRate,
        phc,
        medicines: medicines.length > 0 ? medicines : undefined
      });
    } catch (err) {
      unifiedRisk = {
        phcId,
        phcName: phc.name,
        district: phc.district,
        state: phc.state,
        targetDate,
        medicine: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
        beds: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
        personnel: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, originalStatus: null, details: null },
        overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
        riskDrivers: [],
        reason: 'Unified facility risk calculation failed.',
        dataQuality: { isComplete: false, missingComponents: ['MEDICINE', 'BEDS', 'PERSONNEL'] }
      };
    }
  }

  // 6. Extract Day 3 Capacity Margin if available
  let day3CapacityMargin = null;
  if (unifiedRisk.beds?.details?.forecast && Array.isArray(unifiedRisk.beds.details.forecast)) {
    const d3 = unifiedRisk.beds.details.forecast[2];
    if (d3 && typeof d3.capacityMargin === 'number') {
      day3CapacityMargin = d3.capacityMargin;
    }
  }

  // 7. Resolve Federated Demand Forecast Signal
  let federatedForecastSection = null;
  if (mockFederatedForecast !== undefined && mockFederatedForecast !== null) {
    const detDemand = mockFederatedForecast.deterministicDemand ??
      targetMedicine?.averageDailyDemand ??
      targetMedicine?.predicted7DayDemand ??
      null;

    const fedDemand = mockFederatedForecast.forecastDemand ?? (mockFederatedForecast.available ? mockFederatedForecast.forecastDemand : null);
    const comparison = compareDemandForecasts(detDemand, fedDemand !== undefined ? fedDemand : mockFederatedForecast);

    federatedForecastSection = {
      modelType: mockFederatedForecast.modelType || FEDERATED_MODEL_METADATA.modelType,
      modelVersion: mockFederatedForecast.modelVersion || FEDERATED_MODEL_METADATA.modelVersion,
      forecastDemand: mockFederatedForecast.forecastDemand ?? null,
      dataStatus: mockFederatedForecast.dataStatus || (mockFederatedForecast.forecastDemand !== null && mockFederatedForecast.forecastDemand !== undefined ? 'AVAILABLE' : 'INSUFFICIENT_DATA'),
      deterministicDemand: mockFederatedForecast.deterministicDemand ?? comparison.deterministicDemand ?? null,
      divergence: mockFederatedForecast.divergence ?? comparison.divergence ?? null,
      direction: mockFederatedForecast.direction ?? comparison.direction ?? 'UNAVAILABLE',
      isAvailable: mockFederatedForecast.isAvailable ?? mockFederatedForecast.available ?? (mockFederatedForecast.forecastDemand !== null && mockFederatedForecast.forecastDemand !== undefined),
      summary: mockFederatedForecast.summary ?? comparison.summary ?? 'Federated forecast comparison'
    };
  } else {
    // Derive features from operational context and statistics
    const footfallAvg = operationalContext?.recentFootfallAvg ?? footfallStats?.last7DaysAvg ?? footfallStats?.avgDaily ?? null;
    let trendRatio = operationalContext?.footfallTrendRatio ?? footfallStats?.trendRatio ?? null;
    if (!trendRatio && footfallStats?.last7DaysAvg && footfallStats?.prev7DaysAvg && footfallStats.prev7DaysAvg > 0) {
      trendRatio = footfallStats.last7DaysAvg / footfallStats.prev7DaysAvg;
    }

    let occupancyRate = operationalContext?.currentOccupancyRate ?? null;
    if (occupancyRate === null && unifiedRisk.beds?.details) {
      const avail = unifiedRisk.beds.details.currentAvailableBeds;
      const total = unifiedRisk.beds.details.totalBeds;
      if (typeof total === 'number' && typeof avail === 'number' && total > 0) {
        occupancyRate = Math.max(0, Math.min(1.0, (total - avail) / total));
      }
    }

    const fedContext = {
      targetDate: operationalContext?.targetDate || targetDate,
      recentFootfallAvg: footfallAvg,
      footfallTrendRatio: trendRatio,
      currentOccupancyRate: occupancyRate,
      seasonalFactor: operationalContext?.seasonalFactor ?? 1.0,
      ...operationalContext
    };

    const fedResult = calculateFederatedDemandForecast(fedContext);

    // Target deterministic demand to compare against
    const detDemand = targetMedicine?.averageDailyDemand ??
      targetMedicine?.predicted7DayDemand ??
      footfallAvg ??
      null;

    const comparison = compareDemandForecasts(detDemand, fedResult);

    federatedForecastSection = {
      modelType: fedResult.modelType || FEDERATED_MODEL_METADATA.modelType,
      modelVersion: fedResult.modelVersion || FEDERATED_MODEL_METADATA.modelVersion,
      forecastDemand: fedResult.forecastDemand ?? null,
      dataStatus: fedResult.dataStatus || 'INSUFFICIENT_DATA',
      deterministicDemand: comparison.deterministicDemand ?? null,
      divergence: comparison.divergence ?? null,
      direction: comparison.direction || 'UNAVAILABLE',
      isAvailable: fedResult.available === true,
      summary: comparison.summary || 'Federated forecast unavailable.'
    };
  }

  // 8. Assemble Structured Multi-Resource Context
  return {
    facility: {
      phcId: phc.phc_id || phcId,
      phcName: phc.name || phc.phc_name || phcId,
      district: phc.district || phc.district_name || 'General',
      state: phc.state || phc.state_name || 'Rajasthan',
      targetDate
    },

    medicine: {
      risk: unifiedRisk.medicine?.risk || UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      totalMonitored: unifiedRisk.medicine?.details?.totalMonitored ?? (medicines?.length || 0),
      evaluatedCount: unifiedRisk.medicine?.details?.evaluatedCount ?? 0,
      criticalCount: unifiedRisk.medicine?.details?.criticalMedicines?.length ?? 0,
      atRiskCount: unifiedRisk.medicine?.details?.atRiskMedicines?.length ?? 0,
      medicineRiskDrivers: unifiedRisk.medicine?.details?.medicineRiskDrivers ?? [],
      targetMedicine
    },

    beds: {
      risk: unifiedRisk.beds?.risk || UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      originalStatus: unifiedRisk.beds?.originalStatus || 'INSUFFICIENT_DATA',
      availableBeds: unifiedRisk.beds?.details?.currentAvailableBeds ?? null,
      earliestPredictedShortage: unifiedRisk.beds?.details?.earliestPredictedShortage ?? null,
      day3CapacityMargin
    },

    personnel: {
      risk: unifiedRisk.personnel?.risk || UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      originalStatus: unifiedRisk.personnel?.originalStatus || 'INSUFFICIENT_DATA',
      totalAssigned: unifiedRisk.personnel?.details?.metrics?.totalAssigned ?? null,
      onDutyPresent: unifiedRisk.personnel?.details?.metrics?.present ?? null,
      absent: unifiedRisk.personnel?.details?.metrics?.absent ?? null,
      attendancePercentage: unifiedRisk.personnel?.details?.attendancePercentage ?? null
    },

    demand: {
      trend: (footfallStats?.trend === 'Insufficient data' || !footfallStats?.trend) ? 'INSUFFICIENT_DATA' : footfallStats.trend,
      recentAverage: typeof footfallStats?.last7DaysAvg === 'number' ? footfallStats.last7DaysAvg : null,
      todayPatients: typeof footfallStats?.todayPatients === 'number' ? footfallStats.todayPatients : null
    },

    unifiedRisk: {
      overallRisk: unifiedRisk.overallRisk || UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      riskDrivers: unifiedRisk.riskDrivers || [],
      reason: unifiedRisk.reason || 'Unified risk explanation unavailable.',
      dataQuality: unifiedRisk.dataQuality || { isComplete: false, missingComponents: [] }
    },

    federatedForecast: federatedForecastSection
  };
}
