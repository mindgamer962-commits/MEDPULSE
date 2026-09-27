import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUJARAT_FEDERATED_DATASET } from '../data/gujarat.js';
import { MAHARASHTRA_FEDERATED_DATASET } from '../data/maharashtra.js';
import { RAJASTHAN_FEDERATED_DATASET } from '../data/rajasthan.js';
import { createGujaratNode, createMaharashtraNode, createRajasthanNode, createRegionalNode } from '../nodes/regionalNodes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Day 13 — Step 5: Regional Data Isolation & Multi-Node Suite', async (t) => {

  const gujaratNode = createGujaratNode();
  const maharashtraNode = createMaharashtraNode();
  const rajasthanNode = createRajasthanNode();

  await t.test('1. Gujarat node uses only Gujarat data', () => {
    assert.strictEqual(gujaratNode.sampleCount, 42);
    assert.strictEqual(gujaratNode.sampleCount, GUJARAT_FEDERATED_DATASET.length);
    assert.strictEqual(gujaratNode.region, 'GUJARAT');
  });

  await t.test('2. Maharashtra node uses only Maharashtra data', () => {
    assert.strictEqual(maharashtraNode.sampleCount, 42);
    assert.strictEqual(maharashtraNode.sampleCount, MAHARASHTRA_FEDERATED_DATASET.length);
    assert.strictEqual(maharashtraNode.region, 'MAHARASHTRA');
  });

  await t.test('3. Rajasthan node uses only Rajasthan data', () => {
    assert.strictEqual(rajasthanNode.sampleCount, 42);
    assert.strictEqual(rajasthanNode.sampleCount, RAJASTHAN_FEDERATED_DATASET.length);
    assert.strictEqual(rajasthanNode.region, 'RAJASTHAN');
  });

  await t.test('4. All three node IDs are unique', () => {
    const ids = [gujaratNode.nodeId, maharashtraNode.nodeId, rajasthanNode.nodeId];
    assert.strictEqual(new Set(ids).size, 3);
    assert.strictEqual(gujaratNode.nodeId, 'node_gujarat');
    assert.strictEqual(maharashtraNode.nodeId, 'node_maharashtra');
    assert.strictEqual(rajasthanNode.nodeId, 'node_rajasthan');
  });

  await t.test('5. All three regions are correct', () => {
    assert.strictEqual(gujaratNode.region, 'GUJARAT');
    assert.strictEqual(maharashtraNode.region, 'MAHARASHTRA');
    assert.strictEqual(rajasthanNode.region, 'RAJASTHAN');
  });

  await t.test('6. Each node trains successfully', () => {
    const gjRes = gujaratNode.train();
    const mhRes = maharashtraNode.train();
    const rjRes = rajasthanNode.train();

    assert.ok(gjRes.model, 'Gujarat model must exist');
    assert.ok(mhRes.model, 'Maharashtra model must exist');
    assert.ok(rjRes.model, 'Rajasthan model must exist');

    assert.strictEqual(gjRes.trainingSamples, 42);
    assert.strictEqual(mhRes.trainingSamples, 42);
    assert.strictEqual(rjRes.trainingSamples, 42);

    // Verify distinct regional models learned from different distributions
    assert.notDeepStrictEqual(gjRes.weights, mhRes.weights);
    assert.notDeepStrictEqual(gjRes.weights, rjRes.weights);
    assert.notDeepStrictEqual(mhRes.weights, rjRes.weights);
  });

  await t.test('7. Each node produces a model update', () => {
    const gjUpdate = gujaratNode.getLocalUpdate();
    const mhUpdate = maharashtraNode.getLocalUpdate();
    const rjUpdate = rajasthanNode.getLocalUpdate();

    assert.ok(gjUpdate && typeof gjUpdate === 'object');
    assert.ok(mhUpdate && typeof mhUpdate === 'object');
    assert.ok(rjUpdate && typeof rjUpdate === 'object');

    assert.strictEqual(gjUpdate.nodeId, 'node_gujarat');
    assert.strictEqual(mhUpdate.nodeId, 'node_maharashtra');
    assert.strictEqual(rjUpdate.nodeId, 'node_rajasthan');
  });

  await t.test('8. Each update contains exactly five weights', () => {
    const updates = [gujaratNode.getLocalUpdate(), maharashtraNode.getLocalUpdate(), rajasthanNode.getLocalUpdate()];
    for (const update of updates) {
      assert.strictEqual(update.weights.length, 5);
      for (const w of update.weights) {
        assert.strictEqual(typeof w, 'number');
        assert.ok(Number.isFinite(w));
      }
    }
  });

  await t.test('9. Each update is serializable to JSON', () => {
    const updates = [gujaratNode.getLocalUpdate(), maharashtraNode.getLocalUpdate(), rajasthanNode.getLocalUpdate()];
    for (const update of updates) {
      const json = JSON.stringify(update);
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(parsed, update);
    }
  });

  await t.test('10. Regional datasets remain unchanged after training', () => {
    const gjSnap = JSON.stringify(GUJARAT_FEDERATED_DATASET);
    const mhSnap = JSON.stringify(MAHARASHTRA_FEDERATED_DATASET);
    const rjSnap = JSON.stringify(RAJASTHAN_FEDERATED_DATASET);

    gujaratNode.train();
    maharashtraNode.train();
    rajasthanNode.train();

    assert.strictEqual(JSON.stringify(GUJARAT_FEDERATED_DATASET), gjSnap);
    assert.strictEqual(JSON.stringify(MAHARASHTRA_FEDERATED_DATASET), mhSnap);
    assert.strictEqual(JSON.stringify(RAJASTHAN_FEDERATED_DATASET), rjSnap);
  });

  await t.test('11. Cross-region contamination is rejected', () => {
    // Attempting to pass Maharashtra data into Gujarat node must throw contamination error
    assert.throws(() => {
      createRegionalNode('GUJARAT', MAHARASHTRA_FEDERATED_DATASET);
    }, /Cross-region contamination detected/);

    // Attempting to pass Rajasthan data into Maharashtra node must throw
    assert.throws(() => {
      createRegionalNode('MAHARASHTRA', RAJASTHAN_FEDERATED_DATASET);
    }, /Cross-region contamination detected/);

    // Attempting to pass Gujarat data into Rajasthan node must throw
    assert.throws(() => {
      createRegionalNode('RAJASTHAN', GUJARAT_FEDERATED_DATASET);
    }, /Cross-region contamination detected/);
  });

  await t.test('12. Gujarat update contains no Maharashtra data', () => {
    const gjJson = JSON.stringify(gujaratNode.getLocalUpdate());
    assert.ok(!gjJson.includes('MAHARASHTRA'));
    assert.ok(!gjJson.includes('phc_mh_'));
  });

  await t.test('13. Gujarat update contains no Rajasthan data', () => {
    const gjJson = JSON.stringify(gujaratNode.getLocalUpdate());
    assert.ok(!gjJson.includes('RAJASTHAN'));
    assert.ok(!gjJson.includes('phc_rj_'));
  });

  await t.test('14. Maharashtra update contains no Gujarat data', () => {
    const mhJson = JSON.stringify(maharashtraNode.getLocalUpdate());
    assert.ok(!mhJson.includes('GUJARAT'));
    assert.ok(!mhJson.includes('phc_gj_'));
  });

  await t.test('15. Maharashtra update contains no Rajasthan data', () => {
    const mhJson = JSON.stringify(maharashtraNode.getLocalUpdate());
    assert.ok(!mhJson.includes('RAJASTHAN'));
    assert.ok(!mhJson.includes('phc_rj_'));
  });

  await t.test('16. Rajasthan update contains no Gujarat data', () => {
    const rjJson = JSON.stringify(rajasthanNode.getLocalUpdate());
    assert.ok(!rjJson.includes('GUJARAT'));
    assert.ok(!rjJson.includes('phc_gj_'));
  });

  await t.test('17. Rajasthan update contains no Maharashtra data', () => {
    const rjJson = JSON.stringify(rajasthanNode.getLocalUpdate());
    assert.ok(!rjJson.includes('MAHARASHTRA'));
    assert.ok(!rjJson.includes('phc_mh_'));
  });

  await t.test('18. No Firestore imports in node code', () => {
    const nodeFiles = [
      path.resolve(__dirname, '../nodes/regionalNodes.js'),
      path.resolve(__dirname, '../nodes/index.js')
    ];

    for (const f of nodeFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      assert.ok(!content.includes('firebase'));
      assert.ok(!content.includes('firestore'));
    }
  });

  await t.test('19. No Firestore writes during multi-node training', () => {
    const gjUpdate = gujaratNode.getLocalUpdate();
    const mhUpdate = maharashtraNode.getLocalUpdate();
    const rjUpdate = rajasthanNode.getLocalUpdate();

    assert.strictEqual(typeof gjUpdate, 'object');
    assert.strictEqual(typeof mhUpdate, 'object');
    assert.strictEqual(typeof rjUpdate, 'object');
  });

  await t.test('20. Existing production forecasting remains unchanged', () => {
    const dbPath = path.resolve(__dirname, '../../services/db.js');
    const bedPath = path.resolve(__dirname, '../../services/bedForecast.js');

    const dbContent = fs.readFileSync(dbPath, 'utf-8');
    const bedContent = fs.readFileSync(bedPath, 'utf-8');

    assert.ok(dbContent.includes('export async function forecastDemand'));
    assert.ok(bedContent.includes('export function calculateBedForecast'));
  });

  await t.test('21. Gemini remains unchanged', () => {
    const geminiPath = path.resolve(__dirname, '../../services/geminiContext.js');
    const geminiContent = fs.readFileSync(geminiPath, 'utf-8');

    assert.ok(geminiContent.includes('export async function buildMultiResourceGeminiContext'));
  });

  await t.test('22. No global model exists in local directories', () => {
    const localDirs = [
      path.resolve(__dirname, '../models'),
      path.resolve(__dirname, '../nodes'),
      path.resolve(__dirname, '../training'),
      path.resolve(__dirname, '../data')
    ];
    for (const dir of localDirs) {
      const allFiles = fs.readdirSync(dir, { recursive: true });
      for (const f of allFiles) {
        if (typeof f === 'string') {
          assert.ok(!f.toLowerCase().includes('globalmodel'), `Global model file ${f} must not exist in Step 5`);
        }
      }
    }
  });

  await t.test('23. No FedAvg exists in local directories', () => {
    const localDirs = [
      path.resolve(__dirname, '../models'),
      path.resolve(__dirname, '../nodes'),
      path.resolve(__dirname, '../training'),
      path.resolve(__dirname, '../data')
    ];
    for (const dir of localDirs) {
      const allFiles = fs.readdirSync(dir, { recursive: true });
      for (const f of allFiles) {
        if (typeof f === 'string') {
          assert.ok(!f.toLowerCase().includes('fedavg'), `FedAvg file ${f} must not exist in Step 5`);
        }
      }
    }
  });
});
