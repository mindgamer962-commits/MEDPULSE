import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGujaratNode, createMaharashtraNode, createRajasthanNode } from '../nodes/regionalNodes.js';
import { aggregateModelUpdates } from '../aggregation/aggregator.js';
import { predict } from '../models/linearRegression.js';
import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_FEATURE_ORDER = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor'
];

test('Day 14 — Step 3: Global Model Validation & Independent Math Verification Suite', async (t) => {

  const gjNode = createGujaratNode();
  const mhNode = createMaharashtraNode();
  const rjNode = createRajasthanNode();

  const gjUpdate = gjNode.getLocalUpdate();
  const mhUpdate = mhNode.getLocalUpdate();
  const rjUpdate = rjNode.getLocalUpdate();

  const updates = [gjUpdate, mhUpdate, rjUpdate];
  const globalModel = aggregateModelUpdates(updates);

  await t.test('1. Independent FedAvg mathematical recalculation matches aggregator output', () => {
    const totalSamples = gjUpdate.sampleCount + mhUpdate.sampleCount + rjUpdate.sampleCount;
    assert.strictEqual(totalSamples, 126);

    const w_gj = gjUpdate.sampleCount / totalSamples;
    const w_mh = mhUpdate.sampleCount / totalSamples;
    const w_rj = rjUpdate.sampleCount / totalSamples;

    // Recalculate weights independently
    for (let j = 0; j < 5; j++) {
      const independentWeight = Number((w_gj * gjUpdate.weights[j] + w_mh * mhUpdate.weights[j] + w_rj * rjUpdate.weights[j]).toFixed(6));
      assert.strictEqual(globalModel.weights[j], independentWeight, `Mismatch at weight index ${j}`);
    }

    // Recalculate bias independently
    const independentBias = Number((w_gj * gjUpdate.bias + w_mh * mhUpdate.bias + w_rj * rjUpdate.bias).toFixed(6));
    assert.strictEqual(globalModel.bias, independentBias, 'Bias calculation mismatch');
  });

  await t.test('2. Global model schema meets all specifications', () => {
    assert.strictEqual(globalModel.modelType, 'RIDGE_LINEAR_REGRESSION');
    assert.strictEqual(globalModel.modelVersion, '1.0.0');
    assert.strictEqual(globalModel.aggregationMethod, 'SAMPLE_WEIGHTED_FEDAVG');
    assert.deepStrictEqual(globalModel.participatingNodes, ['node_gujarat', 'node_maharashtra', 'node_rajasthan']);
    assert.strictEqual(globalModel.totalSampleCount, 126);
    assert.deepStrictEqual(globalModel.featureNames, EXPECTED_FEATURE_ORDER);
    assert.strictEqual(globalModel.weights.length, 5);
    assert.strictEqual(typeof globalModel.bias, 'number');
    assert.ok(Number.isFinite(globalModel.bias));

    const weightSum = globalModel.aggregationWeights.node_gujarat
      + globalModel.aggregationWeights.node_maharashtra
      + globalModel.aggregationWeights.node_rajasthan;
    assert.ok(Math.abs(weightSum - 1.0) < 0.0001, 'Aggregation weights must sum to approximately 1.0');
  });

  await t.test('3. Global model JSON serialization and deserialization is lossless and privacy-safe', () => {
    const jsonString = JSON.stringify(globalModel);
    const parsed = JSON.parse(jsonString);

    assert.deepStrictEqual(parsed, globalModel);
    assert.ok(!jsonString.includes('patient'));
    assert.ok(!jsonString.includes('footfall_id'));
    assert.ok(!jsonString.includes('firebase'));
    assert.ok(!jsonString.includes('firestore'));
    assert.ok(!jsonString.includes('apiKey'));
  });

  await t.test('4. Prediction sanity check on representative samples across all 3 regions', () => {
    const testSamples = [
      GUJARAT_FEDERATED_DATASET[0],
      MAHARASHTRA_FEDERATED_DATASET[0],
      RAJASTHAN_FEDERATED_DATASET[0]
    ];

    for (let i = 0; i < testSamples.length; i++) {
      const sample = testSamples[i];

      const predGJ = gjNode.predict(sample);
      const predMH = mhNode.predict(sample);
      const predRJ = rjNode.predict(sample);
      const predGlobal = predict(globalModel, sample);

      assert.ok(Number.isFinite(predGJ), `Local GJ prediction ${i} must be finite`);
      assert.ok(Number.isFinite(predMH), `Local MH prediction ${i} must be finite`);
      assert.ok(Number.isFinite(predRJ), `Local RJ prediction ${i} must be finite`);
      assert.ok(Number.isFinite(predGlobal), `Global prediction ${i} must be finite`);

      // Global prediction is a smooth weighted combination of regional parameters
      assert.ok(predGlobal > 0, `Global prediction for sample ${i} should be positive`);
    }
  });

  await t.test('5. Aggregator source code is completely free of raw dataset or Firestore imports', () => {
    const aggPath = path.resolve(__dirname, '../aggregation/aggregator.js');
    const content = fs.readFileSync(aggPath, 'utf-8');

    assert.ok(!content.includes('gujarat.js'));
    assert.ok(!content.includes('maharashtra.js'));
    assert.ok(!content.includes('rajasthan.js'));
    assert.ok(!content.includes("from 'firebase"));
    assert.ok(!content.includes('firebase/firestore'));
    assert.ok(!content.includes('services/db'));
  });

  await t.test('6. Exact linear inference mathematical verification (Zero hidden transformations)', () => {
    // Vector Set A: Synthetic Dataset Ground Truth Records (Step 3)
    const datasetVectors = [
      { name: 'Gujarat Record 0', vector: [1, 48.5, 1.12, 0.72, 1.05], expected: 54.775027 },
      { name: 'Maharashtra Record 0', vector: [1, 68.0, 1.25, 0.85, 1.20], expected: 80.929804 },
      { name: 'Rajasthan Record 0', vector: [1, 34.0, 1.04, 0.52, 0.96], expected: 33.709437 }
    ];

    for (const item of datasetVectors) {
      // Manual pure math: bias + sum(w_i * x_i)
      let manualDotProduct = globalModel.bias;
      for (let j = 0; j < item.vector.length; j++) {
        manualDotProduct += globalModel.weights[j] * item.vector[j];
      }
      const modelPrediction = predict(globalModel, item.vector);

      assert.strictEqual(
        Number(modelPrediction.toFixed(4)),
        Number(manualDotProduct.toFixed(4)),
        `Predict function must exactly equal raw mathematical dot-product for ${item.name}`
      );
      assert.strictEqual(
        Number(modelPrediction.toFixed(2)),
        Number(item.expected.toFixed(2)),
        `Prediction value must match expected calculation for ${item.name}`
      );
    }

    // Vector Set B: High-Footfall Synthetic Demo Vectors (Step 4)
    const demoVectors = [
      { name: 'Demo Vector A', vector: [1, 142, 1.02, 0.68, 1.15], expected: 111.540114 },
      { name: 'Demo Vector B', vector: [1, 185, 1.08, 0.74, 1.25], expected: 145.125646 },
      { name: 'Demo Vector C', vector: [1, 98, 0.98, 0.55, 1.05], expected: 75.654384 }
    ];

    for (const item of demoVectors) {
      let manualDotProduct = globalModel.bias;
      for (let j = 0; j < item.vector.length; j++) {
        manualDotProduct += globalModel.weights[j] * item.vector[j];
      }
      const modelPrediction = predict(globalModel, item.vector);

      assert.strictEqual(
        Number(modelPrediction.toFixed(4)),
        Number(manualDotProduct.toFixed(4)),
        `Predict function must exactly equal raw mathematical dot-product for ${item.name}`
      );
      assert.strictEqual(
        Number(modelPrediction.toFixed(4)),
        Number(item.expected.toFixed(4)),
        `Prediction value must match expected calculation for ${item.name}`
      );
    }
  });

  await t.test('7. Model contract: Global parameters remain strictly unchanged and finite', () => {
    const EXPECTED_WEIGHTS = [-0.067186, 0.583272, 20.273133, 30.319809, 54.692599];
    const EXPECTED_BIAS = -75.409879;

    assert.deepStrictEqual(globalModel.weights, EXPECTED_WEIGHTS);
    assert.strictEqual(globalModel.bias, EXPECTED_BIAS);
  });
});
