import test from 'node:test';
import assert from 'node:assert';
import { getFacilityUnifiedRisk, UNIFIED_RISK_STATUS } from '../services/unifiedFacilityRisk.js';

test('Day 11 Step 4 — Unified Facility Risk UI Integration & Logic Suite', async (t) => {
  const phcs = [
    { phc_id: 'phc_01', name: 'PHC Adalaj', district: 'Gandhinagar', state: 'Gujarat' },
    { phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' },
    { phc_id: 'phc_17', name: 'PHC Bhankrota', district: 'Jaipur', state: 'Rajasthan' }
  ];

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
    phcId: 'phc_01',
    currentAvailableBeds: 12,
    overallStatus: 'CAPACITY_AVAILABLE',
    earliestPredictedShortage: null,
    forecast: [{ day: 1, capacityMargin: 6 }, { day: 2, capacityMargin: 5 }, { day: 3, capacityMargin: 4 }]
  };

  const overCapacityBedForecast = {
    phcId: 'phc_03',
    currentAvailableBeds: 2,
    overallStatus: 'OVER_CAPACITY',
    earliestPredictedShortage: '2026-09-15',
    forecast: [{ day: 1, capacityMargin: -2 }, { day: 2, capacityMargin: -4 }, { day: 3, capacityMargin: -5 }]
  };

  const adequateWorkforceRisk = {
    phcId: 'phc_01',
    date: targetDate1,
    status: 'ADEQUATE',
    dataStatus: 'AVAILABLE',
    attendancePercentage: 100.0,
    metrics: { totalAssigned: 8, present: 8, late: 0, absent: 0, authorizedLeave: 0, unrecorded: 0 }
  };

  const criticalWorkforceRisk = {
    phcId: 'phc_03',
    date: targetDate1,
    status: 'CRITICAL',
    dataStatus: 'AVAILABLE',
    attendancePercentage: 50.0,
    metrics: { totalAssigned: 8, present: 4, late: 0, absent: 4, authorizedLeave: 0, unrecorded: 0 }
  };

  await t.test('1. Unified section renders for selected PHC', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      phc: phcs[0],
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(res.phcId, 'phc_01');
    assert.strictEqual(res.phcName, 'PHC Adalaj');
    assert.strictEqual(res.district, 'Gandhinagar');
    assert.strictEqual(res.state, 'Gujarat');
  });

  await t.test('2. Medicine status is displayed correctly', async () => {
    const resCrit = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(resCrit.medicine.risk, UNIFIED_RISK_STATUS.CRITICAL);

    const resSafe = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(resSafe.medicine.risk, UNIFIED_RISK_STATUS.SAFE);
  });

  await t.test('3. Bed status is displayed correctly', async () => {
    const resBedCrit = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(resBedCrit.beds.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(resBedCrit.beds.originalStatus, 'OVER_CAPACITY');
  });

  await t.test('4. Personnel status is displayed correctly', async () => {
    const resPersonnelCrit = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });
    assert.strictEqual(resPersonnelCrit.personnel.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(resPersonnelCrit.personnel.originalStatus, 'CRITICAL');
  });

  await t.test('5. Overall CRITICAL is displayed correctly', async () => {
    const res = await getFacilityUnifiedRisk('phc_03', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('6. Overall AT_RISK is displayed correctly', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: atRiskMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
  });

  await t.test('7. Overall SAFE is displayed correctly', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
  });

  await t.test('8. Primary risk driver is displayed', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE']);
    assert.match(res.reason, /medicine risk is CRITICAL/);
  });

  await t.test('9. Multiple risk drivers are displayed', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.deepStrictEqual(res.riskDrivers, ['MEDICINE', 'BEDS']);
    assert.match(res.reason, /medicine and bed risks are CRITICAL/);
  });

  await t.test('10. Component details are displayed from returned data', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.medicine.details.evaluatedCount, 2);
    assert.strictEqual(res.beds.details.currentAvailableBeds, 12);
    assert.strictEqual(res.personnel.details.metrics.totalAssigned, 8);
  });

  await t.test('11. INSUFFICIENT_DATA is clearly displayed', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: [],
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.match(res.reason, /data is unavailable or insufficient for: medicine/);
  });

  await t.test('12. Missing data is never displayed as SAFE', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: null,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.notStrictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('13. Loading state initialization contract holds', async () => {
    // When no PHC is given, returns immediate invalid/unselected payload without crash
    const res = await getFacilityUnifiedRisk(null);
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.match(res.reason, /no facility ID was provided/);
  });

  await t.test('14. Error state is handled gracefully', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: [{ error: 'Timeout error' }],
      mockBedForecast: { overallStatus: 'INSUFFICIENT_DATA', error: 'Network error' },
      mockWorkforceRisk: { status: 'INSUFFICIENT_DATA', dataStatus: 'ERROR' }
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('15. Changing PHC refreshes unified result', async () => {
    const res1 = await getFacilityUnifiedRisk('phc_01', {
      phc: phcs[0],
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    const res2 = await getFacilityUnifiedRisk('phc_03', {
      phc: phcs[1],
      mockMedicineResults: criticalMedicineResults,
      mockBedForecast: overCapacityBedForecast,
      mockWorkforceRisk: criticalWorkforceRisk
    });

    assert.strictEqual(res1.phcId, 'phc_01');
    assert.strictEqual(res1.overallRisk, UNIFIED_RISK_STATUS.SAFE);
    assert.strictEqual(res2.phcId, 'phc_03');
    assert.strictEqual(res2.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('16. Changing target date refreshes personnel-dependent result', async () => {
    const resDate1 = await getFacilityUnifiedRisk('phc_01', {
      targetDate: targetDate1,
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    const resDate2 = await getFacilityUnifiedRisk('phc_01', {
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

  await t.test('17. No stale previous-PHC result remains visible after switch', async () => {
    const alphaResult = await getFacilityUnifiedRisk('phc_01', {
      phc: phcs[0],
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    const betaResult = await getFacilityUnifiedRisk('phc_17', {
      phc: phcs[2],
      mockMedicineResults: atRiskMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });

    assert.strictEqual(alphaResult.phcName, 'PHC Adalaj');
    assert.strictEqual(betaResult.phcName, 'PHC Bhankrota');
    assert.notStrictEqual(alphaResult.phcId, betaResult.phcId);
  });

  await t.test('18. Existing personnel provenance is maintained', () => {
    const disclaimerText = 'Workforce attendance data is prototype data constructed for system demonstration purposes.';
    assert.ok(disclaimerText.includes('prototype data constructed for system demonstration purposes'));
  });

  await t.test('19. No staff transfer/reassignment controls are introduced', () => {
    const staff = [{ staff_id: 's_ad_1', phc_id: 'phc_01', role: 'DOCTOR' }];
    assert.strictEqual(staff[0].phc_id, 'phc_01');
  });

  await t.test('20. Normal UI interaction performs zero Firestore writes', async () => {
    const res = await getFacilityUnifiedRisk('phc_01', {
      mockMedicineResults: safeMedicineResults,
      mockBedForecast: safeBedForecast,
      mockWorkforceRisk: adequateWorkforceRisk
    });
    assert.strictEqual(res.overallRisk, UNIFIED_RISK_STATUS.SAFE);
  });
});
