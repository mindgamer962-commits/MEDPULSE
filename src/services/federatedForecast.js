/**
 * MedPulse Production Adapter — Federated Demand Forecast
 *
 * Integrates the completed, validated Federated AI Model as an additional
 * predictive intelligence signal for MedPulse medicine forecasting.
 *
 * SAFETY CONTRACT:
 * - Authoritative stock-out and deterministic forecasting remain in db.js / bedForecast.js.
 * - This module is purely additive and read-only.
 * - ZERO Firestore writes, ZERO Gemini calls, ZERO mutations to medicine records.
 * - NEVER calculates stock-out status, risk levels (CRITICAL/AT_RISK/SAFE), or transfer quantities.
 * - Missing/incomplete features return an explicit INSUFFICIENT_DATA status without fake imputation.
 */

import { FEATURE_NAMES, createLocalModel, predict } from '../federated/models/linearRegression.js';

/**
 * Validated Day 14 Global Federated Model Parameters (Sample-Weighted FedAvg).
 */
export const FEDERATED_GLOBAL_MODEL = createLocalModel({
  modelVersion: '1.0.0',
  featureNames: FEATURE_NAMES,
  weights: [-0.067186, 0.583272, 20.273133, 30.319809, 54.692599],
  bias: -75.409879
});

export const FEDERATED_MODEL_METADATA = {
  modelType: 'FEDERATED',
  modelVersion: '1.0.0',
  featureNames: [...FEATURE_NAMES]
};

/**
 * Extracts and validates the 5 canonical federated features from MedPulse operational context.
 *
 * Feature Mapping:
 * 1. dayOfWeek: Integer [0..6] (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * 2. recentFootfallAvg: Number > 0 (Average daily patient footfall)
 * 3. footfallTrendRatio: Number > 0 (Ratio of recent to baseline footfall)
 * 4. currentOccupancyRate: Number [0..1] (Ratio of occupied beds to total capacity)
 * 5. seasonalFactor: Number > 0 (Seasonal demand index, default 1.0 if not explicit)
 *
 * @param {Object} context - Operational context inputs
 * @returns {{ valid: boolean, features?: Array<number>, featureObject?: Object, error?: string }}
 */
export function extractFederatedFeatures(context) {
  if (!context || typeof context !== 'object') {
    return { valid: false, error: 'Context must be a non-null object' };
  }

  // 1. Day of Week
  let dayOfWeek = context.dayOfWeek;
  if (dayOfWeek === undefined || dayOfWeek === null) {
    if (context.targetDate) {
      const d = new Date(context.targetDate);
      if (!isNaN(d.getTime())) {
        dayOfWeek = d.getDay();
      }
    } else if (context.date) {
      const d = new Date(context.date);
      if (!isNaN(d.getTime())) {
        dayOfWeek = d.getDay();
      }
    }
  }

  if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { valid: false, error: `Invalid or missing dayOfWeek (expected integer 0-6, received: ${dayOfWeek})` };
  }

  // 2. Recent Footfall Average
  let recentFootfallAvg = context.recentFootfallAvg;
  if (recentFootfallAvg === undefined || recentFootfallAvg === null) {
    if (context.footfallStats && typeof context.footfallStats.avgDaily === 'number') {
      recentFootfallAvg = context.footfallStats.avgDaily;
    } else if (context.footfallAvg !== undefined) {
      recentFootfallAvg = context.footfallAvg;
    }
  }

  if (typeof recentFootfallAvg !== 'number' || !Number.isFinite(recentFootfallAvg) || recentFootfallAvg <= 0) {
    return { valid: false, error: `Invalid or missing recentFootfallAvg (expected finite number > 0, received: ${recentFootfallAvg})` };
  }

  // 3. Footfall Trend Ratio
  let footfallTrendRatio = context.footfallTrendRatio;
  if (footfallTrendRatio === undefined || footfallTrendRatio === null) {
    if (context.footfallStats && typeof context.footfallStats.trendRatio === 'number') {
      footfallTrendRatio = context.footfallStats.trendRatio;
    } else if (context.trendRatio !== undefined) {
      footfallTrendRatio = context.trendRatio;
    }
  }

  if (typeof footfallTrendRatio !== 'number' || !Number.isFinite(footfallTrendRatio) || footfallTrendRatio <= 0) {
    return { valid: false, error: `Invalid or missing footfallTrendRatio (expected finite number > 0, received: ${footfallTrendRatio})` };
  }

  // 4. Current Occupancy Rate
  let currentOccupancyRate = context.currentOccupancyRate;
  if (currentOccupancyRate === undefined || currentOccupancyRate === null) {
    if (context.bedData && context.bedData.beds) {
      const total = context.bedData.beds.total_beds;
      const available = context.bedData.beds.available_beds;
      if (typeof total === 'number' && typeof available === 'number' && total > 0) {
        const occupied = Math.max(0, total - available);
        currentOccupancyRate = occupied / total;
      }
    } else if (context.occupancyRate !== undefined) {
      currentOccupancyRate = context.occupancyRate;
    }
  }

  if (typeof currentOccupancyRate !== 'number' || !Number.isFinite(currentOccupancyRate) || currentOccupancyRate < 0 || currentOccupancyRate > 1.0) {
    return { valid: false, error: `Invalid or missing currentOccupancyRate (expected number in range [0, 1], received: ${currentOccupancyRate})` };
  }

  // 5. Seasonal Factor
  let seasonalFactor = context.seasonalFactor;
  if (seasonalFactor === undefined || seasonalFactor === null) {
    if (context.seasonalIndex !== undefined) {
      seasonalFactor = context.seasonalIndex;
    }
  }

  if (typeof seasonalFactor !== 'number' || !Number.isFinite(seasonalFactor) || seasonalFactor <= 0) {
    return { valid: false, error: `Invalid or missing seasonalFactor (expected finite number > 0, received: ${seasonalFactor})` };
  }

  const featureVector = [
    dayOfWeek,
    recentFootfallAvg,
    footfallTrendRatio,
    currentOccupancyRate,
    seasonalFactor
  ];

  const featureObject = {
    dayOfWeek,
    recentFootfallAvg,
    footfallTrendRatio,
    currentOccupancyRate,
    seasonalFactor
  };

  return {
    valid: true,
    features: featureVector,
    featureObject
  };
}

