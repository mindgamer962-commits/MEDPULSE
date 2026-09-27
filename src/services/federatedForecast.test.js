import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateFederatedDemandForecast,
  extractFederatedFeatures,
  FEDERATED_GLOBAL_MODEL,
  FEDERATED_MODEL_METADATA
} from './federatedForecast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Day 17 — Step 1: Federated Demand Forecast Production Adapter Suite', async (t) => {

  await t.test('1. Valid explicit feature inputs generate correct deterministic forecast', () => {
    // Evaluation Sample 1 (Gujarat Profile): [1, 48.5, 1.12, 0.72, 1.05]
    const context = {
      dayOfWeek: 1,
      recentFootfallAvg: 48.5,
      footfallTrendRatio: 1.12,
      currentOccupancyRate: 0.72,
      seasonalFactor: 1.05
    };

    const result = calculateFederatedDemandForecast(context);

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.modelType, 'FEDERATED');
    assert.strictEqual(result.modelVersion, '1.0.0');
    assert.strictEqual(result.dataStatus, 'AVAILABLE');
    assert.strictEqual(typeof result.forecastDemand, 'number');
    assert.strictEqual(result.forecastDemand, 54.775); // Exactly 54.7750
    assert.deepStrictEqual(result.featureNames, [
      'dayOfWeek',
      'recentFootfallAvg',
      'footfallTrendRatio',
      'currentOccupancyRate',
      'seasonalFactor'
    ]);
  });

  await t.test('2. Deterministic repeated inference produces identical results', () => {
    const context = {
      dayOfWeek: 2,
      recentFootfallAvg: 68.0,
      footfallTrendRatio: 1.25,
      currentOccupancyRate: 0.85,
      seasonalFactor: 1.20
    };

    const res1 = calculateFederatedDemandForecast(context);
    const res2 = calculateFederatedDemandForecast(context);

    assert.deepStrictEqual(res1, res2);
    assert.strictEqual(res1.forecastDemand, res2.forecastDemand);
  });

  await t.test('3. MedPulse operational signal extraction maps features accurately', () => {
    const operationalContext = {
      targetDate: '2026-09-14', // Monday -> dayOfWeek = 1
      footfallStats: {
        avgDaily: 52.0,
        trendRatio: 1.15
      },
      bedData: {
        beds: {
          total_beds: 100,
          available_beds: 25 // occupied = 75 -> occupancyRate = 0.75
        }
      },
      seasonalFactor: 1.06
    };

    const extraction = extractFederatedFeatures(operationalContext);
    assert.strictEqual(extraction.valid, true);
    assert.deepStrictEqual(extraction.features, [1, 52.0, 1.15, 0.75, 1.06]);

    const forecast = calculateFederatedDemandForecast(operationalContext);
    assert.strictEqual(forecast.available, true);
    assert.strictEqual(forecast.dataStatus, 'AVAILABLE');
    assert.ok(forecast.forecastDemand > 0);
  });

  await t.test('4. Correct 5-feature canonical ordering is strictly preserved', () => {
    assert.deepStrictEqual(FEDERATED_MODEL_METADATA.featureNames, [
      'dayOfWeek',
      'recentFootfallAvg',
      'footfallTrendRatio',
      'currentOccupancyRate',
      'seasonalFactor'
    ]);
    assert.strictEqual(FEDERATED_GLOBAL_MODEL.weights.length, 5);
  });

  await t.test('5. Missing or invalid dayOfWeek returns INSUFFICIENT_DATA without crashing', () => {
    const result1 = calculateFederatedDemandForecast({
      recentFootfallAvg: 50,
      footfallTrendRatio: 1.1,
      currentOccupancyRate: 0.7,
      seasonalFactor: 1.0
    });
    assert.strictEqual(result1.available, false);
    assert.strictEqual(result1.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(result1.forecastDemand, null);
    assert.ok(result1.reason.includes('dayOfWeek'));

    const result2 = calculateFederatedDemandForecast({
      dayOfWeek: 7, // Invalid day of week (must be 0-6)
      recentFootfallAvg: 50,
      footfallTrendRatio: 1.1,
      currentOccupancyRate: 0.7,
      seasonalFactor: 1.0
    });
    assert.strictEqual(result2.available, false);
    assert.strictEqual(result2.dataStatus, 'INSUFFICIENT_DATA');
  });

  await t.test('6. Missing or negative footfall returns INSUFFICIENT_DATA', () => {
    const result = calculateFederatedDemandForecast({
      dayOfWeek: 1,
      recentFootfallAvg: -10, // Invalid negative footfall
      footfallTrendRatio: 1.1,
      currentOccupancyRate: 0.7,
      seasonalFactor: 1.0
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.dataStatus, 'INSUFFICIENT_DATA');
    assert.ok(result.reason.includes('recentFootfallAvg'));
  });

  await t.test('7. Missing or invalid occupancy rate returns INSUFFICIENT_DATA', () => {
    const result = calculateFederatedDemandForecast({
      dayOfWeek: 1,
      recentFootfallAvg: 50,
      footfallTrendRatio: 1.1,
      currentOccupancyRate: 1.5, // Invalid > 1.0
      seasonalFactor: 1.0
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.dataStatus, 'INSUFFICIENT_DATA');
    assert.ok(result.reason.includes('currentOccupancyRate'));
  });

  await t.test('8. Null or undefined context returns INSUFFICIENT_DATA gracefully', () => {
    const resultNull = calculateFederatedDemandForecast(null);
    assert.strictEqual(resultNull.available, false);
    assert.strictEqual(resultNull.dataStatus, 'INSUFFICIENT_DATA');

    const resultUndef = calculateFederatedDemandForecast(undefined);
    assert.strictEqual(resultUndef.available, false);
    assert.strictEqual(resultUndef.dataStatus, 'INSUFFICIENT_DATA');
  });

  await t.test('9. Critical Safety Boundary: No risk classification or stockout calculations', () => {
    const context = {
      dayOfWeek: 1,
      recentFootfallAvg: 50,
      footfallTrendRatio: 1.1,
      currentOccupancyRate: 0.7,
      seasonalFactor: 1.0
    };
    const result = calculateFederatedDemandForecast(context);

    // Assert that the adapter does not compute risk tiers or transfers
    assert.strictEqual(result.riskStatus, undefined);
    assert.strictEqual(result.stockOutDate, undefined);
    assert.strictEqual(result.critical, undefined);
    assert.strictEqual(result.recommendedTransferQuantity, undefined);
  });

  await t.test('10. Zero Firestore imports or writes in federatedForecast adapter', () => {
    const code = fs.readFileSync(path.resolve(__dirname, 'federatedForecast.js'), 'utf-8');
    assert.ok(!code.includes("from 'firebase"));
    assert.ok(!code.includes('firebase/firestore'));
    assert.ok(!code.includes('getFirestore'));
    assert.ok(!code.includes('addDoc'));
    assert.ok(!code.includes('setDoc'));
    assert.ok(!code.includes('updateDoc'));
  });

  await t.test('11. Zero Network/HTTP calls or Gemini imports in federatedForecast adapter', () => {
    const code = fs.readFileSync(path.resolve(__dirname, 'federatedForecast.js'), 'utf-8');
    assert.ok(!code.includes('fetch('));
    assert.ok(!code.includes('axios'));
    assert.ok(!code.includes('@google/genai'));
    assert.ok(!code.includes('geminiContext'));
  });

  await t.test('12. Existing deterministic forecasting in db.js and bedForecast.js remains intact', () => {
    const dbCode = fs.readFileSync(path.resolve(__dirname, 'db.js'), 'utf-8');
    const bedCode = fs.readFileSync(path.resolve(__dirname, 'bedForecast.js'), 'utf-8');

    assert.ok(dbCode.includes('export async function forecastDemand'));
    assert.ok(dbCode.includes('export async function predictStockOut'));
    assert.ok(bedCode.includes('export function calculateBedForecast'));
  });
});
