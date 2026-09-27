import test from 'node:test';
import assert from 'node:assert';
import { calculateWorkforceRisk, getWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from './workforceRisk.js';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';

test('Day 10 Step 3 — Personnel Staffing Risk Integration & Boundary Suite', async (t) => {
  const phcAlpha = 'phc-alpha';
  const phcBeta = 'phc-beta';
  const date1 = '2026-09-14';
  const date2 = '2026-09-15';

  const staff = [
    { staff_id: 's1', phc_id: phcAlpha, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's2', phc_id: phcAlpha, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's3', phc_id: phcAlpha, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's4', phc_id: phcAlpha, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's5', phc_id: phcAlpha, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's6', phc_id: phcAlpha, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's7', phc_id: phcAlpha, role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's8', phc_id: phcAlpha, role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's9', phc_id: phcAlpha, role: 'OTHER', status: 'ACTIVE' },
    { staff_id: 's10', phc_id: phcAlpha, role: 'OTHER', status: 'ACTIVE' },
    // Beta staff
    { staff_id: 'sb1', phc_id: phcBeta, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 'sb2', phc_id: phcBeta, role: 'NURSE', status: 'ACTIVE' }
  ];

  await t.test('1. ADEQUATE result: 100% attendance produces ADEQUATE', () => {
    const logs = staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: 'PRESENT'
    }));

    const risk = getWorkforceRisk(phcAlpha, date1, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.attendancePercentage, 100.0);
    assert.match(risk.reason, /adequate operational range/);
  });

  await t.test('2. AT_RISK result: 80.0% attendance produces AT_RISK', () => {
    // 8 present, 2 absent out of 10 assigned = 80.0%
    const logs = staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: idx < 8 ? 'PRESENT' : 'ABSENT'
    }));

    const risk = getWorkforceRisk(phcAlpha, date1, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
    assert.strictEqual(risk.attendancePercentage, 80.0);
    assert.match(risk.reason, /below the adequate threshold but above critical/);
  });

  await t.test('3. CRITICAL result: 60.0% attendance produces CRITICAL', () => {
    // 6 present, 4 absent out of 10 assigned = 60.0%
    const logs = staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: idx < 6 ? 'PRESENT' : 'ABSENT'
    }));

    const risk = getWorkforceRisk(phcAlpha, date1, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(risk.attendancePercentage, 60.0);
    assert.match(risk.reason, /below the operational critical threshold/);
  });

  await t.test('4. INSUFFICIENT_DATA result: Empty or missing data produces INSUFFICIENT_DATA', () => {
    const risk = getWorkforceRisk(phcAlpha, date1, [], []);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.attendancePercentage, null);
    assert.strictEqual(risk.dataStatus, 'INSUFFICIENT_DATA');
  });

  await t.test('5. 90.0% boundary: Exactly 90.0% produces ADEQUATE', () => {
    // 9 present, 1 absent out of 10 assigned = 90.0%
    const logs = staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: idx < 9 ? 'PRESENT' : 'ABSENT'
    }));

    const risk = getWorkforceRisk(phcAlpha, date1, staff, logs);
    assert.strictEqual(risk.attendancePercentage, 90.0);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
  });

  await t.test('6. 89.9% boundary: 89.9% produces AT_RISK', () => {
    const mockMetrics = {
      phcId: phcAlpha,
      date: date1,
      dataStatus: 'AVAILABLE',
      totalAssigned: 100,
      present: 89,
      late: 0,
      absent: 11,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 89.9
    };
    const risk = calculateWorkforceRisk(mockMetrics);
    assert.strictEqual(risk.attendancePercentage, 89.9);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
  });

  await t.test('7. 75.0% boundary: Exactly 75.0% produces AT_RISK', () => {
    const mockMetrics = {
      phcId: phcAlpha,
      date: date1,
      dataStatus: 'AVAILABLE',
      totalAssigned: 4,
      present: 3,
      late: 0,
      absent: 1,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 75.0
    };
    const risk = calculateWorkforceRisk(mockMetrics);
    assert.strictEqual(risk.attendancePercentage, 75.0);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
  });

  await t.test('8. 74.9% boundary: 74.9% produces CRITICAL', () => {
    const mockMetrics = {
      phcId: phcAlpha,
      date: date1,
      dataStatus: 'AVAILABLE',
      totalAssigned: 1000,
      present: 749,
      late: 0,
      absent: 251,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 74.9
    };
    const risk = calculateWorkforceRisk(mockMetrics);
    assert.strictEqual(risk.attendancePercentage, 74.9);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('9. PHC switching: Evaluates distinct facilities independently without stale bleed', () => {
    const multiPhcLogs = [
      // Alpha: 10 present (100% -> ADEQUATE)
      ...staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
        attendance_id: `a_alpha_${idx}`,
        staff_id: s.staff_id,
        phc_id: phcAlpha,
        date: date1,
        status: 'PRESENT'
      })),
      // Beta: 1 present, 1 absent (50% -> CRITICAL)
      { attendance_id: 'b1', staff_id: 'sb1', phc_id: phcBeta, date: date1, status: 'PRESENT' },
      { attendance_id: 'b2', staff_id: 'sb2', phc_id: phcBeta, date: date1, status: 'ABSENT' }
    ];

    const riskAlpha = getWorkforceRisk(phcAlpha, date1, staff, multiPhcLogs);
    const riskBeta = getWorkforceRisk(phcBeta, date1, staff, multiPhcLogs);

    assert.strictEqual(riskAlpha.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(riskAlpha.attendancePercentage, 100.0);

    assert.strictEqual(riskBeta.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(riskBeta.attendancePercentage, 50.0);
  });

  await t.test('10. Target-date switching: Recalculates risk for the new date', () => {
    const multiDateLogs = [
      // Date 1: 100% -> ADEQUATE
      ...staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
        attendance_id: `ad1_${idx}`,
        staff_id: s.staff_id,
        phc_id: phcAlpha,
        date: date1,
        status: 'PRESENT'
      })),
      // Date 2: 70% -> CRITICAL
      ...staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
        attendance_id: `ad2_${idx}`,
        staff_id: s.staff_id,
        phc_id: phcAlpha,
        date: date2,
        status: idx < 7 ? 'PRESENT' : 'ABSENT'
      }))
    ];

    const riskDate1 = getWorkforceRisk(phcAlpha, date1, staff, multiDateLogs);
    const riskDate2 = getWorkforceRisk(phcAlpha, date2, staff, multiDateLogs);

    assert.strictEqual(riskDate1.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(riskDate2.status, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('11. Incomplete attendance: Missing logs produce INSUFFICIENT_DATA and never fake CRITICAL/ADEQUATE', () => {
    // Only 5 out of 10 staff logged
    const logs = staff.filter(s => s.phc_id === phcAlpha).slice(0, 5).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: 'PRESENT'
    }));

    const risk = getWorkforceRisk(phcAlpha, date1, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(risk.attendancePercentage, null);
    assert.match(risk.reason, /5 unrecorded/);
  });

  await t.test('12. Missing workforce data: Complete absence of attendance feed yields DATA_UNAVAILABLE', () => {
    const risk = getWorkforceRisk(phcAlpha, date1, staff, []);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'DATA_UNAVAILABLE');
    assert.match(risk.reason, /Attendance data is unavailable/);
  });

  await t.test('13. Explainable reason: Matches computed outcome transparently', () => {
    const logsAdequate = staff.filter(s => s.phc_id === phcAlpha).map((s, idx) => ({
      attendance_id: `a_${idx}`,
      staff_id: s.staff_id,
      phc_id: phcAlpha,
      date: date1,
      status: 'PRESENT'
    }));
    const risk = getWorkforceRisk(phcAlpha, date1, staff, logsAdequate);
    assert.match(risk.reason, /Workforce attendance \(100%\) is within the adequate operational range/);
  });

  await t.test('14. Existing disclaimer & role note: Retained intact in risk object', () => {
    const risk = getWorkforceRisk(phcAlpha, date1, [], []);
    assert.strictEqual(risk.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
  });

  await t.test('15. No Firestore mutation: Pure evaluation maintains zero side-effects', () => {
    const frozenMetrics = Object.freeze({
      phcId: phcAlpha,
      date: date1,
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      present: 10,
      late: 0,
      absent: 0,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 100.0,
      roles: Object.freeze({
        MEDICAL_OFFICER: { assigned: 2, present: 2, late: 0, absent: 0, authorizedLeave: 0, unrecorded: 0, attendancePercentage: 100.0 }
      })
    });

    assert.doesNotThrow(() => {
      const risk = calculateWorkforceRisk(frozenMetrics);
      assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    });
  });
});
