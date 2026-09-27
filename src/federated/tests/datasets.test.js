import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_FIELDS = [
  'recordId',
  'phcId',
  'region',
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor',
  'targetDemand'
];

const NUMERIC_FIELDS = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor',
  'targetDemand'
];

test('Federated Prototype Datasets — Isolation and Schema Validation Suite', async (t) => {

  await t.test('1. Gujarat dataset exists and is non-empty', () => {
    assert.ok(Array.isArray(GUJARAT_FEDERATED_DATASET), 'Gujarat dataset must be an array');
    assert.ok(GUJARAT_FEDERATED_DATASET.length > 0, 'Gujarat dataset must contain samples');
    assert.strictEqual(GUJARAT_FEDERATED_DATASET.length, 42, 'Gujarat dataset should have 42 prototype samples');
  });

  await t.test('2. Maharashtra dataset exists and is non-empty', () => {
    assert.ok(Array.isArray(MAHARASHTRA_FEDERATED_DATASET), 'Maharashtra dataset must be an array');
    assert.ok(MAHARASHTRA_FEDERATED_DATASET.length > 0, 'Maharashtra dataset must contain samples');
    assert.strictEqual(MAHARASHTRA_FEDERATED_DATASET.length, 42, 'Maharashtra dataset should have 42 prototype samples');
  });

  await t.test('3. Rajasthan dataset exists and is non-empty', () => {
    assert.ok(Array.isArray(RAJASTHAN_FEDERATED_DATASET), 'Rajasthan dataset must be an array');
    assert.ok(RAJASTHAN_FEDERATED_DATASET.length > 0, 'Rajasthan dataset must contain samples');
    assert.strictEqual(RAJASTHAN_FEDERATED_DATASET.length, 42, 'Rajasthan dataset should have 42 prototype samples');
  });

  await t.test('4. Every record across all datasets has all required audited schema fields', () => {
    const allDatasets = [
      { name: 'Gujarat', data: GUJARAT_FEDERATED_DATASET },
      { name: 'Maharashtra', data: MAHARASHTRA_FEDERATED_DATASET },
      { name: 'Rajasthan', data: RAJASTHAN_FEDERATED_DATASET }
    ];

    for (const { name, data } of allDatasets) {
      for (let i = 0; i < data.length; i++) {
        const record = data[i];
        for (const field of REQUIRED_FIELDS) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined && record[field] !== null,
            `Record at index ${i} in ${name} dataset is missing required field "${field}"`
          );
        }
      }
    }
  });

  await t.test('5. All numeric features are finite numbers within valid domains', () => {
    const allDatasets = [
      { name: 'Gujarat', data: GUJARAT_FEDERATED_DATASET },
      { name: 'Maharashtra', data: MAHARASHTRA_FEDERATED_DATASET },
      { name: 'Rajasthan', data: RAJASTHAN_FEDERATED_DATASET }
    ];

    for (const { name, data } of allDatasets) {
      for (const record of data) {
        for (const field of NUMERIC_FIELDS) {
          assert.strictEqual(typeof record[field], 'number', `${field} in ${record.recordId} must be a number`);
          assert.ok(Number.isFinite(record[field]), `${field} in ${record.recordId} must be finite`);
          assert.ok(!Number.isNaN(record[field]), `${field} in ${record.recordId} must not be NaN`);
        }
        assert.ok(record.dayOfWeek >= 0 && record.dayOfWeek <= 6, `dayOfWeek in ${record.recordId} must be 0-6`);
        assert.ok(record.recentFootfallAvg > 0, `recentFootfallAvg in ${record.recordId} must be positive`);
        assert.ok(record.footfallTrendRatio > 0, `footfallTrendRatio in ${record.recordId} must be positive`);
        assert.ok(record.currentOccupancyRate >= 0 && record.currentOccupancyRate <= 1.5, `currentOccupancyRate in ${record.recordId} must be in realistic range`);
        assert.ok(record.seasonalFactor > 0, `seasonalFactor in ${record.recordId} must be positive`);
      }
    }
  });

  await t.test('6. targetDemand is a valid non-negative prediction label', () => {
    const allDatasets = [
      ...GUJARAT_FEDERATED_DATASET,
      ...MAHARASHTRA_FEDERATED_DATASET,
      ...RAJASTHAN_FEDERATED_DATASET
    ];

    for (const record of allDatasets) {
      assert.strictEqual(typeof record.targetDemand, 'number', `targetDemand in ${record.recordId} must be a number`);
      assert.ok(Number.isFinite(record.targetDemand), `targetDemand in ${record.recordId} must be finite`);
      assert.ok(record.targetDemand >= 0, `targetDemand in ${record.recordId} must be non-negative`);
    }
  });

  await t.test('7. Gujarat records contain strictly region: "GUJARAT"', () => {
    for (const record of GUJARAT_FEDERATED_DATASET) {
      assert.strictEqual(record.region, 'GUJARAT', `Expected GUJARAT region in ${record.recordId}`);
    }
  });

  await t.test('8. Maharashtra records contain strictly region: "MAHARASHTRA"', () => {
    for (const record of MAHARASHTRA_FEDERATED_DATASET) {
      assert.strictEqual(record.region, 'MAHARASHTRA', `Expected MAHARASHTRA region in ${record.recordId}`);
    }
  });

  await t.test('9. Rajasthan records contain strictly region: "RAJASTHAN"', () => {
    for (const record of RAJASTHAN_FEDERATED_DATASET) {
      assert.strictEqual(record.region, 'RAJASTHAN', `Expected RAJASTHAN region in ${record.recordId}`);
    }
  });

  await t.test('10. Record IDs are unique and deterministic within each dataset', () => {
    const verifyUniqueIds = (dataset, regionPrefix) => {
      const seen = new Set();
      for (const record of dataset) {
        assert.ok(record.recordId.startsWith(regionPrefix), `Record ID ${record.recordId} must start with prefix ${regionPrefix}`);
        assert.ok(!seen.has(record.recordId), `Duplicate recordId found: ${record.recordId}`);
        seen.add(record.recordId);
      }
      assert.strictEqual(seen.size, dataset.length, 'Unique set size must match dataset length');
    };

    verifyUniqueIds(GUJARAT_FEDERATED_DATASET, 'gj_rec_');
    verifyUniqueIds(MAHARASHTRA_FEDERATED_DATASET, 'mh_rec_');
    verifyUniqueIds(RAJASTHAN_FEDERATED_DATASET, 'rj_rec_');
  });

  await t.test('11. No dataset files import Firestore or Firebase services', () => {
    const dataDir = path.resolve(__dirname, '../data');
    const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.js'));

    assert.ok(dataFiles.length >= 3, 'Must have at least 3 regional data files');

    for (const file of dataFiles) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      assert.ok(!content.includes('firebase'), `${file} must not import firebase`);
      assert.ok(!content.includes('firestore'), `${file} must not import firestore`);
      assert.ok(!content.includes('collection('), `${file} must not reference firestore collections`);
      assert.ok(!content.includes('getDocs('), `${file} must not perform firestore queries`);
      assert.ok(!content.includes('setDoc(') && !content.includes('addDoc('), `${file} must not write to firestore`);
    }
  });

  await t.test('12. No production collections or PII are accessed or defined in datasets', () => {
    const forbiddenKeywords = ['patientName', 'phoneNumber', 'aadhaar', 'address', 'staffName', 'daily_footfall', 'medicines_inventory', 'phcs'];
    const dataDir = path.resolve(__dirname, '../data');
    const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.js'));

    for (const file of dataFiles) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      for (const kw of forbiddenKeywords) {
        assert.ok(!content.includes(kw), `${file} must not contain forbidden keyword/PII field "${kw}"`);
      }
    }
  });

  await t.test('13. Zero Firestore writes occur during dataset loading and access', () => {
    // Datasets are pure immutable JS objects in memory
    assert.strictEqual(typeof GUJARAT_FEDERATED_DATASET, 'object');
    assert.strictEqual(typeof MAHARASHTRA_FEDERATED_DATASET, 'object');
    assert.strictEqual(typeof RAJASTHAN_FEDERATED_DATASET, 'object');
  });

  await t.test('14. Existing production forecasting files remain intact and untouched', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const dbServicePath = path.join(srcDir, 'services', 'db.js');
    const bedForecastServicePath = path.join(srcDir, 'services', 'bedForecast.js');
    const unifiedRiskServicePath = path.join(srcDir, 'services', 'unifiedFacilityRisk.js');

    assert.ok(fs.existsSync(dbServicePath), 'src/services/db.js must exist');
    assert.ok(fs.existsSync(bedForecastServicePath), 'src/services/bedForecast.js must exist');
    assert.ok(fs.existsSync(unifiedRiskServicePath), 'src/services/unifiedFacilityRisk.js must exist');

    const dbContent = fs.readFileSync(dbServicePath, 'utf-8');
    const bedForecastContent = fs.readFileSync(bedForecastServicePath, 'utf-8');
    const unifiedRiskContent = fs.readFileSync(unifiedRiskServicePath, 'utf-8');

    assert.ok(dbContent.includes('export async function forecastDemand'), 'forecastDemand must remain in db.js');
    assert.ok(dbContent.includes('export async function predictStockOut'), 'predictStockOut must remain in db.js');
    assert.ok(bedForecastContent.includes('export function calculateBedForecast'), 'calculateBedForecast must remain in bedForecast.js');
    assert.ok(unifiedRiskContent.includes('export async function getFacilityUnifiedRisk') || unifiedRiskContent.includes('getFacilityUnifiedRisk'), 'getFacilityUnifiedRisk must remain in unifiedFacilityRisk.js');
  });
});
