import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFederatedGlobalDemo, runGujaratDemo, SAMPLE_FEATURE_VECTORS } from '../demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Day 14 — Step 4: Federated Global Model Demonstration Test Suite', async (t) => {
  const result = runFederatedGlobalDemo();

  await t.test('1. Three local updates participate', () => {
    assert.strictEqual(result.regionalUpdates.length, 3);
    assert.deepStrictEqual(result.participatingNodes, ['node_gujarat', 'node_maharashtra', 'node_rajasthan']);
  });

  await t.test('2. Aggregator receives updates only', () => {
    assert.strictEqual(result.privacyChecks.aggregatorReceivesUpdatesOnly, true);
    for (const update of result.regionalUpdates) {
      const keys = Object.keys(update);
      assert.ok(!keys.includes('dataset'));
      assert.ok(!keys.includes('records'));
      assert.ok(!keys.includes('phc_id'));
      assert.ok(!keys.includes('footfall_id'));
    }
  });

  await t.test('3. Global model is generated', () => {
    assert.ok(result.globalModel, 'Global model must exist');
    assert.strictEqual(result.globalModel.modelType, 'RIDGE_LINEAR_REGRESSION');
    assert.strictEqual(result.globalModel.modelVersion, '1.0.0');
    assert.strictEqual(result.aggregationMethod, 'SAMPLE_WEIGHTED_FEDAVG');
  });

  await t.test('4. Global model has 5 weights', () => {
    assert.strictEqual(result.globalModel.weights.length, 5);
    for (const w of result.globalModel.weights) {
      assert.strictEqual(typeof w, 'number');
      assert.ok(Number.isFinite(w));
    }
  });

  await t.test('5. Global model has valid bias', () => {
    assert.strictEqual(typeof result.globalModel.bias, 'number');
    assert.ok(Number.isFinite(result.globalModel.bias));
  });

  await t.test('6. Total samples = 126', () => {
    assert.strictEqual(result.totalSamples, 126);
    assert.deepStrictEqual(result.sampleCounts, [42, 42, 42]);
  });

  await t.test('7. Aggregation weights sum to 1', () => {
    const sum = Object.values(result.aggregationWeights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-5, `Sum ${sum} must equal 1.0`);
  });

  await t.test('8. Global inference returns finite numeric values', () => {
    assert.strictEqual(result.samplePredictions.length, 3);
    for (const pred of result.samplePredictions) {
      assert.strictEqual(typeof pred.prediction, 'number');
      assert.ok(Number.isFinite(pred.prediction));
      assert.ok(!Number.isNaN(pred.prediction));
      assert.ok(pred.prediction > 0, 'Prediction should be positive for realistic demand vectors');
    }
  });

  await t.test('9. Raw datasets are not included in demo output', () => {
    const json = JSON.stringify(result);
    assert.strictEqual(result.privacyChecks.noRawData, true);
    assert.ok(!json.includes('phc_gj_adalaj'));
    assert.ok(!json.includes('targetDemand'));
    assert.ok(!json.includes('patient'));
    assert.ok(!json.includes('records'));
  });

  await t.test('10. Demo is deterministic', () => {
    const result2 = runFederatedGlobalDemo();
    assert.deepStrictEqual(result.globalModel.weights, result2.globalModel.weights);
    assert.strictEqual(result.globalModel.bias, result2.globalModel.bias);
    assert.deepStrictEqual(
      result.samplePredictions.map(p => p.prediction),
      result2.samplePredictions.map(p => p.prediction)
    );
  });

  await t.test('11. No Firestore activity', () => {
    assert.strictEqual(result.infrastructureChecks.firestoreReads, 0);
    assert.strictEqual(result.infrastructureChecks.firestoreWrites, 0);
    const demoPath = path.resolve(__dirname, '../demo.js');
    const content = fs.readFileSync(demoPath, 'utf-8');
    assert.ok(!content.includes("from 'firebase"));
    assert.ok(!content.includes('firebase/firestore'));
    assert.ok(!content.includes('getFirestore'));
    assert.ok(!content.includes('collection('));
    assert.ok(!content.includes('doc('));
  });

  await t.test('12. No network activity', () => {
    assert.strictEqual(result.infrastructureChecks.networkCalls, 0);
    const demoPath = path.resolve(__dirname, '../demo.js');
    const content = fs.readFileSync(demoPath, 'utf-8');
    assert.ok(!content.includes('fetch('));
    assert.ok(!content.includes('axios'));
    assert.ok(!content.includes('http'));
  });

  await t.test('13. No Gemini activity', () => {
    assert.strictEqual(result.infrastructureChecks.geminiCalls, 0);
    const demoPath = path.resolve(__dirname, '../demo.js');
    const content = fs.readFileSync(demoPath, 'utf-8');
    assert.ok(!content.includes('geminiContext'));
    assert.ok(!content.includes('@google/genai'));
  });

  await t.test('14. Production services are not imported', () => {
    const demoPath = path.resolve(__dirname, '../demo.js');
    const content = fs.readFileSync(demoPath, 'utf-8');
    assert.ok(!content.includes('services/db'));
    assert.ok(!content.includes('services/bedForecast'));
    assert.ok(!content.includes('services/beds'));
    assert.ok(!content.includes('services/workforceDb'));
    assert.ok(!content.includes('services/workforceRisk'));
    assert.ok(!content.includes('services/unifiedFacilityRisk'));
    assert.ok(!content.includes('services/geminiContext'));
    assert.ok(!content.includes('App.jsx'));
    assert.ok(!content.includes('server.js'));
  });

  await t.test('15. Backward-compatibility: runGujaratDemo is callable', () => {
    const gjResult = runGujaratDemo();
    assert.strictEqual(gjResult.nodeId, 'node_gujarat');
    assert.strictEqual(gjResult.trainingSamples, 42);
  });
});
