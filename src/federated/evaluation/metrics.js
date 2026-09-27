/**
 * MedPulse Federated Learning Prototype — Evaluation Metrics
 *
 * Provides pure, deterministic regression evaluation functions (MAE, RMSE)
 * with strict numerical validation.
 *
 * ZERO dependencies, ZERO Firestore, ZERO external API calls.
 */

import { predict } from '../models/linearRegression.js';

/**
 * Calculates Mean Absolute Error (MAE) between ground truth actuals and model predictions.
 *
 * MAE = (1 / N) * sum(|actual_i - prediction_i|)
 *
 * @param {Array<number>} actuals
 * @param {Array<number>} predictions
 * @returns {number} mae
 */
export function calculateMAE(actuals, predictions) {
  if (!Array.isArray(actuals) || !Array.isArray(predictions)) {
    throw new Error('calculateMAE: actuals and predictions must be arrays');
  }

  if (actuals.length === 0 || predictions.length === 0) {
    throw new Error('calculateMAE: arrays must not be empty');
  }

  if (actuals.length !== predictions.length) {
    throw new Error(`calculateMAE: length mismatch (actuals: ${actuals.length}, predictions: ${predictions.length})`);
  }

  let totalAbsError = 0.0;
  for (let i = 0; i < actuals.length; i++) {
    const act = actuals[i];
    const pred = predictions[i];

    if (typeof act !== 'number' || !Number.isFinite(act)) {
      throw new Error(`calculateMAE: invalid non-finite actual value at index ${i}: ${act}`);
    }
    if (typeof pred !== 'number' || !Number.isFinite(pred)) {
      throw new Error(`calculateMAE: invalid non-finite prediction value at index ${i}: ${pred}`);
    }

    totalAbsError += Math.abs(pred - act);
  }

  return Number((totalAbsError / actuals.length).toFixed(6));
}

/**
 * Calculates Root Mean Squared Error (RMSE) between actuals and predictions.
 *
 * RMSE = sqrt((1 / N) * sum((actual_i - prediction_i)^2))
 *
 * @param {Array<number>} actuals
 * @param {Array<number>} predictions
 * @returns {number} rmse
 */
export function calculateRMSE(actuals, predictions) {
  if (!Array.isArray(actuals) || !Array.isArray(predictions)) {
    throw new Error('calculateRMSE: actuals and predictions must be arrays');
  }

  if (actuals.length === 0 || predictions.length === 0) {
    throw new Error('calculateRMSE: arrays must not be empty');
  }

  if (actuals.length !== predictions.length) {
    throw new Error(`calculateRMSE: length mismatch (actuals: ${actuals.length}, predictions: ${predictions.length})`);
  }

  let totalSqError = 0.0;
  for (let i = 0; i < actuals.length; i++) {
    const act = actuals[i];
    const pred = predictions[i];

    if (typeof act !== 'number' || !Number.isFinite(act)) {
      throw new Error(`calculateRMSE: invalid non-finite actual value at index ${i}: ${act}`);
    }
    if (typeof pred !== 'number' || !Number.isFinite(pred)) {
      throw new Error(`calculateRMSE: invalid non-finite prediction value at index ${i}: ${pred}`);
    }

    const diff = pred - act;
    totalSqError += diff * diff;
  }

  return Number(Math.sqrt(totalSqError / actuals.length).toFixed(6));
}

/**
 * Evaluates a linear regression model on a set of target records.
 *
 * @param {Object} model - { weights, bias, featureNames }
 * @param {Array<Object>} records - Array of records with targetDemand & features
 * @returns {{ sampleCount: number, mae: number, rmse: number, actuals: Array<number>, predictions: Array<number> }}
 */
export function evaluateModel(model, records) {
  if (!model || typeof model !== 'object') {
    throw new Error('evaluateModel: valid model object required');
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('evaluateModel: records must be a non-empty array');
  }

  const actuals = [];
  const predictions = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || typeof record !== 'object') {
      throw new Error(`evaluateModel: invalid record at index ${i}`);
    }

    const target = record.targetDemand;
    if (typeof target !== 'number' || !Number.isFinite(target)) {
      throw new Error(`evaluateModel: missing or invalid targetDemand in record at index ${i}`);
    }

    const pred = predict(model, record);
    if (typeof pred !== 'number' || !Number.isFinite(pred)) {
      throw new Error(`evaluateModel: non-finite prediction for record at index ${i}`);
    }

    actuals.push(target);
    predictions.push(pred);
  }

  const mae = calculateMAE(actuals, predictions);
  const rmse = calculateRMSE(actuals, predictions);

  return {
    sampleCount: records.length,
    mae,
    rmse,
    actuals,
    predictions
  };
}
