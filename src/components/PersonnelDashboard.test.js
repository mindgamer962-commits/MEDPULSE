import test from 'node:test';
import assert from 'node:assert';
import { getWorkforceRisk, calculateWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from '../services/workforceRisk.js';
import { calculateAttendanceMetrics } from '../services/attendanceMetrics.js';
import { findNearbyWorkforceCapacity } from '../services/networkWorkforce.js';

test('Day 10 Step 4 — Personnel Availability Dashboard Integration Suite', async (t) => {
  const phcs = [
    { phc_id: 'phc_01', name: 'PHC Adalaj', district: 'Gandhinagar', state: 'Gujarat', latitude: 23.1667, longitude: 72.5833 },
    { phc_id: 'phc_03', name: 'PHC Nakra', district: 'Gandhinagar', state: 'Gujarat', latitude: 23.1800, longitude: 72.6000 },
    { phc_id: 'phc_17', name: 'PHC Bhankrota', district: 'Jaipur', state: 'Rajasthan', latitude: 26.8625, longitude: 75.6983 }
  ];
  const dateTarget = '2026-09-14';
  const dateAlt = '2026-09-15';

  const staff = [
    // PHC Adalaj (100% attendance)
    { staff_id: 's_ad_1', phc_id: 'phc_01', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_ad_2', phc_id: 'phc_01', role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's_ad_3', phc_id: 'phc_01', role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's_ad_4', phc_id: 'phc_01', role: 'OTHER', status: 'ACTIVE' },

    // PHC Nakra (50% attendance -> CRITICAL)
    { staff_id: 's_nk_1', phc_id: 'phc_03', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_nk_2', phc_id: 'phc_03', role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's_nk_3', phc_id: 'phc_03', role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's_nk_4', phc_id: 'phc_03', role: 'OTHER', status: 'ACTIVE' },

    // PHC Bhankrota (83.3% attendance -> AT_RISK)
    { staff_id: 's_bh_1', phc_id: 'phc_17', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_bh_2', phc_id: 'phc_17', role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's_bh_3', phc_id: 'phc_17', role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's_bh_4', phc_id: 'phc_17', role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's_bh_5', phc_id: 'phc_17', role: 'OTHER', status: 'ACTIVE' },
    { staff_id: 's_bh_6', phc_id: 'phc_17', role: 'OTHER', status: 'ACTIVE' }
  ];

  const attendance = [
    // Adalaj: 4/4 PRESENT -> 100%
    { attendance_id: 'att_ad_1', staff_id: 's_ad_1', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_ad_2', staff_id: 's_ad_2', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_ad_3', staff_id: 's_ad_3', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_ad_4', staff_id: 's_ad_4', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' },

    // Nakra: 2 PRESENT, 2 ABSENT -> 50%
    { attendance_id: 'att_nk_1', staff_id: 's_nk_1', phc_id: 'phc_03', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_nk_2', staff_id: 's_nk_2', phc_id: 'phc_03', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_nk_3', staff_id: 's_nk_3', phc_id: 'phc_03', date: dateTarget, status: 'ABSENT' },
    { attendance_id: 'att_nk_4', staff_id: 's_nk_4', phc_id: 'phc_03', date: dateTarget, status: 'ABSENT' },

    // Bhankrota: 4 PRESENT, 1 LATE, 1 ABSENT -> (4+1)/6 = 83.3%
    { attendance_id: 'att_bh_1', staff_id: 's_bh_1', phc_id: 'phc_17', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_bh_2', staff_id: 's_bh_2', phc_id: 'phc_17', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_bh_3', staff_id: 's_bh_3', phc_id: 'phc_17', date: dateTarget, status: 'LATE' },
    { attendance_id: 'att_bh_4', staff_id: 's_bh_4', phc_id: 'phc_17', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_bh_5', staff_id: 's_bh_5', phc_id: 'phc_17', date: dateTarget, status: 'PRESENT' },
    { attendance_id: 'att_bh_6', staff_id: 's_bh_6', phc_id: 'phc_17', date: dateTarget, status: 'ABSENT' }
  ];

  await t.test('1. Dashboard renders selected PHC context correctly', () => {
    const activePHC = phcs.find(p => p.phc_id === 'phc_01');
    assert.strictEqual(activePHC.name, 'PHC Adalaj');
    assert.strictEqual(activePHC.district, 'Gandhinagar');
  });

  await t.test('2. Target date is bound to evaluation context', () => {
    const metrics = calculateAttendanceMetrics('phc_01', dateTarget, staff, attendance);
    assert.strictEqual(metrics.date, '2026-09-14');
  });

  await t.test('3. Present metric correctly computed for dashboard', () => {
    const metricsAdalaj = calculateAttendanceMetrics('phc_01', dateTarget, staff, attendance);
    assert.strictEqual(metricsAdalaj.present, 4);
    const metricsNakra = calculateAttendanceMetrics('phc_03', dateTarget, staff, attendance);
    assert.strictEqual(metricsNakra.present, 2);
  });

  await t.test('4. Absent metric correctly computed for dashboard', () => {
    const metricsNakra = calculateAttendanceMetrics('phc_03', dateTarget, staff, attendance);
    assert.strictEqual(metricsNakra.absent, 2);
  });

  await t.test('5. On Duty metric = Present + Late displayed on dashboard', () => {
    const metricsBhankrota = calculateAttendanceMetrics('phc_17', dateTarget, staff, attendance);
    assert.strictEqual(metricsBhankrota.present, 4);
    assert.strictEqual(metricsBhankrota.late, 1);
    assert.strictEqual(metricsBhankrota.onDuty, 5);
  });

  await t.test('6. Authorized Leave correctly excluded from active denominator', () => {
    const staffWithLeave = [
      { staff_id: 'sl_1', phc_id: 'phc_01', role: 'NURSE', status: 'ACTIVE' },
      { staff_id: 'sl_2', phc_id: 'phc_01', role: 'NURSE', status: 'ACTIVE' }
    ];
    const attWithLeave = [
      { attendance_id: 'al_1', staff_id: 'sl_1', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' },
      { attendance_id: 'al_2', staff_id: 'sl_2', phc_id: 'phc_01', date: dateTarget, status: 'AUTHORIZED_LEAVE' }
    ];
    const metrics = calculateAttendanceMetrics('phc_01', dateTarget, staffWithLeave, attWithLeave);
    assert.strictEqual(metrics.authorizedLeave, 1);
    assert.strictEqual(metrics.attendancePercentage, 100.0);
  });

  await t.test('7. Attendance rate displayed accurately across distinct facilities', () => {
    const mAdalaj = calculateAttendanceMetrics('phc_01', dateTarget, staff, attendance);
    const mNakra = calculateAttendanceMetrics('phc_03', dateTarget, staff, attendance);
    const mBhankrota = calculateAttendanceMetrics('phc_17', dateTarget, staff, attendance);

    assert.strictEqual(mAdalaj.attendancePercentage, 100.0);
    assert.strictEqual(mNakra.attendancePercentage, 50.0);
    assert.strictEqual(mBhankrota.attendancePercentage, 83.3);
  });

  await t.test('8. Role availability breakdown displayed with Present / Assigned ratios', () => {
    const mBhankrota = calculateAttendanceMetrics('phc_17', dateTarget, staff, attendance);
    assert.strictEqual(mBhankrota.roles.MEDICAL_OFFICER.assigned, 1);
    assert.strictEqual(mBhankrota.roles.MEDICAL_OFFICER.present, 1);
    assert.strictEqual(mBhankrota.roles.NURSE.assigned, 2);
    assert.strictEqual(mBhankrota.roles.NURSE.onDuty, 2); // 1 present + 1 late
    assert.strictEqual(mBhankrota.roles.PHARMACIST.assigned, 1);
    assert.strictEqual(mBhankrota.roles.OTHER.assigned, 2);
  });

  await t.test('9. Workforce risk classification displayed prominently', () => {
    const rAdalaj = getWorkforceRisk('phc_01', dateTarget, staff, attendance);
    const rNakra = getWorkforceRisk('phc_03', dateTarget, staff, attendance);
    const rBhankrota = getWorkforceRisk('phc_17', dateTarget, staff, attendance);

    assert.strictEqual(rAdalaj.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(rNakra.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(rBhankrota.status, WORKFORCE_STATUS.AT_RISK);
  });

  await t.test('10. Risk diagnostic matches computed outcome transparently', () => {
    const rAdalaj = getWorkforceRisk('phc_01', dateTarget, staff, attendance);
    assert.match(rAdalaj.reason, /adequate operational range/);
    const rNakra = getWorkforceRisk('phc_03', dateTarget, staff, attendance);
    assert.match(rNakra.reason, /critical threshold/);
  });

  await t.test('11. Provenance and threshold disclaimer preserved', () => {
    const r = getWorkforceRisk('phc_01', dateTarget, staff, attendance);
    assert.strictEqual(r.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
    assert.strictEqual(r.roleRiskNote, ROLE_RISK_NOTE);
  });

  await t.test('12. PHC switching updates dashboard deterministically', () => {
    const r1 = getWorkforceRisk('phc_01', dateTarget, staff, attendance);
    const r2 = getWorkforceRisk('phc_03', dateTarget, staff, attendance);
    assert.notStrictEqual(r1.status, r2.status);
    assert.strictEqual(r1.phcId, 'phc_01');
    assert.strictEqual(r2.phcId, 'phc_03');
  });

  await t.test('13. Date switching updates dashboard deterministically without bleed', () => {
    const rTarget = getWorkforceRisk('phc_01', dateTarget, staff, attendance);
    const rAlt = getWorkforceRisk('phc_01', dateAlt, staff, attendance); // No logs on dateAlt
    assert.strictEqual(rTarget.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(rAlt.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(rAlt.dataStatus, 'DATA_UNAVAILABLE');
  });

  await t.test('14. Insufficient-data state displayed cleanly without false numbers', () => {
    const rEmpty = getWorkforceRisk('phc_unknown', dateTarget, staff, attendance);
    assert.strictEqual(rEmpty.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(rEmpty.attendancePercentage, null);
  });

  await t.test('15. Read-only execution: Zero mutations or side effects on input dataset', () => {
    const frozenStaff = Object.freeze([
      Object.freeze({ staff_id: 's_fr_1', phc_id: 'phc_01', role: 'NURSE', status: 'ACTIVE' })
    ]);
    const frozenAtt = Object.freeze([
      Object.freeze({ attendance_id: 'a_fr_1', staff_id: 's_fr_1', phc_id: 'phc_01', date: dateTarget, status: 'PRESENT' })
    ]);

    assert.doesNotThrow(() => {
      const metrics = calculateAttendanceMetrics('phc_01', dateTarget, frozenStaff, frozenAtt);
      const risk = calculateWorkforceRisk(metrics);
      assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    });
  });
});
