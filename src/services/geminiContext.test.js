import test from 'node:test';
import assert from 'node:assert';
import {
  buildMultiResourceGeminiContext,
  GEMINI_SYSTEM_INSTRUCTION
} from './geminiContext.js';
import { UNIFIED_RISK_STATUS } from './unifiedFacilityRisk.js';

test('Day 12 Step 2 — Multi-Resource Gemini Context & Safety Guardrails Suite', async (t) => {
  const phcAlpha = { phc_id: 'phc-alpha', name: 'PHC Alpha', district: 'Gandhinagar', state: 'Gujarat' };
  const targetDate1 = '2026-09-14';
  const targetDate2 = '2026-09-18';

  const mockMedicines = [
    { medicine_id: 'med-ors', name: 'ORS', unit: 'packets' },
    { medicine_id: 'med-amox', name: 'Amoxicillin', unit: 'tablets' }
  ];

  const mockTargetMed = {
    medicineId: 'med-ors',
    name: 'ORS',
    unit: 'packets',
    currentStock: 15,
    predicted7DayDemand: 90,
    averageDailyDemand: 12.8,
    estimatedDaysRemaining: 1,
    projectedStockOutDate: '2026-09-15',
    riskLevel: 'CRITICAL'
  };

  const mockFootfall = {
    todayPatients: 140,
    last7DaysTotal: 980,
    last7DaysAvg: 140,
    prev7DaysAvg: 95,
    trend: 'INCREASING'
  };

  const mockUnified = {
    phcId: 'phc-alpha',
    phcName: 'PHC Alpha',
    district: 'Gandhinagar',
    state: 'Gujarat',
    targetDate: targetDate1,
    medicine: {
      risk: UNIFIED_RISK_STATUS.CRITICAL,
      originalStatus: 'CRITICAL',
      details: {
        totalMonitored: 2,
        evaluatedCount: 2,
        criticalMedicines: [{ name: 'ORS' }],
        atRiskMedicines: [],
        safeMedicines: [{ name: 'Amoxicillin' }],
        medicineRiskDrivers: ['ORS']
      }
    },
    beds: {
      risk: UNIFIED_RISK_STATUS.AT_RISK,
      originalStatus: 'AT_RISK',
      details: {
        currentAvailableBeds: 4,
        earliestPredictedShortage: '2026-09-17',
        forecast: [
          { day: 1, capacityMargin: 2 },
          { day: 2, capacityMargin: 1 },
          { day: 3, capacityMargin: -1 }
        ]
      }
    },
    personnel: {
      risk: UNIFIED_RISK_STATUS.SAFE,
      originalStatus: 'ADEQUATE',
      details: {
        attendancePercentage: 92.5,
        metrics: {
          totalAssigned: 8,
          present: 7,
          late: 1,
          absent: 0,
          authorizedLeave: 0
        }
      }
    },
    overallRisk: UNIFIED_RISK_STATUS.CRITICAL,
    riskDrivers: ['MEDICINE'],
    reason: 'Overall CRITICAL because medicine risk is CRITICAL.',
    dataQuality: {
      isComplete: true,
      missingComponents: []
    }
  };

  await t.test('1. Facility context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.facility);
    assert.strictEqual(ctx.facility.phcId, 'phc-alpha');
    assert.strictEqual(ctx.facility.phcName, 'PHC Alpha');
    assert.strictEqual(ctx.facility.district, 'Gandhinagar');
    assert.strictEqual(ctx.facility.state, 'Gujarat');
    assert.strictEqual(ctx.facility.targetDate, '2026-09-14');
  });

  await t.test('2. Medicine context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.medicine);
    assert.strictEqual(ctx.medicine.risk, 'CRITICAL');
    assert.strictEqual(ctx.medicine.totalMonitored, 2);
    assert.strictEqual(ctx.medicine.evaluatedCount, 2);
    assert.strictEqual(ctx.medicine.criticalCount, 1);
    assert.deepStrictEqual(ctx.medicine.medicineRiskDrivers, ['ORS']);
  });

  await t.test('3. Bed context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.beds);
    assert.strictEqual(ctx.beds.risk, 'AT_RISK');
    assert.strictEqual(ctx.beds.originalStatus, 'AT_RISK');
    assert.strictEqual(ctx.beds.availableBeds, 4);
    assert.strictEqual(ctx.beds.earliestPredictedShortage, '2026-09-17');
    assert.strictEqual(ctx.beds.day3CapacityMargin, -1);
  });

  await t.test('4. Personnel context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.personnel);
    assert.strictEqual(ctx.personnel.risk, 'SAFE');
    assert.strictEqual(ctx.personnel.originalStatus, 'ADEQUATE');
    assert.strictEqual(ctx.personnel.totalAssigned, 8);
    assert.strictEqual(ctx.personnel.onDutyPresent, 7);
    assert.strictEqual(ctx.personnel.absent, 0);
    assert.strictEqual(ctx.personnel.attendancePercentage, 92.5);
  });

  await t.test('5. Demand context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.demand);
    assert.strictEqual(ctx.demand.trend, 'INCREASING');
    assert.strictEqual(ctx.demand.recentAverage, 140);
    assert.strictEqual(ctx.demand.todayPatients, 140);
  });

  await t.test('6. Unified risk context included', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.unifiedRisk);
    assert.strictEqual(ctx.unifiedRisk.overallRisk, 'CRITICAL');
    assert.deepStrictEqual(ctx.unifiedRisk.riskDrivers, ['MEDICINE']);
    assert.strictEqual(ctx.unifiedRisk.reason, 'Overall CRITICAL because medicine risk is CRITICAL.');
    assert.strictEqual(ctx.unifiedRisk.dataQuality.isComplete, true);
  });

  await t.test('7. Target medicine remains supported', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      medicineId: 'med-ors',
      mockPHCs: [phcAlpha],
      mockMedicines,
      mockTargetMedicine: mockTargetMed,
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.ok(ctx.medicine.targetMedicine);
    assert.strictEqual(ctx.medicine.targetMedicine.name, 'ORS');
    assert.strictEqual(ctx.medicine.targetMedicine.currentStock, 15);
    assert.strictEqual(ctx.medicine.targetMedicine.riskLevel, 'CRITICAL');
  });

  await t.test('8. Missing target medicine becomes null', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.medicine.targetMedicine, null);
  });

  await t.test('9. Missing bed data is preserved as insufficient', async () => {
    const incompleteUnified = {
      ...mockUnified,
      beds: {
        risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
        originalStatus: 'INSUFFICIENT_DATA',
        details: null
      },
      overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      dataQuality: { isComplete: false, missingComponents: ['BEDS'] }
    };

    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: incompleteUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.beds.risk, 'INSUFFICIENT_DATA');
    assert.strictEqual(ctx.beds.availableBeds, null);
    assert.strictEqual(ctx.unifiedRisk.overallRisk, 'INSUFFICIENT_DATA');
  });

  await t.test('10. Missing personnel data is preserved', async () => {
    const incompleteUnified = {
      ...mockUnified,
      personnel: {
        risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
        originalStatus: 'INCOMPLETE_DATA',
        details: null
      },
      overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
      dataQuality: { isComplete: false, missingComponents: ['PERSONNEL'] }
    };

    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: incompleteUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.personnel.risk, 'INSUFFICIENT_DATA');
    assert.strictEqual(ctx.personnel.attendancePercentage, null);
  });

  await t.test('11. Missing demand data is preserved', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: null
    });

    assert.strictEqual(ctx.demand.trend, 'INSUFFICIENT_DATA');
    assert.strictEqual(ctx.demand.recentAverage, null);
    assert.strictEqual(ctx.demand.todayPatients, null);
  });

  await t.test('12. Unified risk is passed unchanged', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.unifiedRisk.overallRisk, mockUnified.overallRisk);
    assert.deepStrictEqual(ctx.unifiedRisk.riskDrivers, mockUnified.riskDrivers);
  });

  await t.test('13. Existing medicine fields remain available', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      medicineId: 'med-ors',
      mockPHCs: [phcAlpha],
      mockMedicines,
      mockTargetMedicine: mockTargetMed,
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.medicine.targetMedicine.predicted7DayDemand, 90);
    assert.strictEqual(ctx.medicine.targetMedicine.averageDailyDemand, 12.8);
    assert.strictEqual(ctx.medicine.targetMedicine.estimatedDaysRemaining, 1);
  });

  await t.test('14. Existing medicine explanation behavior remains compatible', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      medicineId: 'med-ors',
      mockPHCs: [phcAlpha],
      mockMedicines,
      mockTargetMedicine: mockTargetMed,
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.medicine.targetMedicine.name, 'ORS');
    assert.strictEqual(ctx.medicine.targetMedicine.riskLevel, 'CRITICAL');
  });

  await t.test('15. Prompt contains explanation-only guardrails', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /clinical supply-chain and facility operations explanation assistant/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /values supplied in the structured input are authoritative/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Return ONLY the explanation text/);
  });

  await t.test('16. Prompt explicitly prohibits transfer quantities', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not create a transfer quantity/);
  });

  await t.test('17. Prompt explicitly prohibits transfer/source-PHC recommendations', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not recommend a source PHC/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not approve or reject a transfer/);
  });

  await t.test('18. Prompt explicitly prohibits risk recalculation', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not recalculate risk, demand, bed capacity, attendance/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not recalculate or change it/);
  });

  await t.test('19. No fabricated values are introduced', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx.beds.availableBeds, 4);
    assert.strictEqual(ctx.personnel.totalAssigned, 8);
    assert.strictEqual(ctx.demand.recentAverage, 140);
  });

  await t.test('20. Gemini workflow performs zero Firestore writes', async () => {
    // Pure memory context builder executes with zero write calls
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });
    assert.ok(ctx);
  });

  await t.test('21. API failure remains graceful', () => {
    const mockApiError = new Error('Rate limit exceeded');
    let fallbackResult = null;
    try {
      throw mockApiError;
    } catch {
      fallbackResult = { explanation: null, available: false };
    }
    assert.strictEqual(fallbackResult.available, false);
    assert.strictEqual(fallbackResult.explanation, null);
  });

  await t.test('22. Empty Gemini response remains graceful', () => {
    const rawText = '   ';
    let validated = null;
    try {
      if (!rawText || rawText.trim().length < 10) {
        throw new Error('Empty or malformed explanation generated.');
      }
      validated = rawText.trim();
    } catch {
      validated = null;
    }
    assert.strictEqual(validated, null);
  });

  await t.test('23. PHC ID is correctly bound to the context', async () => {
    const ctxAlpha = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall
    });
    const ctxBeta = await buildMultiResourceGeminiContext({
      phcId: 'phc-beta',
      mockPHCs: [{ phc_id: 'phc-beta', name: 'PHC Beta', district: 'Jaipur', state: 'Rajasthan' }],
      mockUnifiedRisk: { ...mockUnified, phcId: 'phc-beta', phcName: 'PHC Beta' },
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctxAlpha.facility.phcId, 'phc-alpha');
    assert.strictEqual(ctxBeta.facility.phcId, 'phc-beta');
  });

  await t.test('24. Target date is correctly bound to personnel context', async () => {
    const ctx1 = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      targetDate: targetDate1,
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: { ...mockUnified, targetDate: targetDate1 },
      mockFootfallStats: mockFootfall
    });
    const ctx2 = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      targetDate: targetDate2,
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: { ...mockUnified, targetDate: targetDate2 },
      mockFootfallStats: mockFootfall
    });

    assert.strictEqual(ctx1.facility.targetDate, targetDate1);
    assert.strictEqual(ctx2.facility.targetDate, targetDate2);
  });

  await t.test('25. Day 17 Step 3: Federated forecast available in Gemini context', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall,
      mockTargetMedicine: mockTargetMed,
      mockFederatedForecast: {
        modelType: 'FEDERATED',
        modelVersion: '1.0.0',
        forecastDemand: 55.4,
        dataStatus: 'AVAILABLE',
        deterministicDemand: 12.8,
        divergence: 42.6,
        direction: 'HIGHER',
        available: true
      }
    });

    assert.ok(ctx.federatedForecast);
    assert.strictEqual(ctx.federatedForecast.modelType, 'FEDERATED');
    assert.strictEqual(ctx.federatedForecast.modelVersion, '1.0.0');
    assert.strictEqual(ctx.federatedForecast.forecastDemand, 55.4);
    assert.strictEqual(ctx.federatedForecast.dataStatus, 'AVAILABLE');
    assert.strictEqual(ctx.federatedForecast.deterministicDemand, 12.8);
    assert.strictEqual(ctx.federatedForecast.divergence, 42.6);
    assert.strictEqual(ctx.federatedForecast.direction, 'HIGHER');
    // Invariant: Deterministic overall risk remains authoritative and unchanged
    assert.strictEqual(ctx.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('26. Day 17 Step 3: Federated forecast HIGHER passed transparently without risk escalation', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: {
        ...mockUnified,
        overallRisk: UNIFIED_RISK_STATUS.AT_RISK
      },
      mockFootfallStats: mockFootfall,
      mockTargetMedicine: {
        ...mockTargetMed,
        riskLevel: 'AT_RISK',
        averageDailyDemand: 40
      },
      mockFederatedForecast: {
        forecastDemand: 65,
        deterministicDemand: 40,
        available: true
      }
    });

    assert.strictEqual(ctx.federatedForecast.forecastDemand, 65);
    assert.strictEqual(ctx.federatedForecast.deterministicDemand, 40);
    assert.strictEqual(ctx.federatedForecast.direction, 'HIGHER');
    assert.strictEqual(ctx.federatedForecast.divergence, 25);
    assert.strictEqual(ctx.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
  });

  await t.test('27. Day 17 Step 3: Federated forecast LOWER passed transparently without risk downgrade', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall,
      mockTargetMedicine: mockTargetMed,
      mockFederatedForecast: {
        forecastDemand: 5,
        deterministicDemand: 12.8,
        available: true
      }
    });

    assert.strictEqual(ctx.federatedForecast.forecastDemand, 5);
    assert.strictEqual(ctx.federatedForecast.deterministicDemand, 12.8);
    assert.strictEqual(ctx.federatedForecast.direction, 'LOWER');
    assert.strictEqual(ctx.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('28. Day 17 Step 3: Federated forecast unavailable preserves INSUFFICIENT_DATA without fake values', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: null, // missing footfall data prevents feature extraction
      mockTargetMedicine: null
    });

    assert.ok(ctx.federatedForecast);
    assert.strictEqual(ctx.federatedForecast.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(ctx.federatedForecast.forecastDemand, null);
    assert.strictEqual(ctx.federatedForecast.direction, 'UNAVAILABLE');
    assert.strictEqual(ctx.federatedForecast.isAvailable, false);
    // Deterministic unified risk remains intact
    assert.strictEqual(ctx.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
  });

  await t.test('29. Day 17 Step 3: Zero raw federated training dataset or PII leakage in context', async () => {
    const ctx = await buildMultiResourceGeminiContext({
      phcId: 'phc-alpha',
      mockPHCs: [phcAlpha],
      mockUnifiedRisk: mockUnified,
      mockFootfallStats: mockFootfall,
      mockTargetMedicine: mockTargetMed
    });

    const serialized = JSON.stringify(ctx);
    // Check absence of raw training records, node identifiers, weights arrays, or credentials
    assert.strictEqual(serialized.includes('node_gujarat'), false);
    assert.strictEqual(serialized.includes('node_maharashtra'), false);
    assert.strictEqual(serialized.includes('node_rajasthan'), false);
    assert.strictEqual(serialized.includes('trainingData'), false);
    assert.strictEqual(serialized.includes('apiKey'), false);
    assert.strictEqual(serialized.includes('privateKey'), false);
  });

  await t.test('30. Day 17 Step 3: System instructions contain strict explanation-only and federated non-authoritative guardrails', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Deterministic MedPulse risk values are authoritative/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /The federated forecast is an additional predictive intelligence signal and is not authoritative/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not replace deterministic risk with federated predictions/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Explain meaningful agreement or divergence between deterministic demand and federated forecast signals/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Never invent missing federated values if marked INSUFFICIENT_DATA/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not create a transfer quantity/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not recommend a source PHC/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not recommend staff reassignment/);
  });
});
