import { predictStockOut, getFootfallStats } from './db.js';
import { forecastBedDemand } from './bedForecast.js';

export async function getEmergencyReadinessSignals(phcId, options = {}) {
  const { medicineId, admissionRate = 8 } = options;
  
  let footfall = null;
  let footfallError = null;
  try {
    footfall = await getFootfallStats(phcId);
  } catch (e) {
    footfallError = e;
  }

  let bedForecast = null;
  let bedError = null;
  try {
    bedForecast = await forecastBedDemand(phcId, admissionRate);
  } catch (e) {
    bedError = e;
  }

  let medOut = null;
  let medError = null;
  if (medicineId) {
    try {
      medOut = await predictStockOut(phcId, medicineId);
    } catch (e) {
      medError = e;
    }
  }

  return calculateEmergencyReadiness(phcId, medicineId, footfall, footfallError, bedForecast, bedError, medOut, medError);
}

export function calculateEmergencyReadiness(phcId, medicineId, footfall, footfallError, bedForecast, bedError, medOut, medError) {
  const result = {
    phcId,
    medicine: { status: 'SAFE', daysUntilStockout: null, shortageQuantity: 0, dataStatus: 'UNAVAILABLE' },
    beds: { currentStatus: 'CAPACITY_AVAILABLE', forecastStatus: 'CAPACITY_AVAILABLE', availableBeds: 0, capacityMargin: 0, earliestPredictedShortage: null, dataStatus: 'AVAILABLE' },
    footfall: { todayPatients: 0, last7DaysAvg: 0, prev7DaysAvg: 0, trend: 'STABLE', dataStatus: 'AVAILABLE' },
    overallStatus: 'SAFE',
    reasons: [],
    primaryReason: null
  };

  let pressureSignals = 0;

  // 1. FOOTFALL
  if (footfallError) {
    result.footfall.dataStatus = 'ERROR';
  } else if (!footfall || footfall.error || typeof footfall.todayPatients === 'undefined') {
    result.footfall.dataStatus = 'INSUFFICIENT_DATA';
  } else {
    result.footfall.todayPatients = footfall.todayPatients;
    result.footfall.last7DaysAvg = footfall.last7DaysAvg;
    result.footfall.prev7DaysAvg = footfall.prev7DaysAvg;
    result.footfall.trend = footfall.trend || 'STABLE';
    if (result.footfall.trend === 'INCREASING') {
      pressureSignals++;
      result.reasons.push("Footfall volume is INCREASING.");
    }
  }

  // 2. BEDS
  if (bedError) {
    result.beds.dataStatus = 'ERROR';
  } else if (!bedForecast || bedForecast.overallStatus === 'INSUFFICIENT_DATA') {
    result.beds.dataStatus = 'INSUFFICIENT_DATA';
  } else {
    result.beds.availableBeds = bedForecast.currentAvailableBeds;
    let currentCapacityMargin = 0;
    if (bedForecast.forecast && bedForecast.forecast.length > 0) {
      currentCapacityMargin = bedForecast.forecast[0].capacityMargin;
    }
    let currentStatus = 'CAPACITY_AVAILABLE';
    if (currentCapacityMargin < 0) currentStatus = 'OVER_CAPACITY';
    else if (currentCapacityMargin === 0) currentStatus = 'AT_RISK';

    result.beds.currentStatus = currentStatus;
    result.beds.forecastStatus = bedForecast.overallStatus;
    result.beds.capacityMargin = currentCapacityMargin;
    result.beds.earliestPredictedShortage = bedForecast.earliestPredictedShortage;

    if (result.beds.forecastStatus === 'OVER_CAPACITY' || result.beds.currentStatus === 'OVER_CAPACITY') {
      pressureSignals++;
      if (result.beds.earliestPredictedShortage) {
        result.reasons.push(`Bed capacity projected OVER_CAPACITY on ${result.beds.earliestPredictedShortage}.`);
      } else {
        result.reasons.push("Bed capacity is projected OVER_CAPACITY.");
      }
    } else if (result.beds.forecastStatus === 'AT_RISK' || result.beds.currentStatus === 'AT_RISK') {
      pressureSignals++;
      result.reasons.push("Bed capacity is currently AT_RISK.");
    }
  }

  // 3. MEDICINE
  if (!medicineId) {
    result.medicine.dataStatus = 'UNAVAILABLE';
  } else if (medError) {
    result.medicine.dataStatus = 'ERROR';
  } else if (!medOut || medOut.error) {
    result.medicine.dataStatus = 'INSUFFICIENT_DATA';
  } else {
    result.medicine.dataStatus = 'AVAILABLE';
    result.medicine.status = medOut.riskLevel;
    result.medicine.daysUntilStockout = medOut.estimatedDaysRemaining;
    result.medicine.shortageQuantity = medOut.projectedShortage;

    if (result.medicine.status === 'CRITICAL') {
      pressureSignals++;
      if (medOut.stockOutDate) {
        result.reasons.push(`Medicine stock-out risk is CRITICAL (expected by ${medOut.stockOutDate}).`);
      } else {
        result.reasons.push("Medicine stock-out risk is CRITICAL.");
      }
    } else if (result.medicine.status === 'AT_RISK') {
      pressureSignals++;
      result.reasons.push("Medicine stock-out risk detected (AT_RISK).");
    }
  }

  // 4. OVERALL READINESS
  if (
    result.footfall.dataStatus === 'INSUFFICIENT_DATA' && 
    result.beds.dataStatus === 'INSUFFICIENT_DATA' && 
    (result.medicine.dataStatus === 'INSUFFICIENT_DATA' || result.medicine.dataStatus === 'UNAVAILABLE')
  ) {
    result.overallStatus = 'INSUFFICIENT_DATA';
    result.reasons.push("Insufficient historical data to calculate readiness.");
    result.primaryReason = "Insufficient historical data to calculate readiness.";
    return result;
  }

  let isCritical = false;
  let isWarning = false;

  if (result.medicine.status === 'CRITICAL' || result.beds.forecastStatus === 'OVER_CAPACITY' || result.beds.currentStatus === 'OVER_CAPACITY') {
    isCritical = true;
  }
  if (pressureSignals >= 2) {
    isCritical = true;
  }

  if (!isCritical && pressureSignals === 1) {
    isWarning = true;
  }

  if (isCritical) {
    result.overallStatus = 'CRITICAL';
  } else if (isWarning) {
    result.overallStatus = 'WARNING';
  } else {
    result.overallStatus = 'SAFE';
  }

  // 5. PRIMARY REASON
  if (result.reasons.length > 0) {
    if (result.medicine.status === 'CRITICAL') {
      result.primaryReason = result.reasons.find(r => r.includes('CRITICAL') && r.includes('Medicine')) || result.reasons[0];
    } else if (result.beds.forecastStatus === 'OVER_CAPACITY' || result.beds.currentStatus === 'OVER_CAPACITY') {
      result.primaryReason = result.reasons.find(r => r.includes('OVER_CAPACITY')) || result.reasons[0];
    } else if (pressureSignals >= 2) {
      result.primaryReason = "Multiple simultaneous capacity pressure signals detected.";
    } else if (result.medicine.status === 'AT_RISK') {
      result.primaryReason = result.reasons.find(r => r.includes('AT_RISK') && r.includes('Medicine')) || result.reasons[0];
    } else if (result.beds.forecastStatus === 'AT_RISK' || result.beds.currentStatus === 'AT_RISK') {
      result.primaryReason = result.reasons.find(r => r.includes('AT_RISK') && r.includes('Bed')) || result.reasons[0];
    } else if (result.footfall.trend === 'INCREASING') {
      result.primaryReason = result.reasons.find(r => r.includes('INCREASING')) || result.reasons[0];
    } else {
      result.primaryReason = result.reasons[0];
    }
  } else if (result.overallStatus === 'SAFE') {
    result.primaryReason = "All monitored operational metrics are stable.";
  }

  return result;
}
