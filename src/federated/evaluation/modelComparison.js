/**
 * MedPulse Federated Learning Prototype — Local vs. Global vs. Personalized Model Comparison
 *
 * Evaluates three paradigm configurations on identical held-out test datasets:
 * 1. Local-Only Baseline: Trained strictly on isolated regional training records.
 * 2. Global Federated Model: Sample-weighted FedAvg consensus across regions.
 * 3. Personalized Federated Model: Global model fine-tuned on local regional training records.
 *
 * SCIENTIFIC INTEGRITY & ZERO LEAKAGE:
 * - Held-out test records are strictly excluded from local training, global FedAvg, and fine-tuning.
 * - All three models are evaluated on the EXACT SAME 7 held-out records per region (21 pooled).
 * - Zero hardcoded outcomes, zero metric manipulation.
 * - Zero Firestore, zero network, zero Gemini calls.
 */

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';
import { trainLocalModel, fineTunePersonalizedModel } from '../training/trainer.js';
import { aggregateModelUpdates } from '../aggregation/aggregator.js';
import { calculateMAE, calculateRMSE, evaluateModel } from './metrics.js';

export const HELD_OUT_PHCS = {
  GUJARAT: 'phc_gj_mokhasan',
  MAHARASHTRA: 'phc_mh_manor',
  RAJASTHAN: 'phc_rj_kotputli'
};

/**
 * Deterministically splits a regional dataset into training (35 records) and held-out test (7 records).
 *
 * @param {Array<Object>} dataset - 42-record regional dataset
 * @param {string} [heldOutPhcId] - Optional explicit PHC identifier for the held-out facility
 * @returns {{ trainRecords: Array<Object>, evalRecords: Array<Object>, heldOutPhcId: string }}
 */
export function splitRegionalDataset(dataset, heldOutPhcId = null) {
  if (!Array.isArray(dataset)) {
    throw new Error('splitRegionalDataset: dataset must be an array');
  }

  if (dataset.length === 0) {
    throw new Error('splitRegionalDataset: dataset must not be empty');
  }

  let targetPhcId = heldOutPhcId;
  if (!targetPhcId || !dataset.some(r => r.phcId === targetPhcId)) {
    targetPhcId = dataset[35] ? dataset[35].phcId : dataset[dataset.length - 1].phcId;
  }

  const trainRecords = dataset.filter(r => r.phcId !== targetPhcId);
  const evalRecords = dataset.filter(r => r.phcId === targetPhcId);

  if (trainRecords.length !== 35) {
    throw new Error(`splitRegionalDataset: expected 35 training records, got ${trainRecords.length}`);
  }
  if (evalRecords.length !== 7) {
    throw new Error(`splitRegionalDataset: expected 7 evaluation records, got ${evalRecords.length}`);
  }

  return { trainRecords, evalRecords, heldOutPhcId: targetPhcId };
}

/**
 * Runs the full Local vs. Global vs. Personalized evaluation experiment.
 *
 * @returns {Object} comparisonResult
 */
