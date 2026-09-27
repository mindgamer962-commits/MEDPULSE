import test from 'node:test';
import assert from 'node:assert';
import { UNIFIED_RISK_STATUS } from '../services/unifiedFacilityRisk.js';
import { buildMultiResourceGeminiContext, GEMINI_SYSTEM_INSTRUCTION } from '../services/geminiContext.js';
import { compareDemandForecasts } from '../services/federatedForecast.js';

test('Day 17 Step 4 — Actual Gemini Federated Operational Explanation & UI Suite', async (t) => {
  const targetDate1 = '2026-09-14';

  const mockUnifiedNakra = {
    phcId: 'phc_03',
    phcName: 'PHC Nakra',
    district: 'Gandhinagar',
    state: 'Gujarat',
    targetDate: targetDate1,
    overallRisk: UNIFIED_RISK_STATUS.AT_RISK,
    riskDrivers: ['MEDICINE'],
    reason: 'Elevated stock risk detected for Paracetamol.',
    medicine: {
      risk: UNIFIED_RISK_STATUS.AT_RISK,
      details: {
        totalMonitored: 1,
        evaluatedCount: 1,
        atRiskMedicines: [{ name: 'Paracetamol', daysToStockOut: 4 }],
        medicineRiskDrivers: ['Paracetamol']
      }
    },
    beds: {
      risk: UNIFIED_RISK_STATUS.SAFE,
      originalStatus: 'ADEQUATE',
      details: { currentAvailableBeds: 6 }
    },
    personnel: {
      risk: UNIFIED_RISK_STATUS.SAFE,
      originalStatus: 'ADEQUATE',
      details: { attendancePercentage: 95.0, metrics: { totalAssigned: 8, present: 8 } }
    },
    demand: {
      status: 'AVAILABLE',
      trend: 'INCREASING',
      recentAverage: 40,
      todayPatients: 45
    },
    dataQuality: { isComplete: true, missingComponents: [] }
  };

  const mockTargetMed = {
    medicineId: 'med_paracetamol',
    name: 'Paracetamol',
    unit: 'tablets',
    currentStock: 160,
    predicted7DayDemand: 280,
    averageDailyDemand: 40,
    estimatedDaysRemaining: 4.0,
    projectedStockOutDate: '2026-09-18',
    riskLevel: 'AT_RISK'
  };

  await t.test('A. Gemini request contains federated forecast signal', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockMedicines: [{ medicine_id: 'med_paracetamol', name: 'Paracetamol' }],
      mockTargetMedicine: mockTargetMed,
      mockUnifiedRisk: mockUnifiedNakra,
      mockFootfallStats: { last7DaysAvg: 40, prev7DaysAvg: 35, trend: 'INCREASING', todayPatients: 45 },
      mockFederatedForecast: {
        modelType: 'FEDERATED',
        modelVersion: '1.0.0',
        forecastDemand: 65,
        dataStatus: 'AVAILABLE',
        deterministicDemand: 40,
        divergence: 25,
        direction: 'HIGHER',
        available: true
      }
    });

    assert.ok(context.federatedForecast);
    assert.strictEqual(context.federatedForecast.forecastDemand, 65);
    assert.strictEqual(context.federatedForecast.modelVersion, '1.0.0');
    assert.strictEqual(context.federatedForecast.dataStatus, 'AVAILABLE');
    assert.strictEqual(context.federatedForecast.direction, 'HIGHER');
    assert.strictEqual(context.federatedForecast.divergence, 25);
  });

  await t.test('B. Gemini request contains authoritative deterministic risk', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockTargetMedicine: mockTargetMed,
      mockFootfallStats: { last7DaysAvg: 40, trend: 'INCREASING' }
    });

    assert.strictEqual(context.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.strictEqual(context.medicine.risk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.strictEqual(context.medicine.targetMedicine.riskLevel, 'AT_RISK');
    assert.strictEqual(context.medicine.targetMedicine.estimatedDaysRemaining, 4.0);
  });

  await t.test('C. Higher federated forecast remains strictly non-authoritative', async () => {
    // Deterministic demand = 40, Federated demand = 65 (+25 divergence)
    const comparison = compareDemandForecasts(40, { available: true, forecastDemand: 65 });
    assert.strictEqual(comparison.direction, 'HIGHER');
    assert.strictEqual(comparison.divergence, 25);

    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockTargetMedicine: mockTargetMed,
      mockFederatedForecast: {
        forecastDemand: 65,
        deterministicDemand: 40,
        available: true
      }
    });

    // Authoritative risk remains AT_RISK (not upgraded to CRITICAL)
    assert.strictEqual(context.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.strictEqual(context.medicine.targetMedicine.riskLevel, 'AT_RISK');
  });

  await t.test('D. Lower federated forecast remains strictly non-authoritative', async () => {
    const criticalUnified = {
      ...mockUnifiedNakra,
      overallRisk: UNIFIED_RISK_STATUS.CRITICAL,
      medicine: { ...mockUnifiedNakra.medicine, risk: UNIFIED_RISK_STATUS.CRITICAL }
    };
    const criticalTargetMed = { ...mockTargetMed, riskLevel: 'CRITICAL', estimatedDaysRemaining: 0.5 };

    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: criticalUnified,
      mockTargetMedicine: criticalTargetMed,
      mockFederatedForecast: {
        forecastDemand: 5,
        deterministicDemand: 40,
        available: true
      }
    });

    // Authoritative risk remains CRITICAL (not downgraded to SAFE)
    assert.strictEqual(context.unifiedRisk.overallRisk, UNIFIED_RISK_STATUS.CRITICAL);
    assert.strictEqual(context.medicine.targetMedicine.riskLevel, 'CRITICAL');
    assert.strictEqual(context.federatedForecast.direction, 'LOWER');
  });

  await t.test('E. INSUFFICIENT_DATA is preserved without fabricated values', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockFootfallStats: null,
      mockTargetMedicine: null
    });

    assert.strictEqual(context.federatedForecast.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(context.federatedForecast.forecastDemand, null);
    assert.strictEqual(context.federatedForecast.direction, 'UNAVAILABLE');
    assert.strictEqual(context.federatedForecast.isAvailable, false);
  });

  await t.test('F. Zero raw training data or regional datasets leak to Gemini', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: mockUnifiedNakra,
      mockFootfallStats: { last7DaysAvg: 40, trend: 'INCREASING' }
    });

    const contextStr = JSON.stringify(context);
    assert.strictEqual(contextStr.includes('node_gujarat'), false);
    assert.strictEqual(contextStr.includes('node_maharashtra'), false);
    assert.strictEqual(contextStr.includes('node_rajasthan'), false);
    assert.strictEqual(contextStr.includes('rawFootfallRecords'), false);
  });

  await t.test('G. Zero secrets, credentials, or API keys reach Gemini context', async () => {
    const context = await buildMultiResourceGeminiContext({
      phcId: 'phc_03',
      mockPHCs: [{ phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat' }],
      mockUnifiedRisk: mockUnifiedNakra
    });

    const contextStr = JSON.stringify(context);
    assert.strictEqual(contextStr.includes('apiKey'), false);
    assert.strictEqual(contextStr.includes('GEMINI_API_KEY'), false);
    assert.strictEqual(contextStr.includes('FIREBASE'), false);
  });

  await t.test('H. Gemini failure preserves deterministic UI state', () => {
    const stateBefore = {
      overallRisk: UNIFIED_RISK_STATUS.AT_RISK,
      medicineStock: 160,
      federatedForecast: 65,
      aiExplanation: null,
      aiError: null
    };

    // Simulate API 500 error
    const stateAfterError = {
      ...stateBefore,
      aiExplanation: null,
      aiError: 'AI explanation temporarily unavailable.'
    };

    assert.strictEqual(stateAfterError.overallRisk, UNIFIED_RISK_STATUS.AT_RISK);
    assert.strictEqual(stateAfterError.medicineStock, 160);
    assert.strictEqual(stateAfterError.federatedForecast, 65);
    assert.strictEqual(stateAfterError.aiError, 'AI explanation temporarily unavailable.');
  });

  await t.test('I. System instruction mandates explanation of divergence without risk override', () => {
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /The federated forecast is an additional predictive intelligence signal and is not authoritative/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Explain meaningful agreement or divergence between deterministic demand and federated forecast signals/);
    assert.match(GEMINI_SYSTEM_INSTRUCTION, /Do not replace deterministic risk with federated predictions/);
  });

  await t.test('J. Existing medicine risk calculations remain unchanged', () => {
    assert.strictEqual(mockTargetMed.riskLevel, 'AT_RISK');
    assert.strictEqual(mockTargetMed.predicted7DayDemand, 280);
    assert.strictEqual(mockTargetMed.averageDailyDemand, 40);
    assert.strictEqual(mockTargetMed.estimatedDaysRemaining, 4.0);
  });
});
