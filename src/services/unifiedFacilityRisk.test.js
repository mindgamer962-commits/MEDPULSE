import test from 'node:test';
import assert from 'node:assert';
import {
  calculateUnifiedFacilityRisk,
  normalizeMedicineRisk,
  normalizeBedRisk,
  normalizePersonnelRisk,
  UNIFIED_RISK_STATUS
} from './unifiedFacilityRisk.js';

test('Day 11 Step 2 — Unified Facility Risk Service Suite', async (t) => {
  await t.test('1. All SAFE => SAFE', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
    assert.deepStrictEqual(res.riskDrivers, []);
    assert.strictEqual(res.dataQuality.isComplete, true);
  });

  await t.test('2. Medicine AT_RISK => AT_RISK', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'AT_RISK',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
    assert.match(res.reason, /medicine risk is AT_RISK/);
  });

  await t.test('3. Beds AT_RISK => AT_RISK', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'AT_RISK',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(res.riskDrivers, ['BEDS']);
    assert.match(res.reason, /bed risk is AT_RISK/);
  });

  await t.test('4. Personnel AT_RISK => AT_RISK', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'AT_RISK'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(res.riskDrivers, ['PERSONNEL']);
    assert.match(res.reason, /personnel risk is AT_RISK/);
  });

  await t.test('5. Medicine CRITICAL => CRITICAL', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'CRITICAL',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
    assert.match(res.reason, /medicine risk is CRITICAL/);
  });

  await t.test('6. Beds OVER_CAPACITY => CRITICAL', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'OVER_CAPACITY',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['BEDS']);
    assert.match(res.reason, /bed risk is CRITICAL/);
  });

  await t.test('7. Personnel CRITICAL => CRITICAL', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'CRITICAL'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['PERSONNEL']);
    assert.match(res.reason, /personnel risk is CRITICAL/);
  });

  await t.test('8. CRITICAL + AT_RISK + SAFE => CRITICAL', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'CRITICAL',
      bedRisk: 'AT_RISK',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
  });

  await t.test('9. AT_RISK + SAFE + SAFE => AT_RISK', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'AT_RISK',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(res.riskDrivers, ['BEDS']);
  });

  await t.test('10. All three CRITICAL => CRITICAL', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'CRITICAL',
      bedRisk: 'OVER_CAPACITY',
      personnelRisk: 'CRITICAL'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE', 'BEDS', 'PERSONNEL']);
    assert.match(res.reason, /medicine, bed and personnel risks are CRITICAL/);
  });

  await t.test('11. Medicine CRITICAL + beds SAFE + personnel SAFE => medicine driver', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: { riskLevel: 'CRITICAL', currentStock: 0 },
      bedRisk: { overallStatus: 'CAPACITY_AVAILABLE', currentAvailableBeds: 5 },
      personnelRisk: { status: 'ADEQUATE', attendancePercentage: 100 }
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
  });

  await t.test('12. Bed CRITICAL + others SAFE => bed driver', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'OVER_CAPACITY',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['BEDS']);
  });

  await t.test('13. Personnel CRITICAL + others SAFE => personnel driver', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'CRITICAL'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['PERSONNEL']);
  });

  await t.test('14. Multiple equally severe drivers are all returned (e.g. Medicine & Beds)', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'CRITICAL',
      bedRisk: 'OVER_CAPACITY',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE', 'BEDS']);
    assert.match(res.reason, /medicine and bed risks are CRITICAL/);
  });

  await t.test('15. Missing medicine data => INSUFFICIENT_DATA', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: null,
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['MEDICINE']);
    assert.match(res.reason, /medicine/);
  });

  await t.test('16. Missing bed data => INSUFFICIENT_DATA', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: null,
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['BEDS']);
    assert.match(res.reason, /beds/);
  });

  await t.test('17. Missing personnel data => INSUFFICIENT_DATA', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: null
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['PERSONNEL']);
    assert.match(res.reason, /personnel/);
  });

  await t.test('18. Personnel INSUFFICIENT_DATA is not converted to SAFE', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'INSUFFICIENT_DATA'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.components.personnel.risk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.notStrictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
  });

  await t.test('19. Bed INSUFFICIENT_DATA is not converted to SAFE', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'SAFE',
      bedRisk: 'INSUFFICIENT_DATA',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.components.beds.risk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.notStrictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
  });

  await t.test('20. Medicine error is not converted to SAFE', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: { error: 'Insufficient historical data' },
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: 'ADEQUATE'
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.components.medicine.risk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.components.medicine.originalStatus, 'Insufficient historical data');
  });

  await t.test('21. Original domain status is preserved in return structure', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: { riskLevel: 'SAFE' },
      bedRisk: { overallStatus: 'CAPACITY_AVAILABLE' },
      personnelRisk: { status: 'ADEQUATE' }
    });
    assert.strictEqual(res.components.medicine.originalStatus, 'SAFE');
    assert.strictEqual(res.components.beds.originalStatus, 'CAPACITY_AVAILABLE');
    assert.strictEqual(res.components.personnel.originalStatus, 'ADEQUATE');

    assert.strictEqual(res.components.medicine.risk, 'SAFE');
    assert.strictEqual(res.components.beds.risk, 'SAFE');
    assert.strictEqual(res.components.personnel.risk, 'SAFE');
  });

  await t.test('22. Pure execution: Performs no Firestore writes or object mutations', () => {
    const frozenMedicine = Object.freeze({ riskLevel: 'SAFE' });
    const frozenBeds = Object.freeze({ overallStatus: 'CAPACITY_AVAILABLE' });
    const frozenPersonnel = Object.freeze({ status: 'ADEQUATE' });

    assert.doesNotThrow(() => {
      const res = calculateUnifiedFacilityRisk({
        medicineRisk: frozenMedicine,
        bedRisk: frozenBeds,
        personnelRisk: frozenPersonnel
      });
      assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
    });
  });

  await t.test('23. Personnel INCOMPLETE_DATA preserves subcomponent status and marks overall INSUFFICIENT_DATA', () => {
    const res = calculateUnifiedFacilityRisk({
      medicineRisk: 'CRITICAL',
      bedRisk: 'CAPACITY_AVAILABLE',
      personnelRisk: { dataStatus: 'INCOMPLETE_DATA', status: 'INSUFFICIENT_DATA' }
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.components.medicine.risk, 'CRITICAL');
    assert.strictEqual(res.components.beds.risk, 'SAFE');
    assert.strictEqual(res.components.personnel.risk, 'INSUFFICIENT_DATA');
  });
});
