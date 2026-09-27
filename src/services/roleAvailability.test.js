import test from 'node:test';
import assert from 'node:assert';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';
import { getWorkforceRisk, WORKFORCE_STATUS, ROLE_RISK_NOTE } from './workforceRisk.js';

test('Day 10 Step 2 — Role-Level Personnel Availability Service & UI Logic', async (t) => {
  const phcId = 'phc-role-test-1';
  const otherPhcId = 'phc-role-test-2';
  const targetDate = '2026-09-14';
  const otherDate = '2026-09-15';

  const staff = [
    // 2 Doctors
    { staff_id: 'doc_1', phc_id: phcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 'doc_2', phc_id: phcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    // 3 Nurses
    { staff_id: 'nurse_1', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 'nurse_2', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 'nurse_3', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' },
    // 2 Pharmacists
    { staff_id: 'pharm_1', phc_id: phcId, role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 'pharm_2', phc_id: phcId, role: 'PHARMACIST', status: 'ACTIVE' },
    // 2 Other
    { staff_id: 'oth_1', phc_id: phcId, role: 'OTHER', status: 'ACTIVE' },
    { staff_id: 'oth_2', phc_id: phcId, role: 'OTHER', status: 'ACTIVE' },
    // Other PHC staff
    { staff_id: 'doc_other', phc_id: otherPhcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' }
  ];

  await t.test('1. Doctor (MEDICAL_OFFICER) assigned/present calculation', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const docRole = metrics.roles.MEDICAL_OFFICER;
    assert.strictEqual(docRole.assigned, 2);
    assert.strictEqual(docRole.present, 2);
    assert.strictEqual(docRole.onDuty, 2);
    assert.strictEqual(docRole.attendancePercentage, 100.0);
  });

  await t.test('2. Nurse (NURSE) assigned/present calculation with mixed presence', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const nurseRole = metrics.roles.NURSE;
    assert.strictEqual(nurseRole.assigned, 3);
    assert.strictEqual(nurseRole.present, 2);
    assert.strictEqual(nurseRole.absent, 1);
    assert.strictEqual(nurseRole.onDuty, 2);
    // 2 / 3 * 100 = 66.7%
    assert.strictEqual(nurseRole.attendancePercentage, 66.7);
  });

  await t.test('3. Pharmacist (PHARMACIST) assigned/present calculation', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const pharmRole = metrics.roles.PHARMACIST;
    assert.strictEqual(pharmRole.assigned, 2);
    assert.strictEqual(pharmRole.present, 2);
    assert.strictEqual(pharmRole.onDuty, 2);
    assert.strictEqual(pharmRole.attendancePercentage, 100.0);
  });

  await t.test('4. Other (OTHER) assigned/present calculation', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'ABSENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const otherRole = metrics.roles.OTHER;
    assert.strictEqual(otherRole.assigned, 2);
    assert.strictEqual(otherRole.present, 1);
    assert.strictEqual(otherRole.absent, 1);
    assert.strictEqual(otherRole.onDuty, 1);
    // 1 / 2 * 100 = 50.0%
    assert.strictEqual(otherRole.attendancePercentage, 50.0);
  });

  await t.test('5. PRESENT handling: Only explicit PRESENT counts in present count', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'LATE' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.present, 1);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.late, 1);
  });

  await t.test('6. LATE handling: LATE is tracked separately per role', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'LATE' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'LATE' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.NURSE.late, 2);
    assert.strictEqual(metrics.roles.NURSE.present, 1);
  });

  await t.test('7. ON DUTY = PRESENT + LATE on both role and facility levels', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'LATE' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'LATE' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    // Doctor on duty = 1 present + 1 late = 2
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.onDuty, 2);
    // Nurse on duty = 1 present + 1 late = 2
    assert.strictEqual(metrics.roles.NURSE.onDuty, 2);
    // Facility on duty = 6 present + 2 late = 8
    assert.strictEqual(metrics.onDuty, 8);
  });

  await t.test('8. ABSENT handling: Only explicit status ABSENT increments role absent count', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.absent, 1);
    assert.strictEqual(metrics.roles.NURSE.absent, 0);
  });

  await t.test('9. AUTHORIZED_LEAVE handling: Excluded from role denominator', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'AUTHORIZED_LEAVE' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const docRole = metrics.roles.MEDICAL_OFFICER;
    assert.strictEqual(docRole.assigned, 2);
    assert.strictEqual(docRole.authorizedLeave, 1);
    assert.strictEqual(docRole.present, 1);
    // Formula: 1 / (2 - 1) * 100 = 100.0%
    assert.strictEqual(docRole.attendancePercentage, 100.0);
  });

  await t.test('10. Missing attendance ≠ ABSENT for specific role members', () => {
    // doc_2 has no attendance record pushed for targetDate
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.unrecorded, 1);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.absent, 0); // Must NOT be treated as absent
  });

  await t.test('11. PHC isolation: Staff & attendance from other PHCs do not alter role counts', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      // Other PHC doctor log
      { attendance_id: 'a_other', staff_id: 'doc_other', phc_id: otherPhcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.assigned, 2);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.present, 2);
  });

  await t.test('12. Date isolation: Cross-date role records do not leak', () => {
    const logs = [
      // Target date: doc_1 present, doc_2 present
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      // Other date: both doctors absent
      { attendance_id: 'b1', staff_id: 'doc_1', phc_id: phcId, date: otherDate, status: 'ABSENT' },
      { attendance_id: 'b2', staff_id: 'doc_2', phc_id: phcId, date: otherDate, status: 'ABSENT' }
    ];

    const metricsTarget = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    const metricsOther = calculateAttendanceMetrics(phcId, otherDate, staff, logs);

    assert.strictEqual(metricsTarget.roles.MEDICAL_OFFICER.present, 2);
    assert.strictEqual(metricsTarget.roles.MEDICAL_OFFICER.absent, 0);

    assert.strictEqual(metricsOther.roles.MEDICAL_OFFICER.absent, 2);
    assert.strictEqual(metricsOther.roles.MEDICAL_OFFICER.present, 0);
  });

  await t.test('13. Role isolation: Changes in one role do not affect another', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 'doc_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 'doc_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 'nurse_1', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a4', staff_id: 'nurse_2', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a5', staff_id: 'nurse_3', phc_id: phcId, date: targetDate, status: 'ABSENT' },
      { attendance_id: 'a6', staff_id: 'pharm_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a7', staff_id: 'pharm_2', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a8', staff_id: 'oth_1', phc_id: phcId, date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a9', staff_id: 'oth_2', phc_id: phcId, date: targetDate, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.attendancePercentage, 100.0);
    assert.strictEqual(metrics.roles.NURSE.attendancePercentage, 0.0);
    assert.strictEqual(metrics.roles.PHARMACIST.attendancePercentage, 100.0);
    assert.strictEqual(metrics.roles.OTHER.attendancePercentage, 100.0);
  });

  await t.test('14. Incomplete-data handling: Preserves disclaimer and descriptive status without inventing minimums', () => {
    const risk = getWorkforceRisk(phcId, targetDate, [], []);
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('15. No Firestore mutation: Pure in-memory calculation preserves frozen objects', () => {
    const frozenStaff = Object.freeze([
      Object.freeze({ staff_id: 'd1', phc_id: phcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' })
    ]);
    const frozenLogs = Object.freeze([
      Object.freeze({ attendance_id: 'a1', staff_id: 'd1', phc_id: phcId, date: targetDate, status: 'PRESENT' })
    ]);

    assert.doesNotThrow(() => {
      const res = calculateAttendanceMetrics(phcId, targetDate, frozenStaff, frozenLogs);
      assert.strictEqual(res.roles.MEDICAL_OFFICER.present, 1);
      assert.strictEqual(res.roles.MEDICAL_OFFICER.assigned, 1);
      assert.strictEqual(res.roles.MEDICAL_OFFICER.attendancePercentage, 100.0);
    });
  });
});
