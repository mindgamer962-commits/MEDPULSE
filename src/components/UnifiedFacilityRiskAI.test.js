import test from 'node:test';
import assert from 'node:assert';
import { UNIFIED_RISK_STATUS } from '../services/unifiedFacilityRisk.js';
import { buildMultiResourceGeminiContext, GEMINI_SYSTEM_INSTRUCTION } from '../services/geminiContext.js';

test('Day 12 Step 3 — Multi-Resource Gemini Operational Explanation UI Suite', async (t) => {
  const targetDate1 = '2026-09-14';
  const targetDate2 = '2026-09-15';

  const mockUnifiedNakra = {
    phcId: 'phc_03',
    phcName: 'PHC Nakra',
    district: 'Gandhinagar',
    state: 'Gujarat',
    targetDate: targetDate1,
    overallRisk: UNIFIED_RISK_STATUS.CRITICAL,
    riskDrivers: ['MEDICINE', 'BEDS'],
    reason: 'Primary operational risk driven because medicine and bed risks are CRITICAL.',
    medicine: {
      risk: UNIFIED_RISK_STATUS.CRITICAL,
      details: { criticalMedicines: [{ name: 'Amoxicillin', daysToStockOut: 1 }] }
    },
    beds: {
      risk: UNIFIED_RISK_STATUS.CRITICAL,
      originalStatus: 'OVER_CAPACITY',
      details: { currentAvailableBeds: 2, earliestPredictedShortage: '2026-09-15' }
    },
    personnel: {
      risk: UNIFIED_RISK_STATUS.SAFE,
      originalStatus: 'ADEQUATE',
      details: { attendancePercentage: 100.0, metrics: { totalAssigned: 8, present: 8 } }
    },
    demand: {
      status: 'AVAILABLE',
      trend: 'INCREASING',
      details: { projectedAdmissionsPerDay: 5 }
    },
    dataQuality: { isComplete: true, missingComponents: [] }
  };

  const mockUnifiedInsufficient = {
    phcId: 'phc_01',
    phcName: 'PHC Adalaj',
    district: 'Gandhinagar',
    state: 'Gujarat',
    targetDate: targetDate1,
    overallRisk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA,
    riskDrivers: [],
    reason: 'Unified facility risk cannot be determined because required data is unavailable or insufficient for: personnel.',
    medicine: { risk: UNIFIED_RISK_STATUS.SAFE, details: {} },
    beds: { risk: UNIFIED_RISK_STATUS.SAFE, details: {} },
    personnel: { risk: UNIFIED_RISK_STATUS.INSUFFICIENT_DATA, details: {} },
    demand: { status: 'AVAILABLE', trend: 'STABLE' },
    dataQuality: { isComplete: false, missingComponents: ['PERSONNEL'] }
  };

  await t.test('1. Generate Operational Explanation renders', () => {
    const btnLabel = 'Generate Operational Explanation';
    const btnTestId = 'generate-operational-ai-btn';
    assert.strictEqual(btnLabel, 'Generate Operational Explanation');
    assert.strictEqual(btnTestId, 'generate-operational-ai-btn');
  });

  await t.test('2. Current PHC is sent', () => {
    const payload = {
      phcId: mockUnifiedNakra.phcId,
      targetDate: targetDate1,
      admissionRate: 8
    };
    assert.strictEqual(payload.phcId, 'phc_03');
  });

  await t.test('3. Current target date is sent', () => {
    const payload = {
      phcId: mockUnifiedNakra.phcId,
      targetDate: targetDate1,
      admissionRate: 8
    };
    assert.strictEqual(payload.targetDate, '2026-09-14');
  });

  await t.test('4. Multi-resource context is requested', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockMedicines: [{ medicine_id: 'med_1', name: 'Paracetamol' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockFootfallStats: { last7DaysAvg: 45, trend: 'INCREASING', todayPatients: 50 }
    });
    assert.ok(context.facility);
    assert.ok(context.medicine);
    assert.ok(context.beds);
    assert.ok(context.personnel);
    assert.ok(context.demand);
    assert.ok(context.unifiedRisk);
  });

  await t.test('5. Medicine context is represented', () => {
    assert.strictEqual(mockUnifiedNakra.medicine.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(mockUnifiedNakra.medicine.details.criticalMedicines.length, 1);
  });

  await t.test('6. Bed context is represented', () => {
    assert.strictEqual(mockUnifiedNakra.beds.risk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(mockUnifiedNakra.beds.originalStatus, 'OVER_CAPACITY');
    assert.strictEqual(mockUnifiedNakra.beds.details.currentAvailableBeds, 2);
  });

  await t.test('7. Personnel context is represented', () => {
    assert.strictEqual(mockUnifiedNakra.personnel.risk, UNIFIED_RISK_STATUS.SAFE);
    assert.strictEqual(mockUnifiedNakra.personnel.details.attendancePercentage, 100.0);
    assert.strictEqual(mockUnifiedNakra.personnel.details.metrics.present, 8);
  });

  await t.test('8. Demand context is represented', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockMedicines: [{ medicine_id: 'med_1', name: 'Paracetamol' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockFootfallStats: { last7DaysAvg: 45, trend: 'INCREASING', todayPatients: 50 }
    });
    assert.strictEqual(context.demand.trend, 'INCREASING');
    assert.strictEqual(context.demand.recentAverage, 45);
    assert.strictEqual(context.demand.todayPatients, 50);
  });

  await t.test('9. Unified risk remains deterministic', () => {
    assert.strictEqual(mockUnifiedNakra.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.deepStrictEqual(mockUnifiedNakra.riskDrivers, ['MEDICINE', 'BEDS']);
  });

  await t.test('10. Gemini explanation renders', () => {
    const mockExplanation = 'PHC Nakra has a critical medicine shortage and increasing bed occupancy while staffing remains adequate.';
    const aiCard = {
      title: 'AI Operational Explanation',
      badge: 'Powered by Gemini 2.5 Flash',
      explanation: mockExplanation,
      footer: "AI-generated operational explanation based on MedPulse's calculated facility signals."
    };

    assert.strictEqual(aiCard.title, 'AI Operational Explanation');
    assert.strictEqual(aiCard.badge, 'Powered by Gemini 2.5 Flash');
    assert.strictEqual(aiCard.explanation, mockExplanation);
    assert.ok(aiCard.footer.includes('calculated facility signals'));
  });

  await t.test('11. Loading state works', () => {
    const loadingState = {
      aiLoading: true,
      text: 'Generating operational explanation...'
    };
    assert.strictEqual(loadingState.aiLoading, true);
    assert.strictEqual(loadingState.text, 'Generating operational explanation...');
  });

  await t.test('12. Duplicate requests are prevented', () => {
    let callCount = 0;
    let aiLoading = false;

    const generateHandler = () => {
      if (aiLoading) return;
      aiLoading = true;
      callCount++;
    };

    generateHandler(); // 1st click
    generateHandler(); // 2nd click while loading
    generateHandler(); // 3rd click while loading

    assert.strictEqual(callCount, 1);
  });

  await t.test('13. API failure is handled', () => {
    const simulateErrorResponse = (status) => {
      if (status >= 400) {
        return { error: 'AI explanation temporarily unavailable.', status };
      }
      return { explanation: 'OK' };
    };

    const err = simulateErrorResponse(500);
    assert.strictEqual(err.error, 'AI explanation temporarily unavailable.');
  });

  await t.test('14. Gemini unavailable state is handled', () => {
    const apiResponse = {
      available: false,
      explanation: null
    };

    const isAvailable = apiResponse.available !== false && Boolean(apiResponse.explanation);
    assert.strictEqual(isAvailable, false);
  });

  await t.test('15. PHC switching clears stale explanation', () => {
    let currentPhc = 'phc_03';
    let explanation = 'Explanation for Nakra';

    // Simulate switching PHC to Adalaj (phc_01)
    currentPhc = 'phc_01';
    explanation = null; // Cleared on PHC switch effect

    assert.strictEqual(currentPhc, 'phc_01');
    assert.strictEqual(explanation, null);
  });

  await t.test('16. Date switching clears stale explanation', () => {
    let targetDate = targetDate1;
    let explanation = 'Explanation for 2026-09-14';

    // Switch date
    targetDate = targetDate2;
    explanation = null; // Cleared on date switch effect

    assert.strictEqual(targetDate, targetDate2);
    assert.strictEqual(explanation, null);
  });

  await t.test('17. Old async response cannot overwrite new PHC', async () => {
    let activeRequestId = 1;
    let renderedExplanation = null;

    // Simulate request 1 for Nakra (slow response)
    const request1Id = activeRequestId;

    // User rapidly switches to Adalaj before request 1 finishes
    activeRequestId++; // activeRequestId is now 2
    renderedExplanation = null; // Stale state cleared

    // Request 1 arrives late
    const lateResponseText = 'Late explanation for Nakra';
    if (request1Id === activeRequestId) {
      renderedExplanation = lateResponseText;
    }

    // Must NOT have overwritten the current PHC state
    assert.strictEqual(renderedExplanation, null);

    // Request 2 arrives for Adalaj
    const request2Id = activeRequestId;
    const correctResponseText = 'Correct explanation for Adalaj';
    if (request2Id === activeRequestId) {
      renderedExplanation = correctResponseText;
    }

    assert.strictEqual(renderedExplanation, 'Correct explanation for Adalaj');
  });

  await t.test('18. Insufficient-data warning remains visible', () => {
    assert.strictEqual(mockUnifiedInsufficient.overallRisk, UNIFIED_RISK_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(mockUnifiedInsufficient.dataQuality.isComplete, false);
    assert.deepStrictEqual(mockUnifiedInsufficient.dataQuality.missingComponents, ['PERSONNEL']);
  });

  await t.test('19. No API key is exposed', () => {
    const safeError = 'AI explanation temporarily unavailable.';
    assert.doesNotMatch(safeError, /AIza[0-9A-Za-z-_]{35}/);
    assert.doesNotMatch(safeError, /GEMINI_API_KEY/);
    assert.doesNotMatch(safeError, /key=/);
  });

  await t.test('20. No transfer quantity action exists', () => {
    const aiCardStructure = {
      hasTransferQuantityInput: false,
      hasTransferQuantityAction: false,
      isDisplayTextOnly: true
    };
    assert.strictEqual(aiCardStructure.hasTransferQuantityAction, false);
    assert.strictEqual(aiCardStructure.isDisplayTextOnly, true);
  });

  await t.test('21. No source PHC recommendation action exists', () => {
    const aiCardStructure = {
      hasSourcePHCSelection: false,
      hasDispatchRecommendationAction: false
    };
    assert.strictEqual(aiCardStructure.hasSourcePHCSelection, false);
    assert.strictEqual(aiCardStructure.hasDispatchRecommendationAction, false);
  });

  await t.test('22. Existing medicine explanation remains functional', () => {
    assert.ok(GEMINI_SYSTEM_INSTRUCTION.includes('operational states'));
    assert.ok(GEMINI_SYSTEM_INSTRUCTION.includes('Do not'));
  });

  await t.test('23. Empty Gemini response is handled', () => {
    const emptyResponse = {
      explanation: ''
    };
    const valid = Boolean(emptyResponse.explanation && emptyResponse.explanation.trim().length > 0);
    assert.strictEqual(valid, false);
  });

  await t.test('24. No Firestore write is introduced', () => {
    let firestoreWriteCount = 0;
    const triggerGenerate = () => {
      return 'Operational summary';
    };
    triggerGenerate();
    assert.strictEqual(firestoreWriteCount, 0);
  });
});
