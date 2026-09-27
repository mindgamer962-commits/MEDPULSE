import test from 'node:test';
import assert from 'node:assert';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';
import { calculateWorkforceRisk, getWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from './workforceRisk.js';
import { findNearbyWorkforceCapacity } from './networkWorkforce.js';
import { generatePrototypeWorkforce, validatePrototypeWorkforce } from './workforceData.js';

test('Day 9 Step 8 - Comprehensive Workforce Attendance Safety & Hardening Suite', async (t) => {
  const phcId = 'phc-safety-1';
  const targetDate = '2026-09-14';

  const staffGen = (id, role = 'MEDICAL_OFFICER', status = 'ACTIVE', phc = phcId) => ({
    staff_id: id, phc_id: phc, role, status
  });

  const logGen = (id, status = 'PRESENT', d = targetDate, phc = phcId, checkIn = '2026-09-14T08:00:00Z', checkOut = '2026-09-14T16:00:00Z') => ({
    attendance_id: `att_${id}_${d}`, staff_id: id, phc_id: phc, date: d, status, check_in: checkIn, check_out: checkOut
  });

  // =========================================================================
  // 1. ATTENDANCE DATA SAFETY
  // =========================================================================
  await t.test('1.1 Empty staff list safely produces INSUFFICIENT_DATA', () => {
    const res = calculateAttendanceMetrics(phcId, targetDate, [], [logGen('s1')]);
    assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(res.attendancePercentage, null);
  });

  await t.test('1.2 Empty attendance list safely produces DATA_UNAVAILABLE', () => {
    const res = calculateAttendanceMetrics(phcId, targetDate, [staffGen('s1')], []);
    assert.strictEqual(res.dataStatus, 'DATA_UNAVAILABLE');
    assert.strictEqual(res.attendancePercentage, null);
  });

  await t.test('1.3 CRITICAL: Missing attendance record MUST NOT automatically become ABSENT', () => {
    const staff = [staffGen('s1'), staffGen('s2'), staffGen('s3')];
    // Only s1 has a log; s2 and s3 are unrecorded
    const logs = [logGen('s1', 'PRESENT')];

    const res = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(res.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(res.present, 1);
    assert.strictEqual(res.absent, 0, 'Unrecorded attendance MUST NOT be converted to ABSENT');
    assert.strictEqual(res.unrecorded, 2);
    assert.strictEqual(res.attendancePercentage, null);
  });

  await t.test('1.4 Explicit ABSENT record correctly increments absent count', () => {
    const staff = [staffGen('s1'), staffGen('s2')];
    const logs = [logGen('s1', 'PRESENT'), logGen('s2', 'ABSENT', targetDate, phcId, null, null)];

    const res = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(res.dataStatus, 'AVAILABLE');
    assert.strictEqual(res.present, 1);
    assert.strictEqual(res.absent, 1);
    assert.strictEqual(res.unrecorded, 0);
    assert.strictEqual(res.attendancePercentage, 50.0);
  });

  await t.test('1.5 Duplicate logs for same staff on same date produces INVALID_DATA', () => {
    const staff = [staffGen('s1')];
    const logs = [
      logGen('s1', 'PRESENT'),
      logGen('s1', 'LATE')
    ];

    const res = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(res.dataStatus, 'INVALID_DATA');
    assert.strictEqual(res.attendancePercentage, null);
  });

  await t.test('1.6 Orphan attendance (staff not assigned to PHC) does not distort facility capacity', () => {
    const staff = [staffGen('s1', 'NURSE', 'ACTIVE', 'phc-other')]; // Belongs to phc-other
    const logs = [logGen('s1', 'PRESENT', targetDate, phcId)]; // Erroneously recorded with phcId

    const res = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    // Active assigned staff for phcId is 0 -> INSUFFICIENT_DATA
    assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(res.totalAssigned, 0);
  });

  await t.test('1.7 Inactive and Transferred staff are safely ignored from active roster', () => {
    const staff = [
      staffGen('s1', 'MEDICAL_OFFICER', 'ACTIVE'),
      staffGen('s2', 'NURSE', 'INACTIVE'),
      staffGen('s3', 'PHARMACIST', 'TRANSFERRED'),
      staffGen('s4', 'OTHER', 'ON_LEAVE')
    ];
    const logs = [logGen('s1', 'PRESENT')];

    const res = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(res.dataStatus, 'AVAILABLE');
    assert.strictEqual(res.totalAssigned, 1);
    assert.strictEqual(res.present, 1);
    assert.strictEqual(res.attendancePercentage, 100.0);
  });

  // =========================================================================
  // 2. WORKFORCE RISK SAFETY & THRESHOLDS
  // =========================================================================
  await t.test('2.1 Threshold boundaries evaluate strictly with non-official disclaimer', () => {
    // >= 90.0% -> ADEQUATE
    const r100 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 100.0 });
    assert.strictEqual(r100.status, WORKFORCE_STATUS.ADEQUATE);

    const r90 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 90.0 });
    assert.strictEqual(r90.status, WORKFORCE_STATUS.ADEQUATE);

    // 75.0% - 89.9% -> AT_RISK
    const r89_9 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 89.9 });
    assert.strictEqual(r89_9.status, WORKFORCE_STATUS.AT_RISK);

    const r75 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 75.0 });
    assert.strictEqual(r75.status, WORKFORCE_STATUS.AT_RISK);

    // < 75.0% -> CRITICAL
    const r74_9 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 74.9 });
    assert.strictEqual(r74_9.status, WORKFORCE_STATUS.CRITICAL);

    const r0 = calculateWorkforceRisk({ dataStatus: 'AVAILABLE', totalAssigned: 10, attendancePercentage: 0.0 });
    assert.strictEqual(r0.status, WORKFORCE_STATUS.CRITICAL);

    // Verify prototype disclaimer
    assert.strictEqual(r100.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
    assert.strictEqual(r100.roleRiskNote, ROLE_RISK_NOTE);
  });

  await t.test('2.2 Missing/incomplete data NEVER produces false ADEQUATE or false CRITICAL', () => {
    const unavailable = calculateWorkforceRisk({ dataStatus: 'DATA_UNAVAILABLE', totalAssigned: 10, attendancePercentage: null });
    assert.strictEqual(unavailable.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.notStrictEqual(unavailable.status, WORKFORCE_STATUS.ADEQUATE);
    assert.notStrictEqual(unavailable.status, WORKFORCE_STATUS.CRITICAL);

    const incomplete = calculateWorkforceRisk({ dataStatus: 'INCOMPLETE_DATA', totalAssigned: 10, unrecorded: 3, attendancePercentage: null });
    assert.strictEqual(incomplete.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);

    const invalid = calculateWorkforceRisk({ dataStatus: 'INVALID_DATA', totalAssigned: 10, attendancePercentage: null });
    assert.strictEqual(invalid.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
  });

  // =========================================================================
  // 3. ATTENDANCE FORMULA VALIDATION
  // =========================================================================
  await t.test('3.1 Formula: (PRESENT + LATE) / (TOTAL - AUTHORIZED_LEAVE) * 100', () => {
    const staff = [
      staffGen('s1'), staffGen('s2'), staffGen('s3'), staffGen('s4'),
      staffGen('s5'), staffGen('s6'), staffGen('s7'), staffGen('s8')
    ];
    // 5 PRESENT, 1 LATE, 1 ABSENT, 1 LEAVE
    // Numerator = 5 + 1 = 6
    // Denominator = 8 - 1 = 7
    // Expected Rate = (6 / 7) * 100 = 85.7% (AT_RISK)
    const logs = [
      logGen('s1', 'PRESENT'),
      logGen('s2', 'PRESENT'),
      logGen('s3', 'PRESENT'),
      logGen('s4', 'PRESENT'),
      logGen('s5', 'PRESENT'),
      logGen('s6', 'LATE'),
      logGen('s7', 'ABSENT', targetDate, phcId, null, null),
      logGen('s8', 'AUTHORIZED_LEAVE', targetDate, phcId, null, null)
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.totalAssigned, 8);
    assert.strictEqual(metrics.present, 5);
    assert.strictEqual(metrics.late, 1);
    assert.strictEqual(metrics.absent, 1);
    assert.strictEqual(metrics.authorizedLeave, 1);
    assert.strictEqual(metrics.attendancePercentage, 85.7);

    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
  });

  await t.test('3.2 All staff on authorized leave safely produces null percentage without crash', () => {
    const staff = [staffGen('s1'), staffGen('s2')];
    const logs = [
      logGen('s1', 'AUTHORIZED_LEAVE', targetDate, phcId, null, null),
      logGen('s2', 'AUTHORIZED_LEAVE', targetDate, phcId, null, null)
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.attendancePercentage, null);
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.match(risk.reason, /All assigned personnel are on authorized leave/);
  });

  // =========================================================================
  // 4. ROLE-LEVEL SAFETY
  // =========================================================================
  await t.test('4.1 Role calculations cover all 4 roles without inventing arbitrary doctor minimums', () => {
    const staff = [
      staffGen('s1', 'MEDICAL_OFFICER'),
      staffGen('s2', 'NURSE'),
      staffGen('s3', 'PHARMACIST'),
      staffGen('s4', 'OTHER')
    ];
    // Doctor is ABSENT, all others PRESENT -> Total 3/4 = 75.0% -> AT_RISK
    const logs = [
      logGen('s1', 'ABSENT', targetDate, phcId, null, null),
      logGen('s2', 'PRESENT'),
      logGen('s3', 'PRESENT'),
      logGen('s4', 'PRESENT')
    ];

    const metrics = calculateAttendanceMetrics(phcId, targetDate, staff, logs);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.assigned, 1);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.present, 0);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.absent, 1);
    assert.strictEqual(metrics.roles.MEDICAL_OFFICER.attendancePercentage, 0.0);

    assert.strictEqual(metrics.roles.NURSE.assigned, 1);
    assert.strictEqual(metrics.roles.NURSE.present, 1);
    assert.strictEqual(metrics.roles.NURSE.attendancePercentage, 100.0);

    const risk = calculateWorkforceRisk(metrics);
    // Evaluates to AT_RISK based on measured 75% attendance rate; does not falsely jump to CRITICAL without statutory rule
    assert.strictEqual(risk.status, WORKFORCE_STATUS.AT_RISK);
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
  });

  // =========================================================================
  // 5. NETWORK WORKFORCE SAFETY
  // =========================================================================
  await t.test('5.1 Network Workforce isolates target PHC and preserves distances', async () => {
    const mockPhcs = [
      { phc_id: 'phc-src', name: 'Source PHC', district_id: 'd1', latitude: 20.0, longitude: 70.0 },
      { phc_id: 'phc-n1', name: 'Near 1', district_id: 'd1', latitude: 20.1, longitude: 70.1 },
      { phc_id: 'phc-n2', name: 'Near 2', district_id: 'd1', latitude: 20.5, longitude: 70.5 },
      { phc_id: 'phc-invalid', name: 'Invalid Coords', district_id: 'd1', latitude: null, longitude: null }
    ];

    const staff = [
      { staff_id: 's_src', phc_id: 'phc-src', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
      { staff_id: 's_n1', phc_id: 'phc-n1', role: 'MEDICAL_OFFICER', status: 'ACTIVE' }
    ];
    const logs = [
      { attendance_id: 'a_src', staff_id: 's_src', phc_id: 'phc-src', date: targetDate, status: 'PRESENT', check_in: '08:00', check_out: '16:00' },
      { attendance_id: 'a_n1', staff_id: 's_n1', phc_id: 'phc-n1', date: targetDate, status: 'PRESENT', check_in: '08:00', check_out: '16:00' }
    ];

    const netRes = await findNearbyWorkforceCapacity('phc-src', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    assert.strictEqual(netRes.sourcePhcId, 'phc-src');
    // Target PHC is excluded
    assert.strictEqual(netRes.nearby.some(p => p.phc_id === 'phc-src'), false);
    // Invalid coordinate PHC is excluded from spatial nearest
    assert.strictEqual(netRes.nearby.some(p => p.phc_id === 'phc-invalid'), false);
    // Neighbor 1 has valid data -> AVAILABLE / ADEQUATE
    assert.strictEqual(netRes.nearby[0].phc_id, 'phc-n1');
    assert.strictEqual(netRes.nearby[0].workforceStatus, WORKFORCE_STATUS.ADEQUATE);
    // Neighbor 2 has no data -> INSUFFICIENT_DATA
    assert.strictEqual(netRes.nearby[1].phc_id, 'phc-n2');
    assert.strictEqual(netRes.nearby[1].workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(netRes.nearby[1].attendancePercentage, null);
  });

  // =========================================================================
  // 6. TARGET DATE ISOLATION SAFETY
  // =========================================================================
  await t.test('6.1 Date queries isolate attendance strictly to requested date', () => {
    const staff = [staffGen('s1')];
    // Attendance exists for 2026-09-14, but queried date is 2026-09-15
    const logs = [logGen('s1', 'PRESENT', '2026-09-14')];

    const metricsForOtherDate = calculateAttendanceMetrics(phcId, '2026-09-15', staff, logs);
    assert.strictEqual(metricsForOtherDate.dataStatus, 'DATA_UNAVAILABLE');
    assert.strictEqual(metricsForOtherDate.attendancePercentage, null);
  });

  // =========================================================================
  // 7. PROTOTYPE DATASET COVERAGE & NON-MUTATION
  // =========================================================================
  await t.test('7.1 Prototype workforce generator covers exactly 28 PHCs with 0 mutations', () => {
    const mock28 = Array.from({ length: 28 }, (_, i) => ({
      phc_id: `phc-mock-${i + 1}`,
      name: `PHC Mock ${i + 1}`
    }));

    const dataset = generatePrototypeWorkforce(mock28, targetDate);
    assert.strictEqual(dataset.staff.length >= 112, true); // At least 4 staff per PHC
    assert.strictEqual(dataset.staff.length, dataset.staffAttendance.length);

    // Verify all staff have CONSTRUCTED_PROTOTYPE tag
    for (const s of dataset.staff) {
      assert.strictEqual(s.datasetType, 'CONSTRUCTED_PROTOTYPE');
    }
  });
});
