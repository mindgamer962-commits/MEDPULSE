/**
 * MedPulse Federated Learning Prototype — Local Model Engine
 * Multivariate Linear Regression with L2 Regularization (Ridge)
 *
 * Designed exclusively for simulated decentralized edge training.
 * Zero external ML libraries, zero Firestore dependencies.
 */

export const FEATURE_NAMES = [
  'dayOfWeek',
  'recentFootfallAvg',
  'footfallTrendRatio',
  'currentOccupancyRate',
  'seasonalFactor'
];

/**
 * Creates an initialized local model structure.
 * @param {Object} options 
 * @returns {Object} model
 */
export function createLocalModel(options = {}) {
  const featureNames = options.featureNames ? [...options.featureNames] : [...FEATURE_NAMES];
  const numFeatures = featureNames.length;
  
  const weights = options.weights 
    ? [...options.weights] 
    : new Array(numFeatures).fill(0.0);
  const bias = typeof options.bias === 'number' && Number.isFinite(options.bias) 
    ? options.bias 
    : 0.0;
  const modelVersion = options.modelVersion || '1.0.0';

  return {
    modelVersion,
    featureNames,
    weights,
    bias
  };
}

/**
 * Evaluates prediction on a given feature record or feature array.
 * dotProduct(weights, features) + bias
 * @param {Object} model 
 * @param {Object|Array<number>} features 
 * @returns {number} prediction
 */
export function predict(model, features) {
  if (!model || !Array.isArray(model.weights) || !Array.isArray(model.featureNames)) {
    throw new Error('Invalid model provided to predict()');
  }

  let featureVector = [];
  if (Array.isArray(features)) {
    featureVector = features;
  } else if (typeof features === 'object' && features !== null) {
    featureVector = model.featureNames.map(f => {
      const val = features[f];
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error(`Missing or non-finite feature value for "${f}"`);
      }
      return val;
    });
  } else {
    throw new Error('Features must be an array or record object');
  }

  if (featureVector.length !== model.weights.length) {
    throw new Error(`Feature vector length (${featureVector.length}) must match weights length (${model.weights.length})`);
  }

  let prediction = model.bias;
  for (let i = 0; i < featureVector.length; i++) {
    const val = featureVector[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Feature at index ${i} is not a finite number`);
    }
    prediction += model.weights[i] * val;
  }

  return prediction;
}

/**
 * Serializes model to a pure JSON-compatible object.
 * @param {Object} model 
 * @returns {Object} serializedModel
 */
export function serializeModel(model) {
  if (!model) throw new Error('Cannot serialize null model');
  return {
    modelVersion: model.modelVersion,
    featureNames: [...model.featureNames],
    weights: model.weights.map(w => Number(w.toFixed(6))),
    bias: Number(model.bias.toFixed(6))
  };
}
