/**
 * MedPulse Federated Learning Prototype — Regional Node Interfaces
 *
 * Encapsulates isolated local training for each regional edge node.
 * Strictly enforces regional boundary checks and zero cross-node data leakage.
 */

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';
import { trainLocalModel, createLocalModelUpdate } from '../training/trainer.js';
import { predict } from '../models/linearRegression.js';

export const REGIONAL_NODE_CONFIGS = {
  GUJARAT: {
    nodeId: 'node_gujarat',
    region: 'GUJARAT',
    dataset: GUJARAT_FEDERATED_DATASET
  },
  MAHARASHTRA: {
    nodeId: 'node_maharashtra',
    region: 'MAHARASHTRA',
    dataset: MAHARASHTRA_FEDERATED_DATASET
  },
  RAJASTHAN: {
    nodeId: 'node_rajasthan',
    region: 'RAJASTHAN',
    dataset: RAJASTHAN_FEDERATED_DATASET
  }
};

/**
 * Creates an isolated edge node instance for a specified region.
 * @param {string} regionName - 'GUJARAT' | 'MAHARASHTRA' | 'RAJASTHAN'
 * @param {Array<Object>} [customData=null] - Optional local records override
 * @returns {Object} regionalNode
 */
export function createRegionalNode(regionName, customData = null) {
  const normRegion = String(regionName || '').toUpperCase();
  const config = REGIONAL_NODE_CONFIGS[normRegion];

  if (!config) {
    throw new Error(`Unsupported region: ${regionName}. Allowed regions: GUJARAT, MAHARASHTRA, RAJASTHAN.`);
  }

  const rawDataset = customData || config.dataset;
  
  // Validate that dataset contains only records for this specific region
  const localData = rawDataset.filter(record => {
    if (!record || typeof record !== 'object') return false;
    if (record.region !== config.region) {
      throw new Error(`Cross-region contamination detected: Record ${record.recordId} with region "${record.region}" rejected by ${config.nodeId} (expected "${config.region}")`);
    }
    return true;
  });

  let trainedState = null;

  return {
    nodeId: config.nodeId,
    region: config.region,
    sampleCount: localData.length,
    
    /**
     * Executes local training strictly on the bound regional dataset.
     */
    train(options = {}) {
      trainedState = trainLocalModel(localData, {
        ...options,
        nodeId: config.nodeId,
        region: config.region
      });
      return trainedState;
    },

    /**
     * Gets the current trained model instance (if trained).
     */
    getModel() {
      if (!trainedState) {
        throw new Error(`Node ${config.nodeId} has not been trained yet. Call node.train() first.`);
      }
      return trainedState.model;
    },

    /**
     * Generates a local, serializable model update packet without exporting raw data.
     */
    getLocalUpdate() {
      if (!trainedState) {
        this.train();
      }
      return createLocalModelUpdate(trainedState);
    },

    /**
     * Evaluates prediction using the locally trained model.
     */
    predict(sample) {
      if (!trainedState) {
        this.train();
      }
      return predict(trainedState.model, sample);
    }
  };
}

export function createGujaratNode(customData = null) {
  return createRegionalNode('GUJARAT', customData);
}

export function createMaharashtraNode(customData = null) {
  return createRegionalNode('MAHARASHTRA', customData);
}

export function createRajasthanNode(customData = null) {
  return createRegionalNode('RAJASTHAN', customData);
}

export function createRegionalNodes() {
  return [
    createGujaratNode(),
    createMaharashtraNode(),
    createRajasthanNode()
  ];
}

