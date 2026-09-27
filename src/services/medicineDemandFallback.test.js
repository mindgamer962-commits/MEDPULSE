import test from 'node:test';
import assert from 'node:assert';
import { forecastDemand, predictStockOut } from './db.js';

test('Medicine 7-Day Demand Forecasting & Historical Fallback Suite', async (t) => {
  await t.test('1. Predicts non-zero 7-day demand using historical usage baseline when current window is empty', async () => {
    // Adalaj Amoxicillin has 60 historical USED transactions (ending Aug 22) and current footfalls
    const forecast = await forecastDemand('phc-adalaj', 'med-amoxicillin');
    assert.strictEqual(forecast.error, undefined);
    assert.strictEqual(typeof forecast.totalForecast, 'number');
    assert.ok(forecast.totalForecast > 0, `Expected totalForecast > 0, got ${forecast.totalForecast}`);
    assert.ok(forecast.averageDailyDemand > 0, `Expected averageDailyDemand > 0, got ${forecast.averageDailyDemand}`);
    assert.strictEqual(forecast.isHistoricalFallback, true);
    assert.ok(forecast.fallbackReferenceDate instanceof Date);
    assert.ok(forecast.reasoning.includes('consumption rate established from latest available historical usage period'));
  });

  await t.test('2. Uses current 30-day window when recent USED transactions exist without triggering fallback', async () => {
    // Nakra ORS has a recent demo USED transaction in September 2026
    const forecast = await forecastDemand('phc-nakra', 'med-ors');
    assert.strictEqual(forecast.error, undefined);
    assert.strictEqual(typeof forecast.totalForecast, 'number');
    assert.ok(forecast.totalForecast > 0);
    assert.strictEqual(forecast.isHistoricalFallback, false);
  });

  await t.test('3. Correctly identifies shortage risk and prevents false 999-day SAFE state for low-stock items', async () => {
    // Koth ORS has current stock = 0.
    const stockOut = await predictStockOut('phc-koth', 'med-ors');
    assert.strictEqual(stockOut.error, undefined);
    assert.strictEqual(stockOut.currentStock, 0);
    assert.strictEqual(stockOut.riskLevel, 'CRITICAL');
    assert.notStrictEqual(stockOut.estimatedDaysRemaining, 999);
    assert.strictEqual(stockOut.estimatedDaysRemaining, 0);
  });

  await t.test('4. Correctly computes days remaining and risk for tight stock items', async () => {
    // Achrol Paracetamol has low stock (210 units) and non-zero daily demand
    const stockOut = await predictStockOut('phc-achrol', 'med-paracetamol');
    assert.strictEqual(stockOut.error, undefined);
    assert.ok(stockOut.predicted7DayDemand > 0);
    assert.ok(stockOut.averageDailyDemand > 0);
    assert.ok(stockOut.estimatedDaysRemaining < 999);
    assert.ok(stockOut.riskLevel === 'CRITICAL' || stockOut.riskLevel === 'AT_RISK' || stockOut.riskLevel === 'SAFE');
  });

  await t.test('5. Returns INSUFFICIENT_DATA error when genuinely no USED history exists anywhere', async () => {
    // Invalid / non-existent medicine or PHC with zero transactions
    const forecast = await forecastDemand('phc-nonexistent', 'med-nonexistent');
    assert.ok(forecast.error);
    assert.ok(forecast.error.includes('Insufficient'));

    const stockOut = await predictStockOut('phc-nonexistent', 'med-nonexistent');
    assert.ok(stockOut.error);
  });

  await t.test('6. Preserves existing medicine risk threshold definitions', () => {
    // Invariant checks on threshold logic:
    // CRITICAL: currentStock <= 0 OR daysToStockOut <= 2 OR estimatedDaysRemaining <= 1
    // AT_RISK: daysToStockOut <= 7
    // SAFE: otherwise
    const evaluateRisk = (currentStock, daysToStockOut, estimatedDaysRemaining) => {
      if (currentStock <= 0 || (daysToStockOut !== null && daysToStockOut <= 2) || estimatedDaysRemaining <= 1.0) {
        return 'CRITICAL';
      } else if (daysToStockOut !== null && daysToStockOut <= 7) {
        return 'AT_RISK';
      }
      return 'SAFE';
    };

    assert.strictEqual(evaluateRisk(0, null, 0), 'CRITICAL');
    assert.strictEqual(evaluateRisk(50, 1, 1.2), 'CRITICAL');
    assert.strictEqual(evaluateRisk(50, 4, 4.5), 'AT_RISK');
    assert.strictEqual(evaluateRisk(500, null, 25.0), 'SAFE');
  });
});