export function runLocalVsFederatedEvaluation() {
  // 1. Deterministic splits for all three regions (35 train, 7 held-out eval each)
  const gjSplit = splitRegionalDataset(GUJARAT_FEDERATED_DATASET, HELD_OUT_PHCS.GUJARAT);
  const mhSplit = splitRegionalDataset(MAHARASHTRA_FEDERATED_DATASET, HELD_OUT_PHCS.MAHARASHTRA);
  const rjSplit = splitRegionalDataset(RAJASTHAN_FEDERATED_DATASET, HELD_OUT_PHCS.RAJASTHAN);

  // 2. Train local baseline models strictly on 35 regional training records ONLY
  const gjLocalTrain = trainLocalModel(gjSplit.trainRecords, { nodeId: 'node_gujarat', region: 'GUJARAT' });
  const mhLocalTrain = trainLocalModel(mhSplit.trainRecords, { nodeId: 'node_maharashtra', region: 'MAHARASHTRA' });
  const rjLocalTrain = trainLocalModel(rjSplit.trainRecords, { nodeId: 'node_rajasthan', region: 'RAJASTHAN' });

  // 3. Generate global federated model via FedAvg across local updates (105 training samples)
  const globalModel = aggregateModelUpdates([
    gjLocalTrain.modelUpdate,
    mhLocalTrain.modelUpdate,
    rjLocalTrain.modelUpdate
  ]);

  // 4. Fine-tune personalized models initialized from the global model on local training data
  const gjPersonalized = fineTunePersonalizedModel(globalModel, gjSplit.trainRecords, { nodeId: 'node_gujarat', region: 'GUJARAT' });
  const mhPersonalized = fineTunePersonalizedModel(globalModel, mhSplit.trainRecords, { nodeId: 'node_maharashtra', region: 'MAHARASHTRA' });
  const rjPersonalized = fineTunePersonalizedModel(globalModel, rjSplit.trainRecords, { nodeId: 'node_rajasthan', region: 'RAJASTHAN' });

  // 5. Evaluate all three models on the exact same 7 held-out records per region
  const regionConfigs = [
    {
      region: 'GUJARAT',
      heldOutPhc: gjSplit.heldOutPhcId,
      localModel: gjLocalTrain.model,
      personalizedModel: gjPersonalized.model,
      evalRecords: gjSplit.evalRecords
    },
    {
      region: 'MAHARASHTRA',
      heldOutPhc: mhSplit.heldOutPhcId,
      localModel: mhLocalTrain.model,
      personalizedModel: mhPersonalized.model,
      evalRecords: mhSplit.evalRecords
    },
    {
      region: 'RAJASTHAN',
      heldOutPhc: rjSplit.heldOutPhcId,
      localModel: rjLocalTrain.model,
      personalizedModel: rjPersonalized.model,
      evalRecords: rjSplit.evalRecords
    }
  ];

  const regionalResults = [];
  const pooledLocalActuals = [];
  const pooledLocalPreds = [];
  const pooledGlobalActuals = [];
  const pooledGlobalPreds = [];
  const pooledPersonalizedActuals = [];
  const pooledPersonalizedPreds = [];

  for (const config of regionConfigs) {
    const localEval = evaluateModel(config.localModel, config.evalRecords);
    const globalEval = evaluateModel(globalModel, config.evalRecords);
    const personalizedEval = evaluateModel(config.personalizedModel, config.evalRecords);

    regionalResults.push({
      region: config.region,
      heldOutPhc: config.heldOutPhc,
      local: {
        sampleCount: localEval.sampleCount,
        mae: localEval.mae,
        rmse: localEval.rmse
      },
      global: {
        sampleCount: globalEval.sampleCount,
        mae: globalEval.mae,
        rmse: globalEval.rmse
      },
      personalized: {
        sampleCount: personalizedEval.sampleCount,
        mae: personalizedEval.mae,
        rmse: personalizedEval.rmse
      },
      differences: {
        globalVsLocalMAE: Number((globalEval.mae - localEval.mae).toFixed(6)),
        personalizedVsLocalMAE: Number((personalizedEval.mae - localEval.mae).toFixed(6)),
        personalizedVsGlobalMAE: Number((personalizedEval.mae - globalEval.mae).toFixed(6))
      }
    });

    // Accumulate for pooled metrics
    pooledLocalActuals.push(...localEval.actuals);
    pooledLocalPreds.push(...localEval.predictions);
    pooledGlobalActuals.push(...globalEval.actuals);
    pooledGlobalPreds.push(...globalEval.predictions);
    pooledPersonalizedActuals.push(...personalizedEval.actuals);
    pooledPersonalizedPreds.push(...personalizedEval.predictions);
  }

  // 6. Compute pooled metrics across all 21 held-out samples
  const pooledLocalMAE = calculateMAE(pooledLocalActuals, pooledLocalPreds);
  const pooledLocalRMSE = calculateRMSE(pooledLocalActuals, pooledLocalPreds);
  const pooledGlobalMAE = calculateMAE(pooledGlobalActuals, pooledGlobalPreds);
  const pooledGlobalRMSE = calculateRMSE(pooledGlobalActuals, pooledGlobalPreds);
  const pooledPersonalizedMAE = calculateMAE(pooledPersonalizedActuals, pooledPersonalizedPreds);
  const pooledPersonalizedRMSE = calculateRMSE(pooledPersonalizedActuals, pooledPersonalizedPreds);

  const pooledResult = {
    local: {
      sampleCount: pooledLocalActuals.length,
      mae: pooledLocalMAE,
      rmse: pooledLocalRMSE
    },
    global: {
      sampleCount: pooledGlobalActuals.length,
      mae: pooledGlobalMAE,
      rmse: pooledGlobalRMSE
    },
    personalized: {
      sampleCount: pooledPersonalizedActuals.length,
      mae: pooledPersonalizedMAE,
      rmse: pooledPersonalizedRMSE
    },
    differences: {
      globalVsLocalMAE: Number((pooledGlobalMAE - pooledLocalMAE).toFixed(6)),
      personalizedVsLocalMAE: Number((pooledPersonalizedMAE - pooledLocalMAE).toFixed(6)),
      personalizedVsGlobalMAE: Number((pooledPersonalizedMAE - pooledGlobalMAE).toFixed(6))
    }
  };

  return {
    regions: regionalResults,
    pooled: pooledResult,
    models: {
      local: {
        node_gujarat: gjLocalTrain.model,
        node_maharashtra: mhLocalTrain.model,
        node_rajasthan: rjLocalTrain.model
      },
      global: globalModel,
      personalized: {
        node_gujarat: gjPersonalized.model,
        node_maharashtra: mhPersonalized.model,
        node_rajasthan: rjPersonalized.model
      }
    },
    splits: {
      gujarat: { trainCount: gjSplit.trainRecords.length, evalCount: gjSplit.evalRecords.length },
      maharashtra: { trainCount: mhSplit.trainRecords.length, evalCount: mhSplit.evalRecords.length },
      rajasthan: { trainCount: rjSplit.trainRecords.length, evalCount: rjSplit.evalRecords.length }
    }
  };
}

