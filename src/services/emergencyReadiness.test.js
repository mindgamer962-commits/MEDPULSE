import test from 'node:test';
import assert from 'node:assert';
import { calculateEmergencyReadiness } from './emergencyReadiness.js';

const baseFootfall = { todayPatients: 10, last7DaysAvg: 10, prev7DaysAvg: 10, trend: 'STABLE' };
const baseBed = { overallStatus: 'CAPACITY_AVAILABLE', currentAvailableBeds: 5, forecast: [{ capacityMargin: 5 }], earliestPredictedShortage: null };
const baseMed = { riskLevel: 'SAFE', estimatedDaysRemaining: 10, projectedShortage: 0, stockOutDate: null };

test('Day 9 Step 5 - Emergency Readiness Normalizer', async (t) => {
    const phcId = 'phc-test';
    const medId = 'med-test';

    await t.test('1. All signals SAFE => SAFE', () => {
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, baseBed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'SAFE');
        assert.strictEqual(res.reasons.length, 0);
    });

    await t.test('2. Medicine AT_RISK only => WARNING', () => {
        const med = { ...baseMed, riskLevel: 'AT_RISK' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, baseBed, null, med, null);
        assert.strictEqual(res.overallStatus, 'WARNING');
        assert.ok(res.primaryReason.includes('AT_RISK'));
    });

    await t.test('3. Medicine CRITICAL => CRITICAL', () => {
        const med = { ...baseMed, riskLevel: 'CRITICAL', stockOutDate: '2026-09-10' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, baseBed, null, med, null);
        assert.strictEqual(res.overallStatus, 'CRITICAL');
        assert.ok(res.primaryReason.includes('CRITICAL'));
        assert.ok(res.primaryReason.includes('2026-09-10'));
    });

    await t.test('4. Bed AT_RISK only => WARNING', () => {
        const bed = { ...baseBed, forecast: [{ capacityMargin: 0 }], overallStatus: 'AT_RISK' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, bed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'WARNING');
    });

    await t.test('5. Bed OVER_CAPACITY => CRITICAL', () => {
        const bed = { ...baseBed, forecast: [{ capacityMargin: -2 }], overallStatus: 'OVER_CAPACITY', earliestPredictedShortage: '2026-09-11' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, bed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'CRITICAL');
        assert.ok(res.primaryReason.includes('OVER_CAPACITY on 2026-09-11'));
    });

    await t.test('6. Footfall INCREASING only => WARNING', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, baseBed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'WARNING');
    });

    await t.test('7. Two pressure signals => CRITICAL', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const bed = { ...baseBed, forecast: [{ capacityMargin: 0 }], overallStatus: 'AT_RISK' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, bed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'CRITICAL');
        assert.strictEqual(res.primaryReason, 'Multiple simultaneous capacity pressure signals detected.');
    });

    await t.test('8. Medicine AT_RISK + footfall INCREASING => CRITICAL', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const med = { ...baseMed, riskLevel: 'AT_RISK' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, baseBed, null, med, null);
        assert.strictEqual(res.overallStatus, 'CRITICAL');
    });

    await t.test('9. Bed AT_RISK + footfall INCREASING => CRITICAL', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const bed = { ...baseBed, forecast: [{ capacityMargin: 0 }], overallStatus: 'AT_RISK' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, bed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'CRITICAL');
    });

    await t.test('10. No pressure => SAFE', () => {
        const ff = { ...baseFootfall, trend: 'DECREASING' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, baseBed, null, baseMed, null);
        assert.strictEqual(res.overallStatus, 'SAFE');
    });

    await t.test('11. Medicine insufficient data', () => {
        const medErr = { error: 'Insufficient historical data' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, baseBed, null, medErr, null);
        assert.strictEqual(res.medicine.dataStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(res.overallStatus, 'SAFE'); // other signals exist and are SAFE
    });

    await t.test('12. Bed insufficient data', () => {
        const bedErr = { overallStatus: 'INSUFFICIENT_DATA' };
        const res = calculateEmergencyReadiness(phcId, medId, baseFootfall, null, bedErr, null, baseMed, null);
        assert.strictEqual(res.beds.dataStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(res.overallStatus, 'SAFE');
    });

    await t.test('13. Footfall insufficient data', () => {
        const ffErr = { error: 'insufficient' };
        const res = calculateEmergencyReadiness(phcId, medId, ffErr, null, baseBed, null, baseMed, null);
        assert.strictEqual(res.footfall.dataStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(res.overallStatus, 'SAFE');
    });

    await t.test('14. One signal unavailable while other signals remain usable', () => {
        const ffErr = { error: 'insufficient' };
        const med = { ...baseMed, riskLevel: 'CRITICAL' };
        const res = calculateEmergencyReadiness(phcId, medId, ffErr, null, baseBed, null, med, null);
        assert.strictEqual(res.footfall.dataStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(res.overallStatus, 'CRITICAL'); // medicine still triggers CRITICAL
    });

    await t.test('15. Runtime error is not converted into SAFE', () => {
        const errObj = new Error('Network error');
        const res = calculateEmergencyReadiness(phcId, medId, null, errObj, baseBed, null, baseMed, null);
        assert.strictEqual(res.footfall.dataStatus, 'ERROR');
        assert.strictEqual(res.overallStatus, 'SAFE'); // the remaining signals dictate the state, but the errored one stays ERROR, not SAFE
    });

    await t.test('16. Reasons are generated from actual data', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, baseBed, null, baseMed, null);
        assert.strictEqual(res.reasons.length, 1);
        assert.strictEqual(res.reasons[0], 'Footfall volume is INCREASING.');
    });

    await t.test('17. Primary reason priority', () => {
        const ff = { ...baseFootfall, trend: 'INCREASING' };
        const bed = { ...baseBed, forecast: [{ capacityMargin: -1 }], overallStatus: 'OVER_CAPACITY' };
        const res = calculateEmergencyReadiness(phcId, medId, ff, null, bed, null, baseMed, null);
        // Both are pressure. 2 pressures => CRITICAL.
        // Primary reason should be 'Multiple simultaneous capacity pressure signals detected.' or OVER_CAPACITY.
        // Actually, logic says if CRITICAL from OVER_CAPACITY and >= 2 pressures, both are true. Let's see what primaryReason is.
        // According to our logic: OVER_CAPACITY is hit first in the priority if-else ladder before multiple signals if we put it above.
        // Wait, multiple pressure priority is #3. Bed OVER_CAPACITY is #2.
        assert.ok(res.primaryReason.includes('OVER_CAPACITY'));
    });

    await t.test('18. No medicine selected/defined when PHC has multiple medicines', () => {
        const res = calculateEmergencyReadiness(phcId, null, baseFootfall, null, baseBed, null, null, null);
        assert.strictEqual(res.medicine.dataStatus, 'UNAVAILABLE');
    });

    await t.test('19. PHC switching / different phcIds', () => {
        const res1 = calculateEmergencyReadiness('phc-1', medId, baseFootfall, null, baseBed, null, baseMed, null);
        const res2 = calculateEmergencyReadiness('phc-2', medId, baseFootfall, null, baseBed, null, baseMed, null);
        assert.strictEqual(res1.phcId, 'phc-1');
        assert.strictEqual(res2.phcId, 'phc-2');
    });
});
