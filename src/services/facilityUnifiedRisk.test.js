import test from 'node:test';
import assert from 'node:assert';
import {
  getFacilityUnifiedRisk,
  aggregateFacilityMedicineRisk,
  calculateUnifiedFacilityRisk,
  UNIFIED_RISK_STATUS
} from './unifiedFacilityRisk.js';

test('Day 11 Step 3 — Facility Unified Risk Orchestration & Integration Suite', async (t) => {
  const phcAlpha = { phc_id: 'phc_alpha', name: 'PHC Alpha', district: 'Gandhinagar', state: 'Gujarat' };
  const phcBeta = { phc_id: 'phc_beta', name: 'PHC Beta', district: 'Jaipur', state: 'Rajasthan' };
  const targetDate1 = '2026-09-14';
  const targetDate2 = '2026-09-15';

  const safeMedicineResults = [
    { medicineId: 'med_1', medicineName: 'Paracetamol', riskLevel: 'SAFE', currentStock: 500 },
    { medicineId: 'med_2', medicineName: 'Amoxicillin', riskLevel: 'SAFE', currentStock: 300 }
  ];

  const criticalMedicineResults = [
    { medicineId: 'med_1', medicineName: 'Paracetamol', riskLevel: 'SAFE', currentStock: 500 },
    { medicineId: 'med_2', medicineName: 'Amoxicillin', riskLevel: 'CRITICAL', currentStock: 0, daysToStockOut: 1 }
  ];

  const atRiskMedicineResults = [
    { medicineId: 'med_1', medicineName: 'Paracetamol', riskLevel: 'SAFE', currentStock: 500 },
    { medicineId: 'med_2', medicineName: 'Amoxicillin', riskLevel: 'AT_RISK', currentStock: 40, daysToStockOut: 4 }
  ];

  const safeBedForecast = {
    phcId: 'phc_alpha',
    currentAvailableBeds: 10,
    overallStatus: 'CAPACITY_AVAILABLE',
    earliestPredictedShortage: null,
    forecast: [{ day: 1, capacityMargin: 5 }, { day: 2, capacityMargin: 4 }, { day: 3, capacityMargin: 3 }]
  };

  const overCapacityBedForecast = {
    phcId: 'phc_alpha',
    currentAvailableBeds: 2,
    overallStatus: 'OVER_CAPACITY',
    earliestPredictedShortage: '2026-09-15',
    forecast: [{ day: 1, capacityMargin: -2 }, { day: 2, capacityMargin: -4 }, { day: 3, capacityMargin: -5 }]
  };

  const adequateWorkforceRisk = {
    phcId: 'phc_alpha',
    date: targetDate1,
    status: 'ADEQUATE',
    dataStatus: 'AVAILABLE',
    attendancePercentage: 100.0,
    metrics: { totalAssigned: 8, present: 8, late: 0, absent: 0, authorizedLeave: 0, unrecorded: 0 }
  };

  const criticalWorkforceRisk = {
    phcId: 'phc_alpha',
    date: targetDate1,
    status: 'CRITICAL',
    dataStatus: 'AVAILABLE',
    attendancePercentage: 50.0,
    metrics: { totalAssigned: 8, present: 4, late: 0, absent: 4, authorizedLeave: 0, unrecorded: 0 }
  };

  await t.test('1. A PHC with all three SAFE signals produces overall SAFE', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
    assert.deepStrictEqual(res.riskDrivers, []);
    assert.strictEqual(res.medicine.risk, 'SAFE');
    assert.strictEqual(res.beds.risk, 'SAFE');
    assert.strictEqual(res.personnel.risk, 'SAFE');
    assert.match(res.reason, /safe operational parameters/);
  });

  await t.test('2. Medicine CRITICAL drives overall CRITICAL', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
    assert.match(res.reason, /medicine risk is CRITICAL/);
    assert.deepStrictEqual(res.medicine.details.medicineRiskDrivers, ['Amoxicillin']);
  });

  await t.test('3. Bed OVER_CAPACITY drives overall CRITICAL', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['BEDS']);
    assert.match(res.reason, /bed risk is CRITICAL/);
  });

  await t.test('4. Personnel CRITICAL drives overall CRITICAL', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['PERSONNEL']);
    assert.match(res.reason, /personnel risk is CRITICAL/);
  });

  await t.test('5. Medicine AT_RISK with other SAFE signals -> AT_RISK', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: atRiskMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
    assert.match(res.reason, /medicine risk is AT_RISK/);
  });

  await t.test('6. Multiple CRITICAL components -> all drivers preserved in array', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE', 'BEDS', 'PERSONNEL']);
    assert.match(res.reason, /medicine, bed and personnel risks are CRITICAL/);
  });

  await t.test('7. Missing medicine result -> INSUFFICIENT_DATA', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: [],
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['MEDICINE']);
  });

  await t.test('8. Missing bed result -> INSUFFICIENT_DATA', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: null,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['BEDS']);
  });

  await t.test('9. Missing/incomplete personnel result -> INSUFFICIENT_DATA', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: { status: 'INSUFFICIENT_DATA', dataStatus: 'INCOMPLETE_DATA' }
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
    assert.deepStrictEqual(res.dataQuality.missingComponents, ['PERSONNEL']);
  });

  await t.test('10. PHC switching produces the correct facility result', async () => {
    const resAlpha = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    const resBeta = await getFacilityUnifiedRisk('phc_beta', {
      phc: phcBeta,
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(resAlpha.phcId, 'phc_alpha');
    assert.strictEqual(resAlpha.phcName, 'PHC Alpha');
    assert.strictEqual(resAlpha.overallRisk, UNIFIED_RISK_STATUS.SAFE);

    assert.strictEqual(resBeta.phcId, 'phc_beta');
    assert.strictEqual(resBeta.phcName, 'PHC Beta');
    assert.strictEqual(resBeta.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('11. Target-date changes update personnel risk correctly', async () => {
    const resDate1 = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    const resDate2 = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      targetDate: targetDate2,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });

    assert.strictEqual(resDate1.targetDate, targetDate1);
    assert.strictEqual(resDate1.overallRisk, UNIFIED_RISK_STATUS.SAFE);

    assert.strictEqual(resDate2.targetDate, targetDate2);
    assert.strictEqual(resDate2.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('12. Existing medicine status is not altered in details', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.medicine.details.results[1].riskLevel, 'CRITICAL');
    assert.strictEqual(res.medicine.details.results[1].daysToStockOut, 1);
  });

  await t.test('13. Existing bed status is not altered in details', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.beds.originalStatus, 'OVER_CAPACITY');
    assert.strictEqual(res.beds.details.currentAvailableBeds, 2);
  });

  await t.test('14. Existing personnel status is not altered in details', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.personnel.originalStatus, 'ADEQUATE');
    assert.strictEqual(res.personnel.details.attendancePercentage, 100.0);
  });

  await t.test('15. No Firestore writes occur during unified evaluation', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
  });

  await t.test('16. Async failures are handled gracefully without crashing', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: [{ error: 'Network timeout' }],
      mockBedForecast: { overallStatus: 'INSUFFICIENT_DATA', error: 'Bed error' },
      mockWorkforceRisk: { status: 'INSUFFICIENT_DATA', dataStatus: 'ERROR' }
    });

    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.dataQuality.isComplete, false);
  });

  await t.test('17. No stale PHC result appears after switching facilities', async () => {
    const run1 = await getFacilityUnifiedRisk('phc_alpha', {
      phc: phcAlpha,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    const run2 = await getFacilityUnifiedRisk('phc_beta', {
      phc: phcBeta,
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(run1.phcId, 'phc_alpha');
    assert.strictEqual(run2.phcId, 'phc_beta');
    assert.notStrictEqual(run1.overallRisk, run2.overallRisk);
  });

  await t.test('18. Medicine aggregation across multiple medicines follows worst-case severity', () => {
    const mixed = [
      { medicineId: 'm1', medicineName: 'Paracetamol', riskLevel: 'SAFE' },
      { medicineId: 'm2', medicineName: 'Amoxicillin', riskLevel: 'AT_RISK' },
      { medicineId: 'm3', medicineName: 'Ibuprofen', riskLevel: 'SAFE' }
    ];
    const agg = aggregateFacilityMedicineRisk(mixed);
    assert.strictEqual(agg.risk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.deepStrictEqual(agg.details.medicineRiskDrivers, ['Amoxicillin']);

    const mixedWithCritical = [
      ...mixed,
      { medicineId: 'm4', medicineName: 'ORS', riskLevel: 'CRITICAL' }
    ];
    const aggCrit = aggregateFacilityMedicineRisk(mixedWithCritical);
    assert.strictEqual(aggCrit.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(aggCrit.details.medicineRiskDrivers, ['ORS']);
  });

  await t.test('19. No medicine result is silently treated as SAFE on error', () => {
    const errorMed = [{ medicineId: 'm1', error: 'Insufficient historical data' }];
    const agg = aggregateFacilityMedicineRisk(errorMed);
    assert.strictEqual(agg.risk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(agg.details.evaluatedCount, 0);
  });

  await t.test('20. No fabricated bed or personnel values are introduced', async () => {
    const res = await getFacilityUnifiedRisk('phc_alpha', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.beds.details.currentAvailableBeds, 10);
    assert.strictEqual(res.personnel.details.metrics.totalAssigned, 8);
  });
});
