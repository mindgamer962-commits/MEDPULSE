/**
 * MedPulse Federated Learning Prototype — Local Node Trainer
 *
 * Trains an isolated local Ridge regression model on regional data.
 * Pure JavaScript, deterministic gradient descent with L2 regularization.
 * Zero Firestore connection, zero cross-node communication.
 */

import { FEATURE_NAMES, createLocalModel } from '../models/linearRegression.js';

export const DEFAULT_TRAINING_OPTIONS = {
  learningRate: 0.05,
  l2Regularization: 0.01,
  epochs: 300,
  modelVersion: '1.0.0'
};

/**
 * Validates and extracts feature matrix and target vector from local dataset.
 * Rejects invalid/non-finite records and avoids mutating the source data.
 */
function extractFeaturesAndTargets(dataset, featureNames) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error('Local dataset must be a non-empty array');
  }

  const X = [];
  const y = [];
  const validRecords = [];

  for (let idx = 0; idx < dataset.length; idx++) {
    const record = dataset[idx];
    if (!record || typeof record !== 'object') {
      continue; // Skip invalid record
    }

    // Validate target
    const target = record.targetDemand;
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0) {
      continue; // Skip invalid target
    }

    // Validate and extract features
    let hasInvalidFeature = false;
    const row = [];
    for (const featName of featureNames) {
      const val = record[featName];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        hasInvalidFeature = true;
        break;
      }
      row.push(val);
    }

    if (hasInvalidFeature) {
      continue; // Skip record with non-finite feature
    }

    X.push(row);
    y.push(target);
    validRecords.push(record);
  }

  if (X.length === 0) {
    throw new Error('No valid finite records found in the supplied local dataset');
  }

  return { X, y, validRecords };
}

/**
 * Computes mean squared error + L2 penalty loss.
 */
function computeLoss(weights, bias, X, y, lambda) {
  const N = X.length;
  let sse = 0;
  for (let i = 0; i < N; i++) {
    let yHat = bias;
    for (let j = 0; j < weights.length; j++) {
      yHat += weights[j] * X[i][j];
    }
    const err = yHat - y[i];
    sse += err * err;
  }

  let l2 = 0;
  for (let j = 0; j < weights.length; j++) {
    l2 += weights[j] * weights[j];
  }

  return (sse / (2 * N)) + (0.5 * lambda * l2);
}

/**
 * Trains a local Ridge regression model on isolated regional dataset.
 *
 * @param {Array<Object>} localData - Synthetic local records
 * @param {Object} options - Node configuration and hyperparameters
 * @returns {Object} trainingResult
 */
