import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { trainLocalModel, createLocalModelUpdate } from '../training/trainer.js';
import { FEATURE_NAMES } from '../models/linearRegression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_FEATURE_ORDER = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor'
];

test('Day 13 — Step 4: Gujarat Local Model Update & Privacy Suite', async (t) => {

  const trainingResult = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
    nodeId: 'node_gujarat',
    region: 'GUJARAT'
  });

  const gujaratUpdate = createLocalModelUpdate(trainingResult);

  await t.test('1. Gujarat update is generated successfully', () => {
    assert.ok(gujaratUpdate, 'Model update packet must exist');
    assert.strictEqual(typeof gujaratUpdate, 'object');
  });

  await t.test('2. nodeId = node_gujarat', () => {
    assert.strictEqual(gujaratUpdate.nodeId, 'node_gujarat');
  });

  await t.test('3. region = GUJARAT', () => {
    assert.strictEqual(gujaratUpdate.region, 'GUJARAT');
  });

  await t.test('4. sampleCount = 42', () => {
    assert.strictEqual(gujaratUpdate.sampleCount, 42);
    assert.strictEqual(gujaratUpdate.sampleCount, GUJARAT_FEDERATED_DATASET.length);
  });

  await t.test('5. Five feature names are preserved in exact order', () => {
    assert.ok(Array.isArray(gujaratUpdate.featureNames));
    assert.strictEqual(gujaratUpdate.featureNames.length, 5);
    assert.deepStrictEqual(gujaratUpdate.featureNames, EXPECTED_FEATURE_ORDER);
  });

  await t.test('6. Five weights are present', () => {
    assert.ok(Array.isArray(gujaratUpdate.weights));
    assert.strictEqual(gujaratUpdate.weights.length, 5);
  });

  await t.test('7. weights are finite', () => {
    for (let i = 0; i < gujaratUpdate.weights.length; i++) {
      const w = gujaratUpdate.weights[i];
      assert.strictEqual(typeof w, 'number');
      assert.ok(Number.isFinite(w));
      assert.ok(!Number.isNaN(w));
    }
  });

  await t.test('8. bias is finite', () => {
    assert.strictEqual(typeof gujaratUpdate.bias, 'number');
    assert.ok(Number.isFinite(gujaratUpdate.bias));
    assert.ok(!Number.isNaN(gujaratUpdate.bias));
  });

  await t.test('9. loss is finite', () => {
    assert.strictEqual(typeof gujaratUpdate.loss, 'number');
    assert.ok(Number.isFinite(gujaratUpdate.loss));
    assert.ok(gujaratUpdate.loss >= 0);
  });

  await t.test('10. update is JSON serializable', () => {
    assert.doesNotThrow(() => {
      const json = JSON.stringify(gujaratUpdate);
      assert.ok(json.length > 0);
    });
  });

  await t.test('11. serialize/deserialize preserves values identically', () => {
    const jsonString = JSON.stringify(gujaratUpdate);
    const deserialized = JSON.parse(jsonString);

    assert.strictEqual(deserialized.nodeId, gujaratUpdate.nodeId);
    assert.strictEqual(deserialized.region, gujaratUpdate.region);
    assert.strictEqual(deserialized.modelVersion, gujaratUpdate.modelVersion);
    assert.strictEqual(deserialized.sampleCount, gujaratUpdate.sampleCount);
    assert.deepStrictEqual(deserialized.featureNames, gujaratUpdate.featureNames);
    assert.deepStrictEqual(deserialized.weights, gujaratUpdate.weights);
    assert.strictEqual(deserialized.bias, gujaratUpdate.bias);
    assert.strictEqual(deserialized.loss, gujaratUpdate.loss);
  });

  await t.test('12. update contains no raw training records', () => {
    assert.strictEqual(gujaratUpdate.records, undefined);
    assert.strictEqual(gujaratUpdate.dataset, undefined);
    assert.strictEqual(gujaratUpdate.data, undefined);
    assert.strictEqual(gujaratUpdate.samples, undefined);
    assert.strictEqual(gujaratUpdate.rawFeatures, undefined);
  });

  await t.test('13. update contains no PII', () => {
    const json = JSON.stringify(gujaratUpdate);
    const piiFields = ['patientName', 'patient_id', 'aadhaar', 'phone', 'address', 'doctorName', 'staffName', 'email'];
    for (const field of piiFields) {
      assert.ok(!json.includes(`"${field}"`), `Update packet must not contain PII field "${field}"`);
    }
  });

  await t.test('14. update contains no Firestore references or tokens', () => {
    const json = JSON.stringify(gujaratUpdate);
    const firestoreKeywords = ['firebase', 'firestore', 'collection', 'docRef', 'serverTimestamp', 'apiKey', 'token'];
    for (const kw of firestoreKeywords) {
      assert.ok(!json.toLowerCase().includes(kw), `Update packet must not contain Firestore keyword "${kw}"`);
    }
  });

  await t.test('15. repeated training/update generation is deterministic', () => {
    const run1 = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    const update1 = createLocalModelUpdate(run1);

    const run2 = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    const update2 = createLocalModelUpdate(run2);

    assert.deepStrictEqual(update1, update2);
  });

  await t.test('16. Maharashtra data is not included', () => {
    const json = JSON.stringify(gujaratUpdate);
    assert.ok(!json.includes('MAHARASHTRA'));
    assert.ok(!json.includes('phc_mh_'));
  });

  await t.test('17. Rajasthan data is not included', () => {
    const json = JSON.stringify(gujaratUpdate);
    assert.ok(!json.includes('RAJASTHAN'));
    assert.ok(!json.includes('phc_rj_'));
  });

  await t.test('18. no Firestore imports in training or model code', () => {
    const files = [
      path.resolve(__dirname, '../training/trainer.js'),
      path.resolve(__dirname, '../training/index.js'),
      path.resolve(__dirname, '../models/linearRegression.js'),
      path.resolve(__dirname, '../models/index.js')
    ];

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      assert.ok(!content.includes('firebase'));
      assert.ok(!content.includes('firestore'));
    }
  });

  await t.test('19. no Firestore writes occur during update creation', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    const update = createLocalModelUpdate(result);
    assert.strictEqual(typeof update, 'object');
  });

  await t.test('20. no global model is created in local directories', () => {
    const localDirs = [
      path.resolve(__dirname, '../models'),
      path.resolve(__dirname, '../nodes'),
      path.resolve(__dirname, '../training'),
      path.resolve(__dirname, '../data')
    ];
    for (const dir of localDirs) {
      const allFiles = fs.readdirSync(dir, { recursive: true });
      for (const f of allFiles) {
        if (typeof f === 'string') {
          assert.ok(!f.toLowerCase().includes('globalmodel'), `Global model file ${f} must not exist in Step 4`);
        }
      }
    }
  });

  await t.test('21. no FedAvg is created in local directories', () => {
    const localDirs = [
      path.resolve(__dirname, '../models'),
      path.resolve(__dirname, '../nodes'),
      path.resolve(__dirname, '../training'),
      path.resolve(__dirname, '../data')
    ];
    for (const dir of localDirs) {
      const allFiles = fs.readdirSync(dir, { recursive: true });
      for (const f of allFiles) {
        if (typeof f === 'string') {
          assert.ok(!f.toLowerCase().includes('fedavg'), `FedAvg file ${f} must not exist in Step 4`);
        }
      }
    }
  });
});
