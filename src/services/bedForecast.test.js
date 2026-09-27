import test from 'node:test';
import assert from 'node:assert';
import { calculateBedForecast } from './bedForecast.js';

function buildFootfallData(phcId, baseDate, daysArr) {
    const ffs = [];
    // daysArr is array of { dayOffset, count, ...other }
    for (const d of daysArr) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - d.dayOffset);
        ffs.push({
            phc_id: phcId,
            date: date.toISOString().split('T')[0],
            patient_count: d.count,
            ...d.other
        });
    }
    return ffs;
}

test('Day 8 Step 3 - Bed Demand Forecast Engine', async (t) => {
    const phcId = 'phc-test';
    const admissionRate = 8;
    const now = new Date();
    
    const bedDataTemplate = {
        data_available: true,
        beds: { available_beds: 20 }
    };

    await t.test('A. 14-day minimum & B. insufficient history', () => {
        const insufficientData = buildFootfallData(phcId, now, Array.from({length: 13}, (_, i) => ({ dayOffset: i, count: 100 })));
        const res = calculateBedForecast(phcId, admissionRate, insufficientData, bedDataTemplate);
        assert.strictEqual(res.overallStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(res.forecast.length, 0);

        const sufficientData = buildFootfallData(phcId, now, Array.from({length: 14}, (_, i) => ({ dayOffset: i, count: 100 })));
        const res2 = calculateBedForecast(phcId, admissionRate, sufficientData, bedDataTemplate);
        assert.notStrictEqual(res2.overallStatus, 'INSUFFICIENT_DATA');
    });

    await t.test('C. recent/previous averages & D. trend ratio', () => {
        // prev 7 days: 50/day. recent 7 days: 100/day.
        let data = [];
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i, count: 100 })))); // recent
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i + 7, count: 50 })))); // prev
        
        const res = calculateBedForecast(phcId, admissionRate, data, bedDataTemplate);
        assert.strictEqual(res._debug.recentAvgFf, 100);
        assert.strictEqual(res._debug.prevAvgFf, 50);
        assert.strictEqual(res._debug.trendRatio, 2.0);
    });

    await t.test('E. 0.5 lower clamp', () => {
        // prev 7 days: 100/day. recent 7 days: 10/day. trend ratio = 0.1
        let data = [];
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i, count: 10 }))));
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i + 7, count: 100 }))));
        
        const res = calculateBedForecast(phcId, admissionRate, data, bedDataTemplate);
        assert.strictEqual(res._debug.trendRatio, 0.1);
        assert.strictEqual(res._debug.clampedTrendRatio, 0.5);
    });

    await t.test('F. 2.5 upper clamp', () => {
        // prev 7 days: 10/day. recent 7 days: 100/day. trend ratio = 10.0
        let data = [];
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i, count: 100 }))));
        data.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i + 7, count: 10 }))));
        
        const res = calculateBedForecast(phcId, admissionRate, data, bedDataTemplate);
        assert.strictEqual(res._debug.trendRatio, 10.0);
        assert.strictEqual(res._debug.clampedTrendRatio, 2.5);
    });

    await t.test('G. 3-day forecast logic & H. admission-rate conversion', () => {
        // Flat 100/day. 8% admission -> 8 expected beds.
        const data = buildFootfallData(phcId, now, Array.from({length: 14}, (_, i) => ({ dayOffset: i, count: 100 })));
        const res = calculateBedForecast(phcId, 8, data, bedDataTemplate);
        
        assert.strictEqual(res.forecast.length, 3);
        assert.strictEqual(res.forecast[0].expectedFootfall, 100);
        assert.strictEqual(res.forecast[0].expectedBedDemand, 8); // 8% of 100
        
        // At trend 2.0 -> day 1 = 100 * (1 + 1 * (1/3)) = 133
        let surgeData = [];
        surgeData.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i, count: 100 }))));
        surgeData.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i + 7, count: 50 }))));
        const resSurge = calculateBedForecast(phcId, 8, surgeData, bedDataTemplate);
        
        assert.strictEqual(resSurge.forecast[0].expectedFootfall, 133); // 100 * (1 + 1/3)
        assert.strictEqual(resSurge.forecast[1].expectedFootfall, 167); // 100 * (1 + 2/3)
        assert.strictEqual(resSurge.forecast[2].expectedFootfall, 200); // 100 * (1 + 1)
        
        assert.strictEqual(resSurge.forecast[0].expectedBedDemand, 11); // Math.round(133 * 0.08) = 11
        assert.strictEqual(resSurge.forecast[1].expectedBedDemand, 13); // Math.round(167 * 0.08) = 13
        assert.strictEqual(resSurge.forecast[2].expectedBedDemand, 16); // Math.round(200 * 0.08) = 16
    });

    await t.test('I. current available beds remain unchanged', () => {
        const data = buildFootfallData(phcId, now, Array.from({length: 14}, (_, i) => ({ dayOffset: i, count: 100 })));
        const res = calculateBedForecast(phcId, 8, data, { data_available: true, beds: { available_beds: 50 }});
        
        assert.strictEqual(res.currentAvailableBeds, 50);
        assert.strictEqual(res.forecast[0].availableBeds, 50);
        assert.strictEqual(res.forecast[1].availableBeds, 50);
        assert.strictEqual(res.forecast[2].availableBeds, 50);
    });

    await t.test('J, K, L, M, N. Status logic and earliestPredictedShortage', () => {
        let surgeData = [];
        surgeData.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i, count: 100 })))); // 100
        surgeData.push(...buildFootfallData(phcId, now, Array.from({length: 7}, (_, i) => ({ dayOffset: i + 7, count: 50 })))); // 50
        
        // Expected Demand: 11, 13, 16
        
        // Test Positive Margin
        const resSafe = calculateBedForecast(phcId, 8, surgeData, { data_available: true, beds: { available_beds: 20 }});
        assert.strictEqual(resSafe.forecast[2].capacityMargin, 4);
        assert.strictEqual(resSafe.forecast[2].status, 'CAPACITY_AVAILABLE');
        assert.strictEqual(resSafe.overallStatus, 'CAPACITY_AVAILABLE');
        assert.strictEqual(resSafe.earliestPredictedShortage, null);

        // Test Zero Margin -> AT_RISK
        const resAtRisk = calculateBedForecast(phcId, 8, surgeData, { data_available: true, beds: { available_beds: 16 }});
        assert.strictEqual(resAtRisk.forecast[2].capacityMargin, 0); // 16 - 16 = 0
        assert.strictEqual(resAtRisk.forecast[2].status, 'AT_RISK');
        assert.strictEqual(resAtRisk.overallStatus, 'AT_RISK');
        assert.strictEqual(resAtRisk.earliestPredictedShortage, null); // 0 margin is not a shortage

        // Test Negative Margin -> OVER_CAPACITY
        const resOver = calculateBedForecast(phcId, 8, surgeData, { data_available: true, beds: { available_beds: 12 }});
        assert.strictEqual(resOver.forecast[0].capacityMargin, 1); // 12 - 11 = 1
        assert.strictEqual(resOver.forecast[1].capacityMargin, -1); // 12 - 13 = -1
        assert.strictEqual(resOver.forecast[2].capacityMargin, -4); // 12 - 16 = -4
        assert.strictEqual(resOver.forecast[1].status, 'OVER_CAPACITY');
        assert.strictEqual(resOver.overallStatus, 'OVER_CAPACITY');
        
        // Date strings are computed relative to now + 2 days
        const d2 = new Date(now); d2.setDate(d2.getDate() + 2);
        assert.strictEqual(resOver.earliestPredictedShortage, d2.toISOString().split('T')[0]);
    });

    await t.test('O. duplicate handling, P. invalid records, Q. missing dates, R. outlier handling', () => {
        let dirtyData = buildFootfallData(phcId, now, Array.from({length: 13}, (_, i) => ({ dayOffset: i+1, count: 100 }))); // 13 valid days (days 1-13)
        
        // Add Day 0 (today) as duplicate: count 50 and count 150
        const day0Str = now.toISOString().split('T')[0];
        dirtyData.push({ phc_id: phcId, date: day0Str, patient_count: 50 });
        dirtyData.push({ phc_id: phcId, date: day0Str, patient_count: 150 });
        
        // Add invalid record
        dirtyData.push({ phc_id: null, date: '2026-01-01', patient_count: 100 });
        
        // Add outlier
        const day15Str = new Date(now.getTime() - 15 * 86400000).toISOString().split('T')[0];
        dirtyData.push({ phc_id: phcId, date: day15Str, patient_count: 5000 });
        
        // Add missing date
        dirtyData.push({ phc_id: phcId, date: null, patient_count: 100 });

        const res = calculateBedForecast(phcId, 8, dirtyData, bedDataTemplate);
        
        // Should have exactly 14 valid records (13 from loop + 1 deduplicated Day 0)
        assert.notStrictEqual(res.overallStatus, 'INSUFFICIENT_DATA');
        
        // Verify duplicate handling (Day 0 should be 150)
        // Recent 7 days = Day 0 to Day 6. 
        // Day 0: 150. Day 1..6: 100 each (6 * 100). Sum = 750. Avg = 750 / 7 = 107.14
        assert.strictEqual(res._debug.recentAvgFf, 750 / 7);
    });

    await t.test('S. zero footfall', () => {
        const data = buildFootfallData(phcId, now, Array.from({length: 14}, (_, i) => ({ dayOffset: i, count: 0 })));
        const res = calculateBedForecast(phcId, 8, data, bedDataTemplate);
        
        assert.strictEqual(res.forecast[0].expectedFootfall, 0);
        assert.strictEqual(res.forecast[0].expectedBedDemand, 0);
        assert.strictEqual(res.forecast[0].capacityMargin, 20); // 20 - 0 = 20
        assert.strictEqual(res.forecast[0].status, 'CAPACITY_AVAILABLE');
    });

    await t.test('T. zero available beds', () => {
        const data = buildFootfallData(phcId, now, Array.from({length: 14}, (_, i) => ({ dayOffset: i, count: 100 })));
        const res = calculateBedForecast(phcId, 8, data, { data_available: true, beds: { available_beds: 0 }});
        
        // Demand = 8. Available = 0. Margin = -8.
        assert.strictEqual(res.forecast[0].expectedBedDemand, 8);
        assert.strictEqual(res.forecast[0].capacityMargin, -8);
        assert.strictEqual(res.forecast[0].status, 'OVER_CAPACITY');
        assert.strictEqual(res.overallStatus, 'OVER_CAPACITY');
        const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
        assert.strictEqual(res.earliestPredictedShortage, d1.toISOString().split('T')[0]);
    });
});
