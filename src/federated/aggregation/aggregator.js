/**
 * MedPulse Federated Learning Prototype — Federated Aggregator
 *
 * Implements sample-count-weighted Federated Averaging (FedAvg).
 * Aggregates only decentralized model updates (weights, bias, metadata).
 *
 * PRIVACY GUARANTEE:
 * Receives ZERO raw patient/facility records, ZERO PII, ZERO Firestore connections.
 */

import { FEATURE_NAMES } from '../models/linearRegression.js';

export const AGGREGATION_METHODS = {
  SAMPLE_WEIGHTED_FEDAVG: 'SAMPLE_WEIGHTED_FEDAVG'
};

export const DEFAULT_MODEL_TYPE = 'RIDGE_LINEAR_REGRESSION';

/**
 * Validates array of local model updates prior to aggregation.
 * Rejects corrupt, incomplete, mismatched, or duplicate updates.
 *
 * @param {Array<Object>} updates - Array of local model update packets
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateModelUpdates(updates) {
  if (!Array.isArray(updates)) {
    return { valid: false, error: 'Updates must be a non-empty array' };
  }

  if (updates.length === 0) {
    return { valid: false, error: 'Updates array is empty' };
  }

  if (updates.length < 2) {
    return { valid: false, error: 'Federated aggregation requires at least 2 participating model updates' };
  }

  const seenNodes = new Set();
  const baselineVersion = updates[0]?.modelVersion;
  const baselineFeatures = updates[0]?.featureNames;
  const baselineNumFeatures = Array.isArray(baselineFeatures) ? baselineFeatures.length : 0;

  if (!baselineVersion || typeof baselineVersion !== 'string') {
    return { valid: false, error: 'First update is missing valid modelVersion' };
  }

  if (!Array.isArray(baselineFeatures) || baselineFeatures.length === 0) {
    return { valid: false, error: 'First update is missing valid featureNames list' };
  }

  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    if (!u || typeof u !== 'object') {
      return { valid: false, error: `Update at index ${i} is not a valid object` };
    }

    // Node ID validation
    if (!u.nodeId || typeof u.nodeId !== 'string') {
      return { valid: false, error: `Update at index ${i} is missing a valid nodeId string` };
    }

    if (seenNodes.has(u.nodeId)) {
      return { valid: false, error: `Duplicate nodeId detected in aggregation: "${u.nodeId}"` };
    }
    seenNodes.add(u.nodeId);

    // Region validation
    if (!u.region || typeof u.region !== 'string') {
      return { valid: false, error: `Update from node "${u.nodeId}" is missing valid region` };
    }

    // Model version compatibility
    if (u.modelVersion !== baselineVersion) {
      return {
        valid: false,
        error: `Model version mismatch: Node "${u.nodeId}" has version "${u.modelVersion}", expected "${baselineVersion}"`
      };
    }

    // Sample count validation
    if (typeof u.sampleCount !== 'number' || !Number.isFinite(u.sampleCount) || u.sampleCount <= 0) {
      return { valid: false, error: `Node "${u.nodeId}" has invalid or non-positive sampleCount: ${u.sampleCount}` };
    }

    // Feature names and ordering validation
    if (!Array.isArray(u.featureNames) || u.featureNames.length !== baselineNumFeatures) {
      return {
        valid: false,
        error: `Feature count mismatch: Node "${u.nodeId}" has ${u.featureNames ? u.featureNames.length : 0} features, expected ${baselineNumFeatures}`
      };
    }

    for (let f = 0; f < baselineNumFeatures; f++) {
      if (u.featureNames[f] !== baselineFeatures[f]) {
        return {
          valid: false,
          error: `Feature ordering mismatch at index ${f}: Node "${u.nodeId}" has "${u.featureNames[f]}", expected "${baselineFeatures[f]}"`
        };
      }
    }

    // Weights validation
    if (!Array.isArray(u.weights) || u.weights.length !== baselineNumFeatures) {
      return {
        valid: false,
        error: `Weight vector length mismatch on node "${u.nodeId}": length is ${u.weights ? u.weights.length : 0}, expected ${baselineNumFeatures}`
      };
    }

    for (let w = 0; w < u.weights.length; w++) {
      const weightVal = u.weights[w];
      if (typeof weightVal !== 'number' || !Number.isFinite(weightVal)) {
        return {
          valid: false,
          error: `Non-numeric weight value at index ${w} on node "${u.nodeId}": ${weightVal}`
        };
      }
    }

    // Bias validation
    if (typeof u.bias !== 'number' || !Number.isFinite(u.bias)) {
      return { valid: false, error: `Invalid or non-numeric bias on node "${u.nodeId}": ${u.bias}` };
    }
  }

  return { valid: true };
}

/**
 * Performs Sample-Weighted Federated Averaging (FedAvg) across validated local model updates.
 *
 * @param {Array<Object>} updates - List of local model update packets
 * @param {Object} [options={}] - Aggregation options
 * @returns {Object} globalModel
 */
export function aggregateModelUpdates(updates, options = {}) {
  const validation = validateModelUpdates(updates);
  if (!validation.valid) {
    throw new Error(`Federated Aggregation Failed: ${validation.error}`);
  }

  const modelType = options.modelType || DEFAULT_MODEL_TYPE;
  const modelVersion = updates[0].modelVersion;
  const featureNames = [...updates[0].featureNames];
  const numFeatures = featureNames.length;
  const participatingNodes = updates.map(u => u.nodeId);

  // 1. Calculate total dataset sample size across all nodes
  const totalSampleCount = updates.reduce((acc, u) => acc + u.sampleCount, 0);

  // 2. Calculate normalized aggregation weight for each node: w_k = n_k / N
  const aggregationWeights = {};
  for (const u of updates) {
    aggregationWeights[u.nodeId] = Number((u.sampleCount / totalSampleCount).toFixed(6));
  }

  // 3. Aggregate weights vector via weighted sum: globalWeight[j] = sum( (n_k / N) * weight_k[j] )
  const globalWeights = new Array(numFeatures).fill(0.0);
  for (let j = 0; j < numFeatures; j++) {
    let weightedSum = 0.0;
    for (const u of updates) {
      weightedSum += (u.sampleCount / totalSampleCount) * u.weights[j];
    }
    globalWeights[j] = Number(weightedSum.toFixed(6));
  }

  // 4. Aggregate bias term via weighted sum: globalBias = sum( (n_k / N) * bias_k )
  let weightedBiasSum = 0.0;
  for (const u of updates) {
    weightedBiasSum += (u.sampleCount / totalSampleCount) * u.bias;
  }
  const globalBias = Number(weightedBiasSum.toFixed(6));

  // 5. Aggregate training loss as metadata (not a model parameter)
  let weightedLossSum = 0.0;
  let hasLoss = true;
  for (const u of updates) {
    if (typeof u.loss === 'number' && Number.isFinite(u.loss)) {
      weightedLossSum += (u.sampleCount / totalSampleCount) * u.loss;
    } else {
      hasLoss = false;
    }
  }
  const weightedAverageLoss = hasLoss ? Number(weightedLossSum.toFixed(6)) : null;

  return {
    modelType,
    modelVersion,
    aggregationMethod: AGGREGATION_METHODS.SAMPLE_WEIGHTED_FEDAVG,
    participatingNodes,
    totalSampleCount,
    featureNames,
    weights: globalWeights,
    bias: globalBias,
    aggregationWeights,
    metadata: {
      aggregatedAt: new Date().toISOString(),
      nodeCount: participatingNodes.length,
      weightedAverageLoss
    }
  };
}