// CLI Execution Helper to display the exact 3-model comparison table
export function printEvaluationReport() {
  const result = runLocalVsFederatedEvaluation();

  console.log('================================================================================================');
  console.log('    MedPulse Federated Learning — Local vs. Global vs. Personalized Model Evaluation Report');
  console.log('================================================================================================\n');

  console.log('REGION        | MODEL                 | SAMPLES | MAE      | RMSE');
  console.log('------------- | --------------------- | ------- | -------- | --------');

  for (const r of result.regions) {
    console.log(`${r.region.padEnd(13)} | Local Baseline        | ${String(r.local.sampleCount).padEnd(7)} | ${r.local.mae.toFixed(4).padEnd(8)} | ${r.local.rmse.toFixed(4)}`);
    console.log(`${r.region.padEnd(13)} | Global Federated      | ${String(r.global.sampleCount).padEnd(7)} | ${r.global.mae.toFixed(4).padEnd(8)} | ${r.global.rmse.toFixed(4)}`);
    console.log(`${r.region.padEnd(13)} | Personalized Fed      | ${String(r.personalized.sampleCount).padEnd(7)} | ${r.personalized.mae.toFixed(4).padEnd(8)} | ${r.personalized.rmse.toFixed(4)}`);
    console.log('------------- | --------------------- | ------- | -------- | --------');
  }

  console.log(`${'Pooled'.padEnd(13)} | Local Baseline        | ${String(result.pooled.local.sampleCount).padEnd(7)} | ${result.pooled.local.mae.toFixed(4).padEnd(8)} | ${result.pooled.local.rmse.toFixed(4)}`);
  console.log(`${'Pooled'.padEnd(13)} | Global Federated      | ${String(result.pooled.global.sampleCount).padEnd(7)} | ${result.pooled.global.mae.toFixed(4).padEnd(8)} | ${result.pooled.global.rmse.toFixed(4)}`);
  console.log(`${'Pooled'.padEnd(13)} | Personalized Fed      | ${String(result.pooled.personalized.sampleCount).padEnd(7)} | ${result.pooled.personalized.mae.toFixed(4).padEnd(8)} | ${result.pooled.personalized.rmse.toFixed(4)}`);

  console.log('\n================================================================================================\n');

  return result;
}

if (process.argv[1] && process.argv[1].endsWith('modelComparison.js')) {
  printEvaluationReport();
}
