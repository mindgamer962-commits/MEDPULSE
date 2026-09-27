import test from 'node:test';
import assert from 'node:assert';
import {
  calculateWorkforceRisk,
  getWorkforceRisk,
  WORKFORCE_STATUS,
  WORKFORCE_THRESHOLDS,
  ROLE_RISK_NOTE
} from './workforceRisk.js';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';

test('Day 9 Step 5 - Workforce Risk Logic', async (t) => {
  const phcId = 'phc-alpha';
  const date = '2026-09-14';

  const staffHelper = (id, role = 'MEDICAL_OFFICER', status = 'ACTIVE', phc = 'phc-alpha') => ({
    staff_id: id, phc_id: phc, role, status
  });

  const logHelper = (id, status = 'PRESENT', phc = 'phc-alpha', d = '2026-09-14') => ({
    attendance_id: 'att-' + id, staff_id: id, phc_id: phc, date: d, status
  });

  await t.test('1. Adequate attendance (>= 90%) produces ADEQUATE status', () => {
    const metrics = {
      phcId,
      date,
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      present: 9,
      late: 1,
      absent: 0,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 100.0,
      roles: {}
    };
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.attendancePercentage, 100.0);
    assert.strictEqual(risk.dataStatus, 'AVAILABLE');
    assert.match(risk.reason, /adequate operational range/);
  });

  await t.test('2. At-risk attendance (75% <= pct < 90%) produces AT_RISK status', () => {
    const metrics = {
      phcId,
      date,
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      present: 8,
      late: 0,
      absent: 2,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 80.0,
      roles: {}
    };
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
    assert.strictEqual(risk.attendancePercentage, 80.0);
    assert.match(risk.reason, /below the adequate threshold but above critical/);
  });

  await t.test('3. Critical attendance (< 75%) produces CRITICAL status', () => {
    const metrics = {
      phcId,
      date,
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      present: 6,
      late: 0,
      absent: 4,
      authorizedLeave: 0,
      unrecorded: 0,
      attendancePercentage: 60.0,
      roles: {}
    };
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(risk.attendancePercentage, 60.0);
    assert.match(risk.reason, /below the operational critical threshold/);
  });

  await t.test('4. Exactly-at-threshold boundary values', () => {
    // 90.0% is exactly the adequate threshold
    const at90 = calculateWorkforceRisk({
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      attendancePercentage: 90.0
    });
    assert.strictEqual(at90.status, WORKFORCE_STATUS.ADEQUATE);

    // 89.9% is just below adequate -> AT_RISK
    const at89_9 = calculateWorkforceRisk({
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      attendancePercentage: 89.9
    });
    assert.strictEqual(at89_9.status, WORKFORCE_STATUS.AT_RISK);

    // 75.0% is exactly the at-risk threshold
    const at75 = calculateWorkforceRisk({
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      attendancePercentage: 75.0
    });
    assert.strictEqual(at75.status, WORKFORCE_STATUS.AT_RISK);

    // 74.9% is below at-risk -> CRITICAL
    const at74_9 = calculateWorkforceRisk({
      dataStatus: 'AVAILABLE',
      totalAssigned: 10,
      attendancePercentage: 74.9
    });
    assert.strictEqual(at74_9.status, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('5. Missing staff roster produces INSUFFICIENT_DATA', () => {
    const risk = getWorkforceRisk(phcId, date, [], []);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(risk.attendancePercentage, null);
    assert.match(risk.reason, /no active staff are assigned/);
  });

  await t.test('6. Missing attendance feed produces INSUFFICIENT_DATA without crashing', () => {
    const staff = [staffHelper('s1'), staffHelper('s2')];
    const risk = getWorkforceRisk(phcId, date, staff, []);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'DATA_UNAVAILABLE');
    assert.strictEqual(risk.attendancePercentage, null);
    assert.match(risk.reason, /Attendance data is unavailable/);
  });

  await t.test('7. Explicit ABSENT records properly influence calculation', () => {
    const staff = [staffHelper('s1'), staffHelper('s2'), staffHelper('s3'), staffHelper('s4')];
    const logs = [
      logHelper('s1', 'PRESENT'),
      logHelper('s2', 'PRESENT'),
      logHelper('s3', 'PRESENT'),
      logHelper('s4', 'ABSENT')
    ];
    // 3 present out of 4 = 75.0% -> AT_RISK
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
    assert.strictEqual(risk.attendancePercentage, 75.0);
    assert.strictEqual(risk.metrics.absent, 1);
    assert.strictEqual(risk.metrics.present, 3);
  });

  await t.test('8. LATE records count as operationally present for capacity', () => {
    const staff = [staffHelper('s1'), staffHelper('s2'), staffHelper('s3'), staffHelper('s4')];
    const logs = [
      logHelper('s1', 'PRESENT'),
      logHelper('s2', 'PRESENT'),
      logHelper('s3', 'PRESENT'),
      logHelper('s4', 'LATE')
    ];
    // 3 present + 1 late = 4/4 = 100.0% -> ADEQUATE
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.attendancePercentage, 100.0);
    assert.strictEqual(risk.metrics.late, 1);
    assert.strictEqual(risk.metrics.present, 3);
  });

  await t.test('9. AUTHORIZED_LEAVE is excluded from denominator', () => {
    const staff = [staffHelper('s1'), staffHelper('s2'), staffHelper('s3'), staffHelper('s4')];
    const logs = [
      logHelper('s1', 'PRESENT'),
      logHelper('s2', 'PRESENT'),
      logHelper('s3', 'PRESENT'),
      logHelper('s4', 'AUTHORIZED_LEAVE')
    ];
    // 3 present / (4 - 1 leave) = 3/3 = 100.0% -> ADEQUATE
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.attendancePercentage, 100.0);
    assert.strictEqual(risk.metrics.authorizedLeave, 1);
    assert.strictEqual(risk.metrics.absent, 0);
  });

  await t.test('10. Invalid data / duplicate logs flags INSUFFICIENT_DATA and invalid status', () => {
    const staff = [staffHelper('s1')];
    const logs = [logHelper('s1', 'PRESENT'), logHelper('s1', 'ABSENT')];
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INVALID_DATA');
    assert.match(risk.reason, /invalid or conflicting attendance/);
  });

  await t.test('11. Role-level data without authoritative role minimums includes disclaimer note', () => {
    const staff = [
      staffHelper('s1', 'MEDICAL_OFFICER'),
      staffHelper('s2', 'NURSE'),
      staffHelper('s3', 'PHARMACIST')
    ];
    const logs = [
      logHelper('s1', 'ABSENT'),
      logHelper('s2', 'PRESENT'),
      logHelper('s3', 'PRESENT')
    ];
    // 2/3 = 66.7% -> CRITICAL
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(risk.roles.MEDICAL_OFFICER.attendancePercentage, 0);
    assert.strictEqual(risk.roles.NURSE.attendancePercentage, 100);
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
    assert.strictEqual(risk.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
  });

  await t.test('12. Incomplete attendance feed does NOT convert missing log to ABSENT and yields INSUFFICIENT_DATA', () => {
    const staff = [staffHelper('s1'), staffHelper('s2')];
    // Only s1 has a log; s2 is unrecorded
    const logs = [logHelper('s1', 'PRESENT')];
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(risk.metrics.absent, 0, 'Unrecorded staff must NOT become ABSENT');
    assert.strictEqual(risk.metrics.unrecorded, 1);
    assert.strictEqual(risk.attendancePercentage, null);
    assert.match(risk.reason, /attendance records are incomplete/);
  });

  await t.test('13. No false CRITICAL from missing data', () => {
    // If attendance is missing entirely, status must NOT be CRITICAL
    const staff = [staffHelper('s1'), staffHelper('s2')];
    const risk = getWorkforceRisk(phcId, date, staff, []);
    assert.notStrictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('14. No false SAFE/ADEQUATE from missing data', () => {
    // If attendance is missing, status must NOT be ADEQUATE
    const staff = [staffHelper('s1')];
    const risk = getWorkforceRisk(phcId, date, staff, []);
    assert.notStrictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('15. All staff on authorized leave results in INSUFFICIENT_DATA without crashing', () => {
    const staff = [staffHelper('s1'), staffHelper('s2')];
    const logs = [
      logHelper('s1', 'AUTHORIZED_LEAVE'),
      logHelper('s2', 'AUTHORIZED_LEAVE')
    ];
    const risk = getWorkforceRisk(phcId, date, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.attendancePercentage, null);
    assert.match(risk.reason, /All assigned personnel are on authorized leave/);
  });

  await t.test('16. Threshold metadata and disclaimer always included', () => {
    const risk = calculateWorkforceRisk(null);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.thresholds.adequateMin, 90.0);
    assert.strictEqual(risk.thresholds.atRiskMin, 75.0);
    assert.strictEqual(risk.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
  });
});
