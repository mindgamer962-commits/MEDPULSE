import test from 'node:test';
import assert from 'node:assert';
import { calculateHaversineDistance } from './haversine.js';

test('calculateHaversineDistance', async (t) => {
  await t.test('identical coordinates return 0', () => {
    const dist = calculateHaversineDistance(20, 70, 20, 70);
    assert.strictEqual(dist, 0);
  });

  await t.test('known coordinate pair calculates correctly', () => {
    // New York: 40.7128, -74.0060
    // London: 51.5074, -0.1278
    // Distance ~ 5570 km
    const dist = calculateHaversineDistance(40.7128, -74.0060, 51.5074, -0.1278);
    // Allow small delta due to different Earth radius assumptions
    assert.ok(dist > 5560 && dist < 5590, `Distance was ${dist}`);
  });

  await t.test('missing latitude returns null', () => {
    assert.strictEqual(calculateHaversineDistance(undefined, 70, 20, 70), null);
    assert.strictEqual(calculateHaversineDistance(20, 70, undefined, 70), null);
  });

  await t.test('missing longitude returns null', () => {
    assert.strictEqual(calculateHaversineDistance(20, undefined, 20, 70), null);
    assert.strictEqual(calculateHaversineDistance(20, 70, 20, undefined), null);
  });

  await t.test('invalid latitude returns null', () => {
    assert.strictEqual(calculateHaversineDistance(95, 70, 20, 70), null); // > 90
    assert.strictEqual(calculateHaversineDistance(-95, 70, 20, 70), null); // < -90
    assert.strictEqual(calculateHaversineDistance("20", 70, 20, 70), null); // wrong type
    assert.strictEqual(calculateHaversineDistance(NaN, 70, 20, 70), null); // NaN
  });

  await t.test('invalid longitude returns null', () => {
    assert.strictEqual(calculateHaversineDistance(20, 185, 20, 70), null); // > 180
    assert.strictEqual(calculateHaversineDistance(20, -185, 20, 70), null); // < -180
    assert.strictEqual(calculateHaversineDistance(20, "70", 20, 70), null); // wrong type
    assert.strictEqual(calculateHaversineDistance(20, NaN, 20, 70), null); // NaN
  });
});
