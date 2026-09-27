import test from 'node:test';
import assert from 'node:assert';
import { getFootfallStats } from './db.js';
import { calculateFederatedDemandForecast, extractFederatedFeatures } from './federatedForecast.js';

test('Day 17 — getFootfallStats Reference Date and Federated Evaluation Suite', async (t) => {

  await t.test('A. Explicit reference date calculates 7-day trailing windows accurately', async () => {
    // Adalaj has records in early/mid September 2026
    const stats = await getFootfallStats('phc-adalaj', '2026-09-14');
    assert.strictEqual(typeof stats.last7DaysAvg, 'number');
    assert.strictEqual(typeof stats.prev7DaysAvg, 'number');
    assert.strictEqual(stats.last7DaysAvg, 107);
    assert.strictEqual(stats.prev7DaysAvg, 88.6);
    assert.strictEqual(stats.trend, 'INCREASING');
  });

  await t.test('B. Existing no-argument behavior works with current date for backward compatibility', async () => {
    const stats = await getFootfallStats('phc-nakra');
    assert.ok(stats !== null);
    assert.ok('todayPatients' in stats);
    assert.ok('last7DaysTotal' in stats);
    assert.ok('last7DaysAvg' in stats);
    assert.ok('prev7DaysAvg' in stats);
    assert.ok('trend' in stats);
  });

  await t.test('C. Date object input produces identical results to YYYY-MM-DD string', async () => {
    const stringStats = await getFootfallStats('phc-adalaj', '2026-09-14');
    const dateObj = new Date(2026, 8, 14); // Sep 14, 2026
    const dateStats = await getFootfallStats('phc-adalaj', dateObj);

    assert.strictEqual(stringStats.last7DaysAvg, dateStats.last7DaysAvg);
    assert.strictEqual(stringStats.prev7DaysAvg, dateStats.prev7DaysAvg);
    assert.strictEqual(stringStats.trend, dateStats.trend);
    assert.strictEqual(stringStats.todayPatients, dateStats.todayPatients);
  });

  await t.test('D. PHC Nakra target-date statistics are deterministic', async () => {
    const run1 = await getFootfallStats('phc-nakra', '2026-09-14');
    const run2 = await getFootfallStats('phc-nakra', '2026-09-14');

    assert.deepStrictEqual(run1, run2);
    assert.strictEqual(typeof run1.last7DaysAvg, 'number');
    assert.strictEqual(typeof run1.prev7DaysAvg, 'number');
  });

  await t.test('E. Previously failing PHC Adalaj historical records are now found on 2026-09-14', async () => {
    const stats = await getFootfallStats('phc-adalaj', '2026-09-14');
    assert.notStrictEqual(stats.last7DaysAvg, 'Insufficient data');
    assert.notStrictEqual(stats.prev7DaysAvg, 'Insufficient data');

    const trendRatio = parseFloat((stats.last7DaysAvg / stats.prev7DaysAvg).toFixed(4));
    const fedResult = calculateFederatedDemandForecast({
      targetDate: '2026-09-14',
      recentFootfallAvg: stats.last7DaysAvg,
      footfallTrendRatio: trendRatio,
      currentOccupancyRate: 0.6,
      seasonalFactor: 1.0
    });

    assert.strictEqual(fedResult.available, true);
    assert.strictEqual(fedResult.dataStatus, 'AVAILABLE');
    assert.strictEqual(typeof fedResult.forecastDemand, 'number');
    assert.strictEqual(fedResult.forecastDemand, 84.3014);
  });

  await t.test('F. Reference date outside historical window returns explicit Insufficient data', async () => {
    const futureStats = await getFootfallStats('phc-adalaj', '2030-01-01');
    assert.strictEqual(futureStats.last7DaysAvg, 'Insufficient data');
    assert.strictEqual(futureStats.prev7DaysAvg, 'Insufficient data');
    assert.strictEqual(futureStats.trend, 'Insufficient data');

    const fedResult = calculateFederatedDemandForecast({
      targetDate: '2030-01-01',
      recentFootfallAvg: futureStats.last7DaysAvg,
      footfallTrendRatio: null,
      currentOccupancyRate: 0.6,
      seasonalFactor: 1.0
    });

    assert.strictEqual(fedResult.available, false);
    assert.strictEqual(fedResult.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(fedResult.forecastDemand, null);
  });

  await t.test('G. Federated feature extraction evaluates accurately across reference dates', () => {
    const features = extractFederatedFeatures({
      targetDate: '2026-09-14',
      recentFootfallAvg: 200,
      footfallTrendRatio: 2.0,
      currentOccupancyRate: 0.6,
      seasonalFactor: 1.0
    });

    assert.strictEqual(features.valid, true);
    assert.strictEqual(features.featureObject.dayOfWeek, 1); // Monday
    assert.strictEqual(features.featureObject.recentFootfallAvg, 200);
    assert.strictEqual(features.featureObject.footfallTrendRatio, 2.0);
    assert.strictEqual(features.featureObject.currentOccupancyRate, 0.6);
    assert.strictEqual(features.featureObject.seasonalFactor, 1.0);
  });

});
