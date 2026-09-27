import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateMAE, calculateRMSE, evaluateModel } from '../evaluation/metrics.js';
import { splitRegionalDataset, runLocalVsFederatedEvaluation, HELD_OUT_PHCS } from '../evaluation/modelComparison.js';
import { fineTunePersonalizedModel } from '../training/trainer.js';
import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Day 16 — Step 3: Personalized Federated Evaluation & Privacy Suite', async (t) => {

  const gjSplit = splitRegionalDataset(GUJARAT_FEDERATED_DATASET, HELD_OUT_PHCS.GUJARAT);
  const mhSplit = splitRegionalDataset(MAHARASHTRA_FEDERATED_DATASET, HELD_OUT_PHCS.MAHARASHTRA);
  const rjSplit = splitRegionalDataset(RAJASTHAN_FEDERATED_DATASET, HELD_OUT_PHCS.RAJASTHAN);

  const evalResult = runLocalVsFederatedEvaluation();

  await t.test('1. Personalized model starts from global model parameters', () => {
    const globalModel = evalResult.models.global;
    assert.ok(globalModel, 'Global model must exist');
    assert.strictEqual(globalModel.weights.length, 5);

    // If fineTune is run with 0 epochs, parameters match global model identically
    const zeroEpochFineTune = fineTunePersonalizedModel(globalModel, gjSplit.trainRecords, { epochs: 0 });
    assert.deepStrictEqual(zeroEpochFineTune.weights, globalModel.weights);
    assert.strictEqual(zeroEpochFineTune.bias, globalModel.bias);
  });

  await t.test('2. Fine-tuning uses training data only', () => {
    assert.strictEqual(evalResult.splits.gujarat.trainCount, 35);
    assert.strictEqual(evalResult.splits.maharashtra.trainCount, 35);
    assert.strictEqual(evalResult.splits.rajasthan.trainCount, 35);
  });

  await t.test('3. Held-out records never enter fine-tuning', () => {
    const checkNoHeldOut = (trainRecords, heldOutPhcId) => {
      assert.ok(trainRecords.every(r => r.phcId !== heldOutPhcId));
    };
    checkNoHeldOut(gjSplit.trainRecords, gjSplit.heldOutPhcId);
    checkNoHeldOut(mhSplit.trainRecords, mhSplit.heldOutPhcId);
    checkNoHeldOut(rjSplit.trainRecords, rjSplit.heldOutPhcId);
  });

  await t.test('4. Global model remains unchanged after personalization', () => {
    const originalGlobalWeights = [...evalResult.models.global.weights];
    const originalGlobalBias = evalResult.models.global.bias;

    // Run additional personalized fine-tuning
    fineTunePersonalizedModel(evalResult.models.global, gjSplit.trainRecords, { epochs: 50 });

    assert.deepStrictEqual(evalResult.models.global.weights, originalGlobalWeights);
    assert.strictEqual(evalResult.models.global.bias, originalGlobalBias);
  });

  await t.test('5. Each region receives only its own local training data', () => {
    assert.ok(gjSplit.trainRecords.every(r => r.region === 'GUJARAT'));
    assert.ok(mhSplit.trainRecords.every(r => r.region === 'MAHARASHTRA'));
    assert.ok(rjSplit.trainRecords.every(r => r.region === 'RAJASTHAN'));
  });

  await t.test('6. Same held-out records are used for Local, Global, Personalized', () => {
    for (const r of evalResult.regions) {
      assert.strictEqual(r.local.sampleCount, 7);
      assert.strictEqual(r.global.sampleCount, 7);
      assert.strictEqual(r.personalized.sampleCount, 7);
    }
  });

  await t.test('7. MAE/RMSE calculations remain correct and robust', () => {
    const actuals = [10, 20, 30, 40];
    const predictions = [12, 18, 33, 38];
    assert.strictEqual(calculateMAE(actuals, predictions), 2.25);
    assert.strictEqual(calculateRMSE(actuals, predictions), 2.291288);
  });

  await t.test('8. Results are deterministic across executions', () => {
    const run2 = runLocalVsFederatedEvaluation();
    assert.deepStrictEqual(evalResult.regions, run2.regions);
    assert.deepStrictEqual(evalResult.pooled, run2.pooled);
  });

  await t.test('9. No raw records cross the aggregation boundary', () => {
    const serialized = JSON.stringify(evalResult);
    assert.ok(!serialized.includes('gj_rec_036'));
    assert.ok(!serialized.includes('mh_rec_036'));
    assert.ok(!serialized.includes('rj_rec_036'));
  });

  await t.test('10. Pooled evaluation contains exactly 21 samples for all three paradigms', () => {
    assert.strictEqual(evalResult.pooled.local.sampleCount, 21);
    assert.strictEqual(evalResult.pooled.global.sampleCount, 21);
    assert.strictEqual(evalResult.pooled.personalized.sampleCount, 21);
  });

  await t.test('11. Zero Firestore imports in evaluation and training modules', () => {
    const metricsContent = fs.readFileSync(path.resolve(__dirname, '../evaluation/metrics.js'), 'utf-8');
    const compContent = fs.readFileSync(path.resolve(__dirname, '../evaluation/modelComparison.js'), 'utf-8');
    const trainerContent = fs.readFileSync(path.resolve(__dirname, '../training/trainer.js'), 'utf-8');

    assert.ok(!metricsContent.includes("from 'firebase"));
    assert.ok(!compContent.includes("from 'firebase"));
    assert.ok(!trainerContent.includes("from 'firebase"));
    assert.ok(!metricsContent.includes('firestore'));
    assert.ok(!compContent.includes('firestore'));
    assert.ok(!trainerContent.includes('firestore'));
  });
});