/**
 * Calculates a federated medicine demand forecast from MedPulse operational signals.
 * Pure, deterministic, read-only inference function.
 *
 * @param {Object} context - Feature inputs or MedPulse operational signals
 * @param {Object} [options={}] - Optional model override or precision configuration
 * @returns {Object} federatedForecastResult
 */
export function calculateFederatedDemandForecast(context, options = {}) {
  const model = options.model || FEDERATED_GLOBAL_MODEL;
  const modelType = options.modelType || FEDERATED_MODEL_METADATA.modelType;
  const modelVersion = model.modelVersion || FEDERATED_MODEL_METADATA.modelVersion;

  const extraction = extractFederatedFeatures(context);

  if (!extraction.valid) {
    return {
      available: false,
      modelType,
      modelVersion,
      forecastDemand: null,
      dataStatus: 'INSUFFICIENT_DATA',
      reason: extraction.error,
      featureNames: [...FEATURE_NAMES]
    };
  }

  const rawPrediction = predict(model, extraction.features);

  if (typeof rawPrediction !== 'number' || !Number.isFinite(rawPrediction)) {
    return {
      available: false,
      modelType,
      modelVersion,
      forecastDemand: null,
      dataStatus: 'INSUFFICIENT_DATA',
      reason: 'Inference produced non-finite prediction',
      featureNames: [...FEATURE_NAMES]
    };
  }

  // Round forecast to 4 decimal places for clean deterministic representation
  const forecastDemand = Number(rawPrediction.toFixed(4));

  return {
    available: true,
    modelType,
    modelVersion,
    forecastDemand,
    featureNames: [...FEATURE_NAMES],
    features: extraction.featureObject,
    dataStatus: 'AVAILABLE'
  };
}

/**
 * Compares a deterministic demand forecast with a federated demand forecast.
 *
 * SAFETY INVARIANT:
 * - This comparison is purely explanatory, observational, and non-authoritative.
 * - It MUST NOT alter, override, or influence deterministic risk assessments.
 *
 * @param {number|Object} deterministic - Deterministic demand (number or object containing averageDailyDemand / predicted7DayDemand / demand)
 * @param {number|Object} federated - Federated forecast result (from calculateFederatedDemandForecast) or numeric demand
 * @returns {Object} Forecast comparison object
 */
