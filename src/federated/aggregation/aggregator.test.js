import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGujaratNode, createMaharashtraNode, createRajasthanNode } from '../nodes/regionalNodes.js';
import { aggregateModelUpdates, validateModelUpdates } from './aggregator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_FEATURE_ORDER = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor'
];

test('Day 14 — Step 2: Federated Aggregator Suite', async (t) => {

  const gjUpdate = createGujaratNode().getLocalUpdate();
  const mhUpdate = createMaharashtraNode().getLocalUpdate();
  const rjUpdate = createRajasthanNode().getLocalUpdate();

  const updates = [gjUpdate, mhUpdate, rjUpdate];

  await t.test('1. Three compatible updates aggregate successfully', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.ok(globalModel, 'Global model must exist');
    assert.strictEqual(globalModel.modelType, 'RIDGE_LINEAR_REGRESSION');
    assert.strictEqual(globalModel.modelVersion, '1.0.0');
    assert.strictEqual(globalModel.aggregationMethod, 'SAMPLE_WEIGHTED_FEDAVG');
  });

  await t.test('2. Sample-weighted averaging is mathematically correct', () => {
    const globalModel = aggregateModelUpdates(updates);

    // Theoretical manual calculation with 42/126 weights (1/3 each)
    for (let j = 0; j < 5; j++) {
      const expectedWeight = Number(((gjUpdate.weights[j] + mhUpdate.weights[j] + rjUpdate.weights[j]) / 3).toFixed(6));
      assert.strictEqual(globalModel.weights[j], expectedWeight, `Weight ${j} mismatch`);
    }

    const expectedBias = Number(((gjUpdate.bias + mhUpdate.bias + rjUpdate.bias) / 3).toFixed(6));
    assert.strictEqual(globalModel.bias, expectedBias, 'Bias mismatch');
  });

  await t.test('3. Equal 42/42/42 datasets produce equal 1/3 weights', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.strictEqual(globalModel.aggregationWeights.node_gujarat, 0.333333);
    assert.strictEqual(globalModel.aggregationWeights.node_maharashtra, 0.333333);
    assert.strictEqual(globalModel.aggregationWeights.node_rajasthan, 0.333333);
  });

  await t.test('4. Global weight vector has exactly 5 elements', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.ok(Array.isArray(globalModel.weights));
    assert.strictEqual(globalModel.weights.length, 5);
    for (const w of globalModel.weights) {
      assert.strictEqual(typeof w, 'number');
      assert.ok(Number.isFinite(w));
    }
  });

  await t.test('5. Global bias is correctly aggregated', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.strictEqual(typeof globalModel.bias, 'number');
    assert.ok(Number.isFinite(globalModel.bias));
  });

  await t.test('6. Feature ordering is preserved', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.deepStrictEqual(globalModel.featureNames, EXPECTED_FEATURE_ORDER);
  });

  await t.test('7. Participating nodes are preserved', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.deepStrictEqual(globalModel.participatingNodes, ['node_gujarat', 'node_maharashtra', 'node_rajasthan']);
  });

  await t.test('8. Total sample count is 126', () => {
    const globalModel = aggregateModelUpdates(updates);
    assert.strictEqual(globalModel.totalSampleCount, 126);
  });

  await t.test('9. Empty updates rejected', () => {
    assert.throws(() => {
      aggregateModelUpdates([]);
    }, /Updates array is empty/);
  });

  await t.test('10. Single update rejected (minimum 2 nodes required)', () => {
    assert.throws(() => {
      aggregateModelUpdates([gjUpdate]);
    }, /requires at least 2 participating model updates/);
  });

  await t.test('11. Duplicate node rejected', () => {
    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, gjUpdate]);
    }, /Duplicate nodeId detected/);
  });

  await t.test('12. Mismatched feature order rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      featureNames: [
        'recentFootfallAvg',
        'dayOfWeek',
        'footfallTrendRatio',
        'currentOccupancyRate',
        'seasonalFactor'
      ]
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /Feature ordering mismatch/);
  });

  await t.test('13. Mismatched feature count rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      featureNames: ['dayOfWeek', 'recentFootfallAvg']
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /Feature count mismatch/);
  });

  await t.test('14. Mismatched model version rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      modelVersion: '2.0.0'
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /Model version mismatch/);
  });

  await t.test('15. Invalid sample count rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      sampleCount: 0
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /invalid or non-positive sampleCount/);
  });

  await t.test('16. Invalid weights rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      weights: [-0.1, null, 25.0, 30.0, 50.0]
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /Non-numeric weight value/);
  });

  await t.test('17. Invalid bias rejected', () => {
    const badUpdate = {
      ...mhUpdate,
      bias: NaN
    };

    assert.throws(() => {
      aggregateModelUpdates([gjUpdate, badUpdate]);
    }, /Invalid or non-numeric bias/);
  });

  await t.test('18. Raw dataset fields are not present in global model', () => {
    const globalModel = aggregateModelUpdates(updates);
    const json = JSON.stringify(globalModel);

    assert.strictEqual(globalModel.dataset, undefined);
    assert.strictEqual(globalModel.records, undefined);
    assert.strictEqual(globalModel.samples, undefined);
    assert.ok(!json.includes('patient'));
    assert.ok(!json.includes('footfall_id'));
    assert.ok(!json.includes('phc_gj_adalaj'));
  });

  await t.test('19. Global model is JSON serializable', () => {
    const globalModel = aggregateModelUpdates(updates);
    const json = JSON.stringify(globalModel);
    const parsed = JSON.parse(json);

    assert.deepStrictEqual(parsed, globalModel);
  });

  await t.test('20. Aggregation is deterministic', () => {
    const res1 = aggregateModelUpdates(updates);
    const res2 = aggregateModelUpdates(updates);

    assert.deepStrictEqual(res1.weights, res2.weights);
    assert.strictEqual(res1.bias, res2.bias);
    assert.deepStrictEqual(res1.aggregationWeights, res2.aggregationWeights);
  });
});
