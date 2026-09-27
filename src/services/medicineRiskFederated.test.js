import test from 'node:test';
import assert from 'node:assert';
import {
  compareDemandForecasts,
  integrateFederatedMedicineRisk,
  calculateFederatedDemandForecast,
  FEDERATED_GLOBAL_MODEL
} from './federatedForecast.js';
import { createLocalModel } from '../federated/models/linearRegression.js';

test('Day 17 Step 2: Federated Forecast → MedPulse Risk Engine Integration', async (t) => {

  const baseDeterministicRiskSafe = {
    phcId: 'phc_morbi_01',
    medicineId: 'amoxicillin_500mg',
    currentStock: 500,
    predicted7DayDemand: 140,
    averageDailyDemand: 20,
    estimatedDaysRemaining: 25.0,
    stockOutDate: null,
    riskLevel: 'SAFE',
    projectedShortage: 0
  };

  const baseDeterministicRiskAtRisk = {
    phcId: 'phc_palanpur_02',
    medicineId: 'paracetamol_500mg',
    currentStock: 120,
    predicted7DayDemand: 280,
    averageDailyDemand: 40,
    estimatedDaysRemaining: 3.0,
    stockOutDate: '26 Sep 2026',
    riskLevel: 'AT_RISK',
    projectedShortage: 0
  };

  const baseDeterministicRiskCritical = {
    phcId: 'phc_rajkot_03',
    medicineId: 'metformin_500mg',
    currentStock: 15,
    predicted7DayDemand: 210,
    averageDailyDemand: 30,
    estimatedDaysRemaining: 0.5,
    stockOutDate: '24 Sep 2026',
    riskLevel: 'CRITICAL',
    projectedShortage: 195
  };

  const validOperationalContext = {
    dayOfWeek: 1,
    recentFootfallAvg: 142,
    footfallTrendRatio: 1.02,
    currentOccupancyRate: 0.68,
    seasonalFactor: 1.15
  };

  await t.test('A. Federated forecast available: returns both signals and preserves deterministic risk', () => {
    const result = integrateFederatedMedicineRisk(baseDeterministicRiskAtRisk, validOperationalContext);

    // 1. Authoritative risk invariant preserved
    assert.strictEqual(result.riskLevel, 'AT_RISK');
    assert.strictEqual(result.deterministicRisk, 'AT_RISK');
    assert.strictEqual(result.currentStock, 120);
    assert.strictEqual(result.estimatedDaysRemaining, 3.0);
    assert.strictEqual(result.stockOutDate, '26 Sep 2026');

    // 2. Deterministic forecast exposed
    assert.deepStrictEqual(result.deterministicForecast, {
      predicted7DayDemand: 280,
      averageDailyDemand: 40,
      currentStock: 120,
      estimatedDaysRemaining: 3.0,
      stockOutDate: '26 Sep 2026',
      riskLevel: 'AT_RISK'
    });

    // 3. Federated signal present and valid (111.5401)
    assert.strictEqual(result.federatedForecast.available, true);
    assert.strictEqual(result.federatedForecast.dataStatus, 'AVAILABLE');
    assert.strictEqual(typeof result.federatedForecast.forecastDemand, 'number');
    assert.strictEqual(result.federatedForecast.forecastDemand, 111.5401);

    // 4. Forecast comparison computed
    assert.ok(result.forecastComparison);
    assert.strictEqual(result.forecastComparison.deterministicDemand, 40);
    assert.strictEqual(result.forecastComparison.federatedDemand, 111.5401);
    assert.strictEqual(result.forecastComparison.divergence, 71.5401);
    assert.strictEqual(result.forecastComparison.direction, 'HIGHER');
  });

  await t.test('B. Federated forecast unavailable: deterministic risk unchanged, no fabricated value', () => {
    const incompleteContext = {
      dayOfWeek: 1
      // missing recentFootfallAvg, footfallTrendRatio, etc.
    };

    const result = integrateFederatedMedicineRisk(baseDeterministicRiskSafe, incompleteContext);

    // 1. Authoritative risk unaffected
    assert.strictEqual(result.riskLevel, 'SAFE');
    assert.strictEqual(result.deterministicRisk, 'SAFE');
    assert.strictEqual(result.estimatedDaysRemaining, 25.0);

    // 2. Federated forecast is explicitly unavailable with null demand (no fake zeros or imputation)
    assert.strictEqual(result.federatedForecast.available, false);
    assert.strictEqual(result.federatedForecast.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(result.federatedForecast.forecastDemand, null);

    // 3. Forecast comparison indicates UNAVAILABLE
    assert.strictEqual(result.forecastComparison.direction, 'UNAVAILABLE');
    assert.strictEqual(result.forecastComparison.federatedDemand, null);
    assert.strictEqual(result.forecastComparison.divergence, null);
  });

  await t.test('B2. Operational context completely omitted: graceful fallback without crash', () => {
    const result = integrateFederatedMedicineRisk(baseDeterministicRiskCritical, null);

    assert.strictEqual(result.riskLevel, 'CRITICAL');
    assert.strictEqual(result.deterministicRisk, 'CRITICAL');
    assert.strictEqual(result.federatedForecast.available, false);
    assert.strictEqual(result.federatedForecast.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(result.forecastComparison.direction, 'UNAVAILABLE');
  });

  await t.test('C. Federated forecast HIGHER: deterministic risk is NOT escalated', () => {
    // Deterministic demand is 40, risk is AT_RISK.
    // Federated forecast is 65 (higher demand).
    const comparison = compareDemandForecasts(40, {
      available: true,
      forecastDemand: 65
    });

    assert.strictEqual(comparison.direction, 'HIGHER');
    assert.strictEqual(comparison.divergence, 25);
    assert.strictEqual(comparison.absoluteDifference, 25);
    assert.strictEqual(comparison.relativeDifference, 0.625);

    const higherModel = createLocalModel({ weights: [0, 0, 0, 0, 0], bias: 65 });
    const result = integrateFederatedMedicineRisk(baseDeterministicRiskAtRisk, validOperationalContext, {
      model: higherModel
    });

    // Deterministic risk MUST remain AT_RISK (not escalated to CRITICAL)
    assert.strictEqual(result.riskLevel, 'AT_RISK');
    assert.strictEqual(result.deterministicRisk, 'AT_RISK');
    assert.strictEqual(result.forecastComparison.direction, 'HIGHER');
    assert.strictEqual(result.forecastComparison.federatedDemand, 65);
    assert.strictEqual(result.forecastComparison.divergence, 25);
  });

  await t.test('D. Federated forecast LOWER: deterministic risk is NOT downgraded', () => {
    // Deterministic demand is 30, risk is CRITICAL.
    // Federated forecast is 5 (much lower demand).
    const comparison = compareDemandForecasts(30, {
      available: true,
      forecastDemand: 5
    });

    assert.strictEqual(comparison.direction, 'LOWER');
    assert.strictEqual(comparison.divergence, -25);
    assert.strictEqual(comparison.absoluteDifference, 25);
    assert.strictEqual(comparison.relativeDifference, -0.8333);

    const lowerModel = createLocalModel({ weights: [0, 0, 0, 0, 0], bias: 5 });
    const result = integrateFederatedMedicineRisk(baseDeterministicRiskCritical, validOperationalContext, {
      model: lowerModel
    });

    // Deterministic risk MUST remain CRITICAL (not downgraded to AT_RISK or SAFE)
    assert.strictEqual(result.riskLevel, 'CRITICAL');
    assert.strictEqual(result.deterministicRisk, 'CRITICAL');
    assert.strictEqual(result.forecastComparison.direction, 'LOWER');
    assert.strictEqual(result.forecastComparison.federatedDemand, 5);
    assert.strictEqual(result.forecastComparison.divergence, -25);
  });

  await t.test('E. Federated forecast exactly ALIGNED: reports alignment with zero divergence', () => {
    const comparison = compareDemandForecasts(40, {
      available: true,
      forecastDemand: 40
    });

    assert.strictEqual(comparison.direction, 'ALIGNED');
    assert.strictEqual(comparison.divergence, 0);
    assert.strictEqual(comparison.absoluteDifference, 0);
    assert.strictEqual(comparison.relativeDifference, 0);
    assert.ok(comparison.summary.includes('aligned'));
  });

  await t.test('F. Extreme disagreement: zero risk override', () => {
    // Scenario 1: Extreme high demand (10,000) on SAFE facility
    const extremeHighModel = createLocalModel({ weights: [0, 0, 0, 0, 0], bias: 10000 });
    const highResult = integrateFederatedMedicineRisk(baseDeterministicRiskSafe, validOperationalContext, {
      model: extremeHighModel
    });
    assert.strictEqual(highResult.riskLevel, 'SAFE');
    assert.strictEqual(highResult.deterministicRisk, 'SAFE');
    assert.strictEqual(highResult.forecastComparison.direction, 'HIGHER');
    assert.strictEqual(highResult.forecastComparison.divergence, 9980);

    // Scenario 2: Zero demand (0) on CRITICAL facility
    const zeroModel = createLocalModel({ weights: [0, 0, 0, 0, 0], bias: 0 });
    const zeroResult = integrateFederatedMedicineRisk(baseDeterministicRiskCritical, validOperationalContext, {
      model: zeroModel
    });
    assert.strictEqual(zeroResult.riskLevel, 'CRITICAL');
    assert.strictEqual(zeroResult.deterministicRisk, 'CRITICAL');
    assert.strictEqual(zeroResult.forecastComparison.direction, 'LOWER');
    assert.strictEqual(zeroResult.forecastComparison.divergence, -30);
  });

  await t.test('G. Deterministic stock-out calculation integrity check', () => {
    // Verify that the helper does not mutate the input object
    const originalInput = { ...baseDeterministicRiskAtRisk };
    const frozenInput = Object.freeze({ ...baseDeterministicRiskAtRisk });

    const result = integrateFederatedMedicineRisk(frozenInput, validOperationalContext);
    assert.strictEqual(result.riskLevel, originalInput.riskLevel);
    assert.strictEqual(result.currentStock, originalInput.currentStock);
    assert.strictEqual(result.predicted7DayDemand, originalInput.predicted7DayDemand);
    assert.strictEqual(result.stockOutDate, originalInput.stockOutDate);
  });

  await t.test('H. Error handling for erroneous deterministic risk input', () => {
    const errorInput = { error: 'Medicine not found in facility records' };
    const result = integrateFederatedMedicineRisk(errorInput, validOperationalContext);

    assert.strictEqual(result.error, 'Medicine not found in facility records');
    assert.strictEqual(result.federatedForecast, null);
    assert.strictEqual(result.forecastComparison, null);
  });

  await t.test('I. compareDemandForecasts accepts varied input shapes', () => {
    // Number vs number
    const c1 = compareDemandForecasts(50, 60);
    assert.strictEqual(c1.direction, 'HIGHER');
    assert.strictEqual(c1.divergence, 10);

    // Object vs result object
    const c2 = compareDemandForecasts({ averageDailyDemand: 25 }, { available: true, forecastDemand: 20 });
    assert.strictEqual(c2.direction, 'LOWER');
    assert.strictEqual(c2.divergence, -5);

    // Invalid numbers
    const c3 = compareDemandForecasts(NaN, 20);
    assert.strictEqual(c3.direction, 'UNAVAILABLE');
  });

});
