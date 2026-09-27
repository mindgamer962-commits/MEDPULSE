import { getDailyFootfall } from './db.js';
import { getPHCBedAvailability } from './beds.js';

export async function forecastBedDemand(phcId, admissionRate = 8) {
  // 1. Fetch raw data
  const allFfs = await getDailyFootfall(phcId);
  const bedData = await getPHCBedAvailability(phcId);
  return calculateBedForecast(phcId, admissionRate, allFfs, bedData);
}

export function calculateBedForecast(phcId, admissionRate, allFfs, bedData) {
  // 2. Validate bed availability
  if (!bedData || !bedData.data_available || !bedData.beds) {
    return {
      phcId,
      currentAvailableBeds: 0,
      admissionRate,
      forecast: [],
      overallStatus: 'INSUFFICIENT_DATA',
      earliestPredictedShortage: null
    };
  }
  
  const currentAvailableBeds = bedData.beds.available_beds;

  // 3. Clean historical records
  const dateMap = new Map();
  let validRecordCount = 0;

  for (const f of allFfs) {
    if (f.phc_id !== phcId) continue;
    
    // Ignore invalid/missing date
    if (!f.date) continue;
    
    let dateStr;
    if (typeof f.date.toDate === 'function') {
      dateStr = f.date.toDate().toISOString().split('T')[0];
    } else if (f.date instanceof Date) {
      dateStr = f.date.toISOString().split('T')[0];
    } else if (typeof f.date === 'string') {
      try {
        dateStr = new Date(f.date).toISOString().split('T')[0];
      } catch (e) {
        continue;
      }
    } else {
      continue; // Unrecognized format
    }

    const count = f.patient_count;
    // Ignore negative/non-numeric
    if (typeof count !== 'number' || isNaN(count) || count < 0) continue;

    // Outlier > 1000
    if (count > 1000) continue;

    // Retain highest valid patient_count for duplicates
    if (dateMap.has(dateStr)) {
      if (count > dateMap.get(dateStr)) {
        dateMap.set(dateStr, count);
      }
    } else {
      dateMap.set(dateStr, count);
      validRecordCount++;
    }
  }

  // 4. Require at least 14 valid historical records
  if (validRecordCount < 14) {
    return {
      phcId,
      currentAvailableBeds,
      admissionRate,
      forecast: [],
      overallStatus: 'INSUFFICIENT_DATA',
      earliestPredictedShortage: null
    };
  }

  // 5. Calculate recent 7-day and previous 7-day averages
  const now = new Date(); // In a real app we'd mock time, but for the logic tests we can dynamically build historical dates relative to now
  
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    recentDays.push(d.toISOString().split('T')[0]);
  }
  
  const prevDays = [];
  for (let i = 7; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    prevDays.push(d.toISOString().split('T')[0]);
  }

  let recentSum = 0;
  let recentCount = 0;
  for (const date of recentDays) {
    if (dateMap.has(date)) {
      recentSum += dateMap.get(date);
      recentCount++;
    }
  }

  let prevSum = 0;
  let prevCount = 0;
  for (const date of prevDays) {
    if (dateMap.has(date)) {
      prevSum += dateMap.get(date);
      prevCount++;
    }
  }

  const recentAvgFf = recentCount > 0 ? (recentSum / recentCount) : 0;
  const prevAvgFf = prevCount > 0 ? (prevSum / prevCount) : 0;

  // Trend factor
  let trendRatio = 1.0;
  if (prevAvgFf > 0 && recentAvgFf > 0) {
    trendRatio = recentAvgFf / prevAvgFf;
  } else if (prevAvgFf === 0 && recentAvgFf > 0) {
    trendRatio = 2.5;
  }

  // 6. Clamp trend ratio
  const clampedTrendRatio = Math.max(0.5, Math.min(2.5, trendRatio));

  // 7. Produce 3-day future footfall forecast
  const forecast = [];
  let overallStatus = 'CAPACITY_AVAILABLE';
  let earliestPredictedShortage = null;

  for (let d = 1; d <= 3; d++) {
    const forecastDate = new Date(now);
    forecastDate.setDate(now.getDate() + d);
    const dateStr = forecastDate.toISOString().split('T')[0];

    let expectedFootfall = 0;
    if (recentAvgFf > 0) {
        expectedFootfall = Math.round(recentAvgFf * (1 + (clampedTrendRatio - 1) * (d / 3)));
    }

    // 8. Convert to estimated bed demand
    const expectedBedDemand = Math.round(expectedFootfall * (admissionRate / 100));

    // 9. Compare expected demand against CURRENT available beds
    const capacityMargin = currentAvailableBeds - expectedBedDemand;

    let dayStatus = 'CAPACITY_AVAILABLE';
    if (capacityMargin < 0) {
      dayStatus = 'OVER_CAPACITY';
    } else if (capacityMargin === 0) {
      dayStatus = 'AT_RISK';
    }

    forecast.push({
      day: d,
      date: dateStr,
      expectedFootfall,
      expectedBedDemand,
      availableBeds: currentAvailableBeds,
      capacityMargin,
      status: dayStatus
    });

    // 10. Earliest predicted shortage
    if (expectedBedDemand > currentAvailableBeds && earliestPredictedShortage === null) {
      earliestPredictedShortage = dateStr;
    }
  }

  // 11. Overall status
  if (forecast.some(f => f.status === 'OVER_CAPACITY')) {
    overallStatus = 'OVER_CAPACITY';
  } else if (forecast.some(f => f.status === 'AT_RISK')) {
    overallStatus = 'AT_RISK';
  }

  // 14. Output
  return {
    phcId,
    currentAvailableBeds,
    admissionRate,
    forecast,
    overallStatus,
    earliestPredictedShortage,
    // Add these purely for testing visibility, they are harmless in prod
    _debug: { recentAvgFf, prevAvgFf, trendRatio, clampedTrendRatio }
  };
}
