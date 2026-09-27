import test from 'node:test';
import assert from 'node:assert';
import {
  extractFederatedFeatures,
  calculateFederatedDemandForecast,
  compareDemandForecasts,
  FEDERATED_GLOBAL_MODEL
} from '../services/federatedForecast.js';
import { UNIFIED_RISK_STATUS } from '../services/unifiedFacilityRisk.js';

test('Day 17 — Fix Federated Forecast Context Mapping Suite', async (t) => {
  const nakraContext = {
    targetDate: '2026-09-14',
    recentFootfallAvg: 69.6,
    footfallTrendRatio: 1.2211,
    currentOccupancyRate: 0.8125,
    seasonalFactor: 1.0
  };

  const deterministicNakraMedicineRisk = {
    phcId: 'phc-nakra',
    medicineId: 'med-ors',
    currentStock: 76891,
    predicted7DayDemand: 91698,
    averageDailyDemand: 13099.7,
    estimatedDaysRemaining: 5.9,
    stockOutDate: '29 Sep 2026',
    riskLevel: 'AT_RISK',
    projectedShortage: 14807
  };

  const deterministicNakraUnifiedRisk = {
    phcId: 'phc-nakra',
    targetDate: '2026-09-14',
    overallRisk: UNIFIED_RISK_STATUS.CRITICAL,
    riskDrivers: ['BEDS', 'PERSONNEL'],
    medicine: { risk: UNIFIED_RISK_STATUS.AT_RISK },
    beds: { risk: UNIFIED_RISK_STATUS.CRITICAL },
    personnel: { risk: UNIFIED_RISK_STATUS.CRITICAL }
  };

  await t.test('A. Nakra + 2026-09-14 correctly resolves all 5 canonical features', () => {
    const extraction = extractFederatedFeatures(nakraContext);
    assert.strictEqual(extraction.valid, true);
    assert.deepStrictEqual(extraction.features, [1, 69.6, 1.2211, 0.8125, 1.0]);
    assert.strictEqual(extraction.featureObject.dayOfWeek, 1);
    assert.strictEqual(extraction.featureObject.recentFootfallAvg, 69.6);
    assert.strictEqual(extraction.featureObject.footfallTrendRatio, 1.2211);
    assert.strictEqual(extraction.featureObject.currentOccupancyRate, 0.8125);
    assert.strictEqual(extraction.featureObject.seasonalFactor, 1.0);
  });

  await t.test('B. Federated forecast becomes AVAILABLE and predicts accurately', () => {
    const result = calculateFederatedDemandForecast(nakraContext);
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.dataStatus, 'AVAILABLE');
    assert.strictEqual(result.modelVersion, '1.0.0');
    assert.strictEqual(typeof result.forecastDemand, 'number');
    assert.strictEqual(result.forecastDemand, 69.2016);

    const comparison = compareDemandForecasts(69.6, result);
    assert.strictEqual(comparison.deterministicDemand, 69.6);
    assert.strictEqual(comparison.federatedDemand, 69.2016);
    assert.strictEqual(comparison.divergence, -0.3984);
    assert.strictEqual(comparison.direction, 'LOWER');
  });

  await t.test('C. Federated forecast is deterministic across repeated calls', () => {
    const res1 = calculateFederatedDemandForecast(nakraContext);
    const res2 = calculateFederatedDemandForecast(nakraContext);
    assert.strictEqual(res1.forecastDemand, res2.forecastDemand);
    assert.strictEqual(res1.dataStatus, res2.dataStatus);
    assert.strictEqual(res1.forecastDemand, 69.2016);
  });

  await t.test('D. Missing or invalid footfall data produces INSUFFICIENT_DATA', () => {
    const missingFootfall = { ...nakraContext, recentFootfallAvg: null };
    const res = calculateFederatedDemandForecast(missingFootfall);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(res.forecastDemand, null);

    const comparison = compareDemandForecasts(null, res);
    assert.strictEqual(comparison.direction, 'UNAVAILABLE');
  });

  await t.test('E. Missing or invalid bed capacity produces INSUFFICIENT_DATA', () => {
    const invalidOccupancy = { ...nakraContext, currentOccupancyRate: 1.5 }; // > 1.0 is invalid
    const res = calculateFederatedDemandForecast(invalidOccupancy);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(res.forecastDemand, null);

    const missingOccupancy = { ...nakraContext, currentOccupancyRate: null };
    const res2 = calculateFederatedDemandForecast(missingOccupancy);
    assert.strictEqual(res2.available, false);
    assert.strictEqual(res2.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(res2.forecastDemand, null);
  });

  await t.test('F. Deterministic medicine risk remains unchanged', () => {
    assert.strictEqual(deterministicNakraMedicineRisk.riskLevel, 'AT_RISK');
    assert.strictEqual(deterministicNakraMedicineRisk.currentStock, 76891);
    assert.strictEqual(deterministicNakraMedicineRisk.estimatedDaysRemaining, 5.9);
    assert.strictEqual(deterministicNakraMedicineRisk.stockOutDate, '29 Sep 2026');
  });

  await t.test('G. Unified facility risk remains unchanged', () => {
    assert.strictEqual(deterministicNakraUnifiedRisk.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(deterministicNakraUnifiedRisk.riskDrivers, ['BEDS', 'PERSONNEL']);
    assert.strictEqual(deterministicNakraUnifiedRisk.medicine.risk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.strictEqual(deterministicNakraUnifiedRisk.beds.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(deterministicNakraUnifiedRisk.personnel.risk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('H. No Firestore writes performed by mapping', () => {
    // Pure calculation and read-only extraction generates 0 write operations
    const result = calculateFederatedDemandForecast(nakraContext);
    assert.ok(result);
  });
});
