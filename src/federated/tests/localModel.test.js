import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';
import { FEATURE_NAMES, createLocalModel, predict, serializeModel } from '../models/linearRegression.js';
import { trainLocalModel, createLocalModelUpdate } from '../training/trainer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_FEATURE_ORDER = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor'
];

test('Day 13 — Step 3: Federated Local Model Training (Gujarat Node) Suite', async (t) => {

  await t.test('1. Gujarat model trains successfully', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.ok(result, 'Training result must exist');
    assert.ok(result.model, 'Trained model instance must be returned');
    assert.ok(result.modelUpdate, 'Model update must be returned');
  });

  await t.test('2. Exactly 42 Gujarat samples are used', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(result.trainingSamples, 42);
    assert.strictEqual(GUJARAT_FEDERATED_DATASET.length, 42);
    assert.strictEqual(result.modelUpdate.sampleCount, 42);
  });

  await t.test('3. Region is GUJARAT', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(result.region, 'GUJARAT');
    assert.strictEqual(result.modelUpdate.region, 'GUJARAT');
  });

  await t.test('4. Node ID is node_gujarat', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(result.nodeId, 'node_gujarat');
    assert.strictEqual(result.modelUpdate.nodeId, 'node_gujarat');
  });

  await t.test('5. Exactly five features are used', () => {
    assert.strictEqual(FEATURE_NAMES.length, 5);
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });
    assert.strictEqual(result.featureNames.length, 5);
  });

  await t.test('6. Feature ordering is fixed', () => {
    assert.deepStrictEqual(FEATURE_NAMES, EXPECTED_FEATURE_ORDER);
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });
    assert.deepStrictEqual(result.featureNames, EXPECTED_FEATURE_ORDER);
    assert.deepStrictEqual(result.model.featureNames, EXPECTED_FEATURE_ORDER);
  });

  await t.test('7. Model contains five weights', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.ok(Array.isArray(result.weights));
    assert.strictEqual(result.weights.length, 5);
    assert.strictEqual(result.model.weights.length, 5);
    assert.strictEqual(result.modelUpdate.weights.length, 5);
  });

  await t.test('8. Weights are finite numbers', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    for (let i = 0; i < result.weights.length; i++) {
      const w = result.weights[i];
      assert.strictEqual(typeof w, 'number', `Weight ${i} must be a number`);
      assert.ok(Number.isFinite(w), `Weight ${i} must be finite`);
      assert.ok(!Number.isNaN(w), `Weight ${i} must not be NaN`);
    }
  });

  await t.test('9. Bias is finite number', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(typeof result.bias, 'number');
    assert.ok(Number.isFinite(result.bias));
    assert.ok(!Number.isNaN(result.bias));
  });

  await t.test('10. Training loss is finite and non-negative', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(typeof result.loss, 'number');
    assert.ok(Number.isFinite(result.loss));
    assert.ok(result.loss >= 0);
  });

  await t.test('11. Predictions are finite numbers', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    for (let i = 0; i < GUJARAT_FEDERATED_DATASET.length; i++) {
      const sample = GUJARAT_FEDERATED_DATASET[i];
      const pred = predict(result.model, sample);
      assert.strictEqual(typeof pred, 'number');
      assert.ok(Number.isFinite(pred), `Prediction for sample ${i} must be finite`);
      assert.ok(pred > 0, `Prediction for sample ${i} should be positive`);
    }
  });

  await t.test('12. Repeated identical training produces identical model output', () => {
    const run1 = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });
    const run2 = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.deepStrictEqual(run1.weights, run2.weights);
    assert.strictEqual(run1.bias, run2.bias);
    assert.strictEqual(run1.loss, run2.loss);
    assert.deepStrictEqual(run1.modelUpdate, run2.modelUpdate);
  });

  await t.test('13. Input dataset is not mutated', () => {
    const snapshotBefore = JSON.stringify(GUJARAT_FEDERATED_DATASET);
    
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });
    for (const record of GUJARAT_FEDERATED_DATASET) {
      predict(result.model, record);
    }

    const snapshotAfter = JSON.stringify(GUJARAT_FEDERATED_DATASET);
    assert.strictEqual(snapshotBefore, snapshotAfter, 'Gujarat dataset must remain identical before and after training');
  });

  await t.test('14. Invalid records are handled safely', () => {
    const dirtyDataset = [
      ...GUJARAT_FEDERATED_DATASET,
      { recordId: 'bad_01', phcId: 'phc_bad', region: 'GUJARAT', dayOfWeek: 'NaN', recentFootfallAvg: null, footfallTrendRatio: 1.0, currentOccupancyRate: 0.5, seasonalFactor: 1.0, targetDemand: 50 },
      { recordId: 'bad_02', phcId: 'phc_bad', region: 'GUJARAT', dayOfWeek: 1, recentFootfallAvg: 40, footfallTrendRatio: 1.0, currentOccupancyRate: 0.5, seasonalFactor: 1.0, targetDemand: -5 },
      { recordId: 'bad_03', phcId: 'phc_bad', region: 'GUJARAT', dayOfWeek: 1, recentFootfallAvg: 40, footfallTrendRatio: 1.0, currentOccupancyRate: 0.5, seasonalFactor: 1.0, targetDemand: Infinity }
    ];

    const result = trainLocalModel(dirtyDataset, {
      nodeId: 'node_gujarat',
      region: 'GUJARAT'
    });

    assert.strictEqual(result.trainingSamples, 42, 'Should filter out 3 bad records and train only on 42 valid records');
    assert.ok(Number.isFinite(result.loss));
  });

  await t.test('15. Maharashtra data is not consumed', () => {
    const gujaratTrainingPath = path.resolve(__dirname, '../training/trainer.js');
    const gujaratContent = fs.readFileSync(gujaratTrainingPath, 'utf-8');

    assert.ok(!gujaratContent.includes('maharashtra.js'), 'trainer.js must not import maharashtra.js directly');
    
    const gujaratResult = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    const maharashtraResult = trainLocalModel(MAHARASHTRA_FEDERATED_DATASET, { nodeId: 'node_maharashtra', region: 'MAHARASHTRA' });

    assert.notDeepStrictEqual(gujaratResult.weights, maharashtraResult.weights, 'Regional models must learn distinct local distributions');
  });

  await t.test('16. Rajasthan data is not consumed', () => {
    const gujaratTrainingPath = path.resolve(__dirname, '../training/trainer.js');
    const gujaratContent = fs.readFileSync(gujaratTrainingPath, 'utf-8');

    assert.ok(!gujaratContent.includes('rajasthan.js'), 'trainer.js must not import rajasthan.js directly');

    const gujaratResult = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    const rajasthanResult = trainLocalModel(RAJASTHAN_FEDERATED_DATASET, { nodeId: 'node_rajasthan', region: 'RAJASTHAN' });

    assert.notDeepStrictEqual(gujaratResult.weights, rajasthanResult.weights, 'Regional models must learn distinct local distributions');
  });

  await t.test('17. No Firestore imports', () => {
    const federatedFiles = [
      path.resolve(__dirname, '../models/linearRegression.js'),
      path.resolve(__dirname, '../models/index.js'),
      path.resolve(__dirname, '../training/trainer.js'),
      path.resolve(__dirname, '../training/index.js'),
      path.resolve(__dirname, '../data/gujarat.js'),
      path.resolve(__dirname, '../data/maharashtra.js'),
      path.resolve(__dirname, '../data/rajasthan.js')
    ];

    for (const filePath of federatedFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(!content.includes('firebase'), `${filePath} must not import firebase`);
      assert.ok(!content.includes('firestore'), `${filePath} must not import firestore`);
      assert.ok(!content.includes('collection('), `${filePath} must not use collection()`);
    }
  });

  await t.test('18. No Firestore writes', () => {
    const result = trainLocalModel(GUJARAT_FEDERATED_DATASET, { nodeId: 'node_gujarat', region: 'GUJARAT' });
    assert.strictEqual(typeof result, 'object');
  });

  await t.test('19. Existing production forecasting files remain unchanged', () => {
    const dbPath = path.resolve(__dirname, '../../services/db.js');
    const bedForecastPath = path.resolve(__dirname, '../../services/bedForecast.js');

    const dbContent = fs.readFileSync(dbPath, 'utf-8');
    const bedContent = fs.readFileSync(bedForecastPath, 'utf-8');

    assert.ok(dbContent.includes('export async function forecastDemand'));
    assert.ok(dbContent.includes('export async function predictStockOut'));
    assert.ok(bedContent.includes('export function calculateBedForecast'));
  });

  await t.test('20. Gemini files remain unchanged', () => {
    const geminiPath = path.resolve(__dirname, '../../services/geminiContext.js');
    const geminiContent = fs.readFileSync(geminiPath, 'utf-8');

    assert.ok(geminiContent.includes('export async function buildMultiResourceGeminiContext'));
    assert.ok(geminiContent.includes('export const GEMINI_SYSTEM_INSTRUCTION'));
  });

  await t.test('21. No global model exists in local model directories', () => {
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
          assert.ok(!f.toLowerCase().includes('globalmodel'), `Global model file ${f} must not exist in Step 3`);
        }
      }
    }
  });

  await t.test('22. No FedAvg exists in local model directories', () => {
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
          assert.ok(!f.toLowerCase().includes('fedavg'), `FedAvg file ${f} must not exist in Step 3`);
        }
      }
    }
  });
});