export function trainLocalModel(localData, options = {}) {
  const config = { ...DEFAULT_TRAINING_OPTIONS, ...options };
  const featureNames = [...FEATURE_NAMES];
  const numFeatures = featureNames.length;

  const nodeId = config.nodeId || 'node_local';
  const region = config.region || (localData && localData[0] ? localData[0].region : 'UNKNOWN');
  const modelVersion = config.modelVersion || '1.0.0';

  // 1. Extract and validate data
  const { X, y, validRecords } = extractFeaturesAndTargets(localData, featureNames);
  const N = X.length;

  // 2. Compute mean & standard deviation for stable gradient descent
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);

  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += X[i][j];
    }
    means[j] = sum / N;

    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const diff = X[i][j] - means[j];
      sumSq += diff * diff;
    }
    stds[j] = Math.sqrt(sumSq / N) || 1.0;
  }

  // Standardize X matrix
  const Z = X.map(row => row.map((val, j) => (val - means[j]) / stds[j]));

  // 3. Initialize weights and bias deterministically (cold start or warm start from initialModel)
  let weightsNorm = new Array(numFeatures).fill(0.0);
  let biasNorm = y.reduce((acc, v) => acc + v, 0) / N; // default: mean target

  if (config.initialModel && Array.isArray(config.initialModel.weights) && typeof config.initialModel.bias === 'number') {
    for (let j = 0; j < numFeatures; j++) {
      weightsNorm[j] = config.initialModel.weights[j] * stds[j];
    }
    let initialBiasOffset = 0.0;
    for (let j = 0; j < numFeatures; j++) {
      initialBiasOffset += config.initialModel.weights[j] * means[j];
    }
    biasNorm = config.initialModel.bias + initialBiasOffset;
  }

  const lr = config.learningRate;
  const lambda = config.l2Regularization;
  const epochs = config.epochs;


  // 4. Gradient Descent Optimization
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(numFeatures).fill(0.0);
    let gradB = 0.0;

    for (let i = 0; i < N; i++) {
      let yHat = biasNorm;
      for (let j = 0; j < numFeatures; j++) {
        yHat += weightsNorm[j] * Z[i][j];
      }
      const error = yHat - y[i];

      gradB += error;
      for (let j = 0; j < numFeatures; j++) {
        gradW[j] += error * Z[i][j];
      }
    }

    // Apply average gradient + L2 penalty for weights
    biasNorm -= lr * (gradB / N);
    for (let j = 0; j < numFeatures; j++) {
      const g = (gradW[j] / N) + (lambda * weightsNorm[j]);
      weightsNorm[j] -= lr * g;
    }
  }

  // 5. Transform normalized weights back to raw feature space
  // raw_yHat = sum((w_norm_j / std_j) * x_j) + (b_norm - sum((w_norm_j / std_j) * mean_j))
  const weights = weightsNorm.map((w, j) => Number((w / stds[j]).toFixed(6)));
  
  let biasOffset = 0.0;
  for (let j = 0; j < numFeatures; j++) {
    biasOffset += weights[j] * means[j];
  }
  const bias = Number((biasNorm - biasOffset).toFixed(6));

  // Compute final training loss in raw space
  const rawLoss = Number(computeLoss(weights, bias, X, y, lambda).toFixed(6));

  const trainedModel = createLocalModel({
    modelVersion,
    featureNames,
    weights,
    bias
  });

  const modelUpdate = {
    nodeId,
    region,
    modelVersion,
    sampleCount: validRecords.length,
    featureNames: [...featureNames],
    weights: [...weights],
    bias,
    loss: rawLoss
  };

  return {
    nodeId,
    region,
    modelVersion,
    trainingSamples: validRecords.length,
    featureNames,
    weights,
    bias,
    loss: rawLoss,
    model: trainedModel,
    modelUpdate
  };
}

/**
 * Creates a standalone serializable local model update packet.
 * @param {Object} trainingResult 
 * @returns {Object} localModelUpdate
 */
export function createLocalModelUpdate(trainingResult) {
  if (!trainingResult || !Array.isArray(trainingResult.weights)) {
    throw new Error('Invalid training result provided to createLocalModelUpdate');
  }

  return {
    nodeId: trainingResult.nodeId,
    region: trainingResult.region,
    modelVersion: trainingResult.modelVersion,
    sampleCount: trainingResult.trainingSamples || trainingResult.sampleCount,
    featureNames: [...(trainingResult.featureNames || FEATURE_NAMES)],
    weights: [...trainingResult.weights],
    bias: trainingResult.bias,
    loss: trainingResult.loss
  };
}

/**
 * Fine-tunes a global federated model on isolated local regional training data to produce
 * a personalized regional model.
 *
 * @param {Object} globalModel - Validated global federated model
 * @param {Array<Object>} localTrainData - Regional local training records
 * @param {Object} [options={}] - Hyperparameters for fine-tuning
 * @returns {Object} personalizedTrainingResult
 */
export function fineTunePersonalizedModel(globalModel, localTrainData, options = {}) {
  if (!globalModel || !Array.isArray(globalModel.weights) || typeof globalModel.bias !== 'number') {
    throw new Error('fineTunePersonalizedModel: valid globalModel required');
  }

  const fineTuneOptions = {
    learningRate: 0.05,
    l2Regularization: 0.01,
    epochs: 100,
    ...options,
    initialModel: globalModel,
    modelVersion: `${globalModel.modelVersion || '1.0.0'}-personalized`
  };

  return trainLocalModel(localTrainData, fineTuneOptions);
}


