import test from 'node:test';
import assert from 'node:assert';
import { prepareBedMigration, executeBedMigration, verifyBedMigration, EXPECTED_PHC_CONFIGS } from './migration.js';

test('Day 7 Step 3 - Bed Migration Dry Run', async (t) => {
  const mockValidPhcs = Object.keys(EXPECTED_PHC_CONFIGS).map(id => ({ phc_id: id, name: id.toUpperCase() }));

  await t.test('1. Valid live PHCs return SUCCESS', () => {
    const result = prepareBedMigration(mockValidPhcs);
    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.totalPHCs, 28);
    assert.strictEqual(result.validRecords, 28);
    assert.strictEqual(result.invalidRecords, 0);
  });

  await t.test('2. Missing PHC returns FAILED', () => {
    const missingOne = mockValidPhcs.slice(1);
    const result = prepareBedMigration(missingOne);
    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.missingPHCs.length, 1);
    assert.strictEqual(result.missingPHCs[0], mockValidPhcs[0].phc_id);
  });

  await t.test('3. Unexpected PHC returns FAILED', () => {
    const withExtra = [...mockValidPhcs, { phc_id: 'phc-unknown', name: 'Unknown' }];
    const result = prepareBedMigration(withExtra);
    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.unexpectedPHCs.length, 1);
    assert.strictEqual(result.unexpectedPHCs[0], 'phc-unknown');
  });

  await t.test('4. Duplicate PHC returns FAILED', () => {
    const withDuplicate = [...mockValidPhcs, mockValidPhcs[0]];
    const result = prepareBedMigration(withDuplicate);
    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.duplicatePHCs.length, 1);
    assert.strictEqual(result.duplicatePHCs[0], mockValidPhcs[0].phc_id);
  });

  await t.test('5. Output math is completely accurate', () => {
    const result = prepareBedMigration(mockValidPhcs);
    for (const record of result.records) {
      assert.strictEqual(record.available_beds, record.total_beds - record.occupied_beds);
      assert.ok(record.occupied_beds <= record.total_beds);
      assert.ok(record.emergency_beds <= record.total_beds);
      assert.ok(record.icu_beds <= record.total_beds);
    }
  });

  await t.test('6. SAFE, AT_RISK, CRITICAL status distribution exists', () => {
    const result = prepareBedMigration(mockValidPhcs);
    assert.ok(result.summary.safe_count > 0);
    assert.ok(result.summary.at_risk_count > 0);
    assert.ok(result.summary.critical_count > 0);
  });

  await t.test('7. Deterministic output (repeated runs)', () => {
    const r1 = prepareBedMigration(mockValidPhcs);
    const r2 = prepareBedMigration(mockValidPhcs);
    assert.deepStrictEqual(
      r1.records.map(r => r.occupied_beds),
      r2.records.map(r => r.occupied_beds)
    );
  });

  await t.test('8. Zero Firestore writes imported', () => {
    const fileContent = prepareBedMigration.toString();
    assert.strictEqual(fileContent.includes('setDoc'), false);
    assert.strictEqual(fileContent.includes('updateDoc'), false);
    assert.strictEqual(fileContent.includes('addDoc'), false);
    assert.strictEqual(fileContent.includes('deleteDoc'), false);
    assert.strictEqual(fileContent.includes('db'), false);
  });
});

test('Day 7 Step 4 - Bed Migration Execution', async (t) => {
  const mockValidPhcs = Object.keys(EXPECTED_PHC_CONFIGS).map(id => ({ phc_id: id, name: id.toUpperCase() }));
  const proposal = prepareBedMigration(mockValidPhcs);
  
  // Mock Firestore deps
  const mockDb = {};
  
  const createMockWriteDeps = () => {
    let commitCalled = false;
    let sets = [];
    const batch = {
      set: (ref, data) => sets.push({ ref, data }),
      commit: async () => { commitCalled = true; return true; }
    };
    return {
      writeBatch: (db) => batch,
      doc: (db, coll, id) => `${coll}/${id}`,
      getSets: () => sets,
      isCommitted: () => commitCalled
    };
  };

  const createMockReadDeps = (records) => {
    return {
      doc: (db, coll, id) => `${coll}/${id}`,
      getDoc: async (ref) => {
        const id = ref.split('/')[1];
        const record = records.find(r => r.phc_id === id);
        return {
          exists: () => !!record,
          data: () => record
        };
      }
    };
  };

  await t.test('1. Successful 28-record atomic batch write', async () => {
    const deps = createMockWriteDeps();
    const result = await executeBedMigration(proposal.records, mockDb, deps);
    assert.strictEqual(result.status, "SUCCESS");
    assert.strictEqual(result.writtenRecords, 28);
    assert.strictEqual(deps.isCommitted(), true);
    assert.strictEqual(deps.getSets().length, 28);
    assert.strictEqual(deps.getSets()[0].ref.startsWith('beds/'), true);
  });

  await t.test('2. Invalid proposal rejected', async () => {
    const deps = createMockWriteDeps();
    const badProposal = JSON.parse(JSON.stringify(proposal.records));
    badProposal[0].total_beds = -5; // invalid
    await assert.rejects(
      executeBedMigration(badProposal, mockDb, deps),
      /Migration execution failed: Invalid bed capacity data/
    );
    assert.strictEqual(deps.isCommitted(), false);
  });

  await t.test('3. Mathematical inconsistency rejected', async () => {
    const deps = createMockWriteDeps();
    const badProposal = JSON.parse(JSON.stringify(proposal.records));
    badProposal[0].available_beds = 999; // mathematically inconsistent
    await assert.rejects(
      executeBedMigration(badProposal, mockDb, deps),
      /Migration execution failed: Invalid bed capacity data/
    );
    assert.strictEqual(deps.isCommitted(), false);
  });

  await t.test('4. Verification success', async () => {
    const deps = createMockReadDeps(proposal.records);
    const result = await verifyBedMigration(proposal.records, mockDb, deps);
    assert.strictEqual(result.status, "VERIFIED");
    assert.strictEqual(result.matchingRecords, 28);
    assert.strictEqual(result.missingRecords, 0);
  });

  await t.test('5. Missing Firestore record detected', async () => {
    const partialRecords = proposal.records.slice(1);
    const deps = createMockReadDeps(partialRecords);
    const result = await verifyBedMigration(proposal.records, mockDb, deps);
    assert.strictEqual(result.status, "FAILED"); // Fails overall
    assert.strictEqual(result.missingRecords, 1);
  });

  await t.test('6. Mismatched Firestore values detected', async () => {
    const modifiedRecords = JSON.parse(JSON.stringify(proposal.records));
    modifiedRecords[0].occupied_beds = 999; // mismatch
    const deps = createMockReadDeps(modifiedRecords);
    const result = await verifyBedMigration(proposal.records, mockDb, deps);
    assert.strictEqual(result.status, "FAILED");
    assert.strictEqual(result.mismatchedRecords, 1);
    assert.strictEqual(result.matchingRecords, 27);
  });
});

