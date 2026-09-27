import test from 'node:test';
import assert from 'node:assert';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';
import { getWorkforceRisk, WORKFORCE_STATUS } from './workforceRisk.js';

test('Day 10 Step 1 — Date-Based Personnel Attendance Service & Metrics', async (t) => {
  const phcId = 'phc-test-1';
  const otherPhcId = 'phc-test-2';
  const dateA = '2026-09-14';
  const dateB = '2026-09-15';

  const staff = [
    { staff_id: 's1', phc_id: phcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's2', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's3', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' },
    { staff_id: 's4', phc_id: phcId, role: 'PHARMACIST', status: 'ACTIVE' },
    { staff_id: 's5', phc_id: phcId, role: 'OTHER', status: 'ACTIVE' },
    { staff_id: 's6', phc_id: otherPhcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' }
  ];

  await t.test('1. Selected date filtering: Only attendance matching target date is ingested', () => {
    const logs = [
      { attendance_id: 'a1_dateA', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2_dateA', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3_dateA', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a4_dateA', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5_dateA', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' },
      // Logs for Date B must NOT leak into Date A evaluation
      { attendance_id: 'a1_dateB', staff_id: 's1', phc_id: phcId, date: dateB, status: 'ABSENT' },
      { attendance_id: 'a2_dateB', staff_id: 's2', phc_id: phcId, date: dateB, status: 'ABSENT' }
    ];

    const metricsA = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metricsA.date, dateA);
    assert.strictEqual(metricsA.present, 5);
    assert.strictEqual(metricsA.absent, 0);
    assert.strictEqual(metricsA.attendancePercentage, 100.0);
  });

  await t.test('2. PRESENT: Explicit status PRESENT is tracked accurately', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.present, 5);
    assert.strictEqual(metrics.late, 0);
    assert.strictEqual(metrics.absent, 0);
    assert.strictEqual(metrics.onDuty, 5);
  });

  await t.test('3. LATE: Explicit status LATE tracked separately and counts towards On Duty', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'LATE' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'LATE' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.present, 3);
    assert.strictEqual(metrics.late, 2);
    assert.strictEqual(metrics.onDuty, 5); // 3 + 2 = 5
    assert.strictEqual(metrics.attendancePercentage, 100.0);
  });

  await t.test('4. ABSENT: Only explicit status ABSENT increments absent count', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'ABSENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.present, 4);
    assert.strictEqual(metrics.absent, 1);
    assert.strictEqual(metrics.onDuty, 4);
    assert.strictEqual(metrics.totalAssigned, 5);
    // 4 / 5 * 100 = 80.0%
    assert.strictEqual(metrics.attendancePercentage, 80.0);
  });

  await t.test('5. AUTHORIZED_LEAVE: Explicit status AUTHORIZED_LEAVE is excluded from denominator', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'AUTHORIZED_LEAVE' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.present, 4);
    assert.strictEqual(metrics.authorizedLeave, 1);
    assert.strictEqual(metrics.absent, 0);
    assert.strictEqual(metrics.onDuty, 4);
    // Formula: 4 / (5 - 1) * 100 = 100.0%
    assert.strictEqual(metrics.attendancePercentage, 100.0);
  });

  await t.test('6. ON DUTY = PRESENT + LATE definition', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'LATE' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'ABSENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'AUTHORIZED_LEAVE' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.present, 2);
    assert.strictEqual(metrics.late, 1);
    assert.strictEqual(metrics.onDuty, 3);
    assert.strictEqual(metrics.absent, 1);
    assert.strictEqual(metrics.authorizedLeave, 1);
    // Formula: (2 + 1) / (5 - 1) * 100 = 3 / 4 * 100 = 75.0%
    assert.strictEqual(metrics.attendancePercentage, 75.0);
  });

  await t.test('7. Missing attendance records NEVER become ABSENT (unrecorded & INCOMPLETE_DATA)', () => {
    // Only 3 logs provided for 5 active staff members on dateA
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' }
      // s4 and s5 have NO records on dateA
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(metrics.unrecorded, 2);
    assert.strictEqual(metrics.absent, 0); // Must NOT increment absent!
    assert.strictEqual(metrics.attendancePercentage, null); // Cannot produce a false definitive %

    // Workforce risk must safely classify as INSUFFICIENT_DATA
    const risk = getWorkforceRisk(phcId, dateA, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INCOMPLETE_DATA');
  });

  await t.test('8. PHC + Date isolation: Other PHCs logs do not pollute facility metrics', () => {
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' },
      // Other PHC log
      { attendance_id: 'a6', staff_id: 's6', phc_id: otherPhcId, date: dateA, status: 'ABSENT' }
    ];

    const metrics = calculateAttendanceMetrics(phcId, dateA, staff, logs);
    assert.strictEqual(metrics.totalAssigned, 5);
    assert.strictEqual(metrics.present, 5);
    assert.strictEqual(metrics.absent, 0);
  });

  await t.test('9. Date switching: Recalculates metrics for the new date independently', () => {
    const multiDayLogs = [
      // Day A: 100% attendance
      { attendance_id: 'a1_d1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a2_d1', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a3_d1', staff_id: 's3', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a4_d1', staff_id: 's4', phc_id: phcId, date: dateA, status: 'PRESENT' },
      { attendance_id: 'a5_d1', staff_id: 's5', phc_id: phcId, date: dateA, status: 'PRESENT' },

      // Day B: 3 present, 2 absent -> 60.0% attendance
      { attendance_id: 'a1_d2', staff_id: 's1', phc_id: phcId, date: dateB, status: 'PRESENT' },
      { attendance_id: 'a2_d2', staff_id: 's2', phc_id: phcId, date: dateB, status: 'PRESENT' },
      { attendance_id: 'a3_d2', staff_id: 's3', phc_id: phcId, date: dateB, status: 'PRESENT' },
      { attendance_id: 'a4_d2', staff_id: 's4', phc_id: phcId, date: dateB, status: 'ABSENT' },
      { attendance_id: 'a5_d2', staff_id: 's5', phc_id: phcId, date: dateB, status: 'ABSENT' }
    ];

    const metricsDateA = calculateAttendanceMetrics(phcId, dateA, staff, multiDayLogs);
    const metricsDateB = calculateAttendanceMetrics(phcId, dateB, staff, multiDayLogs);

    assert.strictEqual(metricsDateA.attendancePercentage, 100.0);
    assert.strictEqual(metricsDateA.present, 5);
    assert.strictEqual(metricsDateA.absent, 0);

    assert.strictEqual(metricsDateB.attendancePercentage, 60.0);
    assert.strictEqual(metricsDateB.present, 3);
    assert.strictEqual(metricsDateB.absent, 2);

    const riskA = getWorkforceRisk(phcId, dateA, staff, multiDayLogs);
    const riskB = getWorkforceRisk(phcId, dateB, staff, multiDayLogs);

    assert.strictEqual(riskA.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(riskB.status, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('10. Pure execution: Zero mutation of input staff/logs or external state', () => {
    const frozenStaff = Object.freeze([
      Object.freeze({ staff_id: 's1', phc_id: phcId, role: 'MEDICAL_OFFICER', status: 'ACTIVE' }),
      Object.freeze({ staff_id: 's2', phc_id: phcId, role: 'NURSE', status: 'ACTIVE' })
    ]);
    const frozenLogs = Object.freeze([
      Object.freeze({ attendance_id: 'a1', staff_id: 's1', phc_id: phcId, date: dateA, status: 'PRESENT' }),
      Object.freeze({ attendance_id: 'a2', staff_id: 's2', phc_id: phcId, date: dateA, status: 'PRESENT' })
    ]);

    assert.doesNotThrow(() => {
      const res = calculateAttendanceMetrics(phcId, dateA, frozenStaff, frozenLogs);
      assert.strictEqual(res.attendancePercentage, 100.0);
      assert.strictEqual(res.onDuty, 2);
    });
  });
});