export function compareDemandForecasts(deterministic, federated) {
  // 1. Extract deterministic demand value
  let detDemand = null;
  if (typeof deterministic === 'number' && Number.isFinite(deterministic)) {
    detDemand = deterministic;
  } else if (deterministic && typeof deterministic === 'object') {
    if (typeof deterministic.averageDailyDemand === 'number' && Number.isFinite(deterministic.averageDailyDemand)) {
      detDemand = deterministic.averageDailyDemand;
    } else if (typeof deterministic.demand === 'number' && Number.isFinite(deterministic.demand)) {
      detDemand = deterministic.demand;
    } else if (typeof deterministic.predicted7DayDemand === 'number' && Number.isFinite(deterministic.predicted7DayDemand)) {
      detDemand = deterministic.predicted7DayDemand;
    } else if (typeof deterministic.totalForecast === 'number' && Number.isFinite(deterministic.totalForecast)) {
      detDemand = deterministic.totalForecast;
    }
  }

  // 2. Extract federated demand value
  let fedDemand = null;
  let isAvailable = false;
  if (typeof federated === 'number' && Number.isFinite(federated)) {
    fedDemand = federated;
    isAvailable = true;
  } else if (federated && typeof federated === 'object') {
    if (federated.available === true && typeof federated.forecastDemand === 'number' && Number.isFinite(federated.forecastDemand)) {
      fedDemand = federated.forecastDemand;
      isAvailable = true;
    }
  }

  // 3. Handle unavailable / incomplete data
  if (detDemand === null || !isAvailable || fedDemand === null) {
    return {
      deterministicDemand: detDemand,
      federatedDemand: fedDemand,
      divergence: null,
      absoluteDifference: null,
      relativeDifference: null,
      direction: 'UNAVAILABLE',
      summary: 'Federated comparison unavailable due to missing or insufficient forecast data'
    };
  }

  // 4. Calculate deterministic vs federated divergence
  const divergence = Number((fedDemand - detDemand).toFixed(4));
  const absoluteDifference = Number(Math.abs(divergence).toFixed(4));
  const relativeDifference = detDemand !== 0 ? Number((divergence / detDemand).toFixed(4)) : null;

  let direction = 'ALIGNED';
  if (absoluteDifference < 0.0001) {
    direction = 'ALIGNED';
  } else if (fedDemand > detDemand) {
    direction = 'HIGHER';
  } else {
    direction = 'LOWER';
  }

  return {
    deterministicDemand: detDemand,
    federatedDemand: fedDemand,
    divergence,
    absoluteDifference,
    relativeDifference,
    direction,
    summary: direction === 'ALIGNED'
      ? 'Federated forecast is aligned with deterministic forecast'
      : `Federated forecast is ${absoluteDifference} units ${direction.toLowerCase()} than deterministic forecast`
  };
}

/**
 * Integrates the federated demand forecast alongside the authoritative deterministic medicine risk result.
 *
 * CRITICAL ARCHITECTURE RULE:
 * - The deterministic risk result remains the sole authoritative safety layer.
 * - The federated forecast is an additive predictive signal only.
 * - Risk level (SAFE / AT_RISK / CRITICAL), stock-out dates, days remaining, shortages,
 *   and transfer determinations are NEVER altered by the federated forecast.
 *
 * @param {Object} deterministicRisk - Output from predictStockOut or deterministic risk engine
 * @param {Object|null} [operationalContext=null] - Operational context for federated feature extraction
 * @param {Object} [options={}] - Options passed to calculateFederatedDemandForecast
 * @returns {Object} Enriched medicine risk object with deterministic and federated signals
 */
export function integrateFederatedMedicineRisk(deterministicRisk, operationalContext = null, options = {}) {
  if (!deterministicRisk || typeof deterministicRisk !== 'object') {
    throw new Error('deterministicRisk must be a valid non-null object');
  }

  // If deterministicRisk already has an error, preserve it unchanged
  if (deterministicRisk.error) {
    return {
      ...deterministicRisk,
      deterministicRisk: 'UNKNOWN',
      deterministicForecast: null,
      federatedForecast: null,
      forecastComparison: null
    };
  }

  // Authoritative deterministic risk classification
  const deterministicRiskLevel = deterministicRisk.riskLevel || 'UNKNOWN';

  // Obtain federated forecast
  const federatedForecast = operationalContext
    ? calculateFederatedDemandForecast(operationalContext, options)
    : {
        available: false,
        modelType: options.modelType || FEDERATED_MODEL_METADATA.modelType,
        modelVersion: (options.model && options.model.modelVersion) || FEDERATED_MODEL_METADATA.modelVersion,
        forecastDemand: null,
        dataStatus: 'INSUFFICIENT_DATA',
        reason: 'Operational context was not provided',
        featureNames: [...FEATURE_NAMES]
      };

  // Extract deterministic demand for comparison (averageDailyDemand or predicted7DayDemand)
  const detDemand = deterministicRisk.averageDailyDemand !== undefined
    ? deterministicRisk.averageDailyDemand
    : (deterministicRisk.predicted7DayDemand !== undefined ? deterministicRisk.predicted7DayDemand : null);

  const forecastComparison = compareDemandForecasts(detDemand, federatedForecast);

  return {
    ...deterministicRisk,
    // Preserve authoritative deterministic risk fields
    riskLevel: deterministicRiskLevel,
    deterministicRisk: deterministicRiskLevel,
    deterministicForecast: {
      predicted7DayDemand: deterministicRisk.predicted7DayDemand ?? null,
      averageDailyDemand: deterministicRisk.averageDailyDemand ?? null,
      currentStock: deterministicRisk.currentStock ?? null,
      estimatedDaysRemaining: deterministicRisk.estimatedDaysRemaining ?? null,
      stockOutDate: deterministicRisk.stockOutDate ?? null,
      riskLevel: deterministicRiskLevel
    },
    federatedForecast,
    forecastComparison
  };
}
