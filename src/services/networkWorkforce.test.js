import test from 'node:test';
import assert from 'node:assert';
import { findNearbyWorkforceCapacity } from './networkWorkforce.js';
import { WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from './workforceRisk.js';

test('Day 9 Step 6 - Network Workforce Intelligence', async (t) => {
  const targetDate = '2026-09-14';

  const mockPhcs = [
    { phc_id: 'phc-source', name: 'Source PHC', district_id: 'd1', district_name: 'Central', latitude: 12.9716, longitude: 77.5946 },
    { phc_id: 'phc-near-1', name: 'Near PHC 1', district_id: 'd1', district_name: 'Central', latitude: 12.9816, longitude: 77.6046 },
    { phc_id: 'phc-near-2', name: 'Near PHC 2', district_id: 'd1', district_name: 'Central', latitude: 13.0016, longitude: 77.6246 },
    { phc_id: 'phc-far', name: 'Far PHC', district_id: 'd2', district_name: 'North', latitude: 13.1516, longitude: 77.7046 }
  ];

  const staffHelper = (id, phcId, role = 'MEDICAL_OFFICER', status = 'ACTIVE') => ({
    staff_id: id, phc_id: phcId, role, status
  });

  const logHelper = (id, phcId, status = 'PRESENT', d = '2026-09-14') => ({
    attendance_id: 'att-' + id, staff_id: id, phc_id: phcId, date: d, status
  });

  await t.test('1. Nearest PHC integration uses geographical network distance', async () => {
    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: [],
      mockAttendance: []
    });

    assert.strictEqual(res.locationAvailable, true);
    assert.strictEqual(res.nearby.length, 3);
    assert.strictEqual(res.nearby[0].phc_id, 'phc-near-1');
  });

  await t.test('2. Distance ordering is strictly ascending', async () => {
    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs
    });

    for (let i = 0; i < res.nearby.length - 1; i++) {
      assert.ok(res.nearby[i].distance_km <= res.nearby[i + 1].distance_km);
    }
  });

  await t.test('3. Source PHC is excluded from nearby array', async () => {
    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs
    });

    const hasSource = res.nearby.some(p => p.phc_id === 'phc-source');
    assert.strictEqual(hasSource, false);
    assert.strictEqual(res.sourcePhcId, 'phc-source');
  });

  await t.test('4. Valid workforce data calculates accurate operational status for nearby PHCs', async () => {
    const staff = [
      staffHelper('s1', 'phc-near-1', 'MEDICAL_OFFICER'),
      staffHelper('s2', 'phc-near-1', 'NURSE'),
      staffHelper('s3', 'phc-near-2', 'MEDICAL_OFFICER'),
      staffHelper('s4', 'phc-near-2', 'NURSE')
    ];
    const logs = [
      // phc-near-1: 100% attendance -> ADEQUATE
      logHelper('s1', 'phc-near-1', 'PRESENT', targetDate),
      logHelper('s2', 'phc-near-1', 'PRESENT', targetDate),
      // phc-near-2: 50% attendance -> CRITICAL
      logHelper('s3', 'phc-near-2', 'PRESENT', targetDate),
      logHelper('s4', 'phc-near-2', 'ABSENT', targetDate)
    ];

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    const near1 = res.nearby.find(p => p.phc_id === 'phc-near-1');
    const near2 = res.nearby.find(p => p.phc_id === 'phc-near-2');

    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(near1.attendancePercentage, 100.0);
    assert.strictEqual(near1.dataStatus, 'AVAILABLE');

    assert.strictEqual(near2.workforceStatus, WORKFORCE_STATUS.CRITICAL);
    assert.strictEqual(near2.attendancePercentage, 50.0);
    assert.strictEqual(near2.dataStatus, 'AVAILABLE');
  });

  await t.test('5. Missing workforce data preserves PHC with INSUFFICIENT_DATA and DATA_UNAVAILABLE', async () => {
    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: [],
      mockAttendance: []
    });

    assert.strictEqual(res.sourceWorkforce.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.sourceWorkforce.dataStatus, 'INSUFFICIENT_DATA');

    for (const nearby of res.nearby) {
      assert.strictEqual(nearby.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
      assert.strictEqual(nearby.attendancePercentage, null);
      assert.notStrictEqual(nearby.workforceStatus, WORKFORCE_STATUS.ADEQUATE);
      assert.notStrictEqual(nearby.workforceStatus, WORKFORCE_STATUS.CRITICAL);
    }
  });

  await t.test('6. Incomplete attendance marks nearby PHC as INCOMPLETE_DATA and does NOT invent ABSENT', async () => {
    const staff = [
      staffHelper('s1', 'phc-near-1', 'MEDICAL_OFFICER'),
      staffHelper('s2', 'phc-near-1', 'NURSE')
    ];
    // Only s1 has log, s2 is unrecorded
    const logs = [logHelper('s1', 'phc-near-1', 'PRESENT', targetDate)];

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    const near1 = res.nearby.find(p => p.phc_id === 'phc-near-1');
    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(near1.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(near1.unrecorded, 1);
    assert.strictEqual(near1.absent, 0);
    assert.strictEqual(near1.attendancePercentage, null);
  });

  await t.test('7. Invalid workforce data (duplicate logs) marks nearby PHC as INVALID_DATA', async () => {
    const staff = [staffHelper('s1', 'phc-near-1')];
    const logs = [
      logHelper('s1', 'phc-near-1', 'PRESENT', targetDate),
      logHelper('s1', 'phc-near-1', 'LATE', targetDate)
    ];

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    const near1 = res.nearby.find(p => p.phc_id === 'phc-near-1');
    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(near1.dataStatus, 'INVALID_DATA');
  });

  await t.test('8. Mixed valid/invalid nearby PHCs correctly report individual statuses', async () => {
    const staff = [
      staffHelper('s1', 'phc-near-1', 'MEDICAL_OFFICER'),
      staffHelper('s2', 'phc-near-1', 'NURSE')
    ];
    const logs = [
      logHelper('s1', 'phc-near-1', 'PRESENT', targetDate),
      logHelper('s2', 'phc-near-1', 'PRESENT', targetDate)
    ];
    // phc-near-1 has valid complete data; phc-near-2 and phc-far have no data

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    const near1 = res.nearby.find(p => p.phc_id === 'phc-near-1');
    const near2 = res.nearby.find(p => p.phc_id === 'phc-near-2');

    assert.strictEqual(near1.dataStatus, 'AVAILABLE');
    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.ADEQUATE);

    assert.strictEqual(near2.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(near2.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
  });

  await t.test('9. PHC switching re-centers the network calculation', async () => {
    const resFromFar = await findNearbyWorkforceCapacity('phc-far', {
      targetDate,
      mockPhcs
    });

    assert.strictEqual(resFromFar.sourcePhcId, 'phc-far');
    assert.strictEqual(resFromFar.nearby.some(p => p.phc_id === 'phc-far'), false);
    // Nearest to phc-far is phc-near-2
    assert.strictEqual(resFromFar.nearby[0].phc_id, 'phc-near-2');
  });

  await t.test('10. Role-level display and disclaimer metadata are exposed', async () => {
    const staff = [
      staffHelper('s1', 'phc-near-1', 'MEDICAL_OFFICER'),
      staffHelper('s2', 'phc-near-1', 'NURSE'),
      staffHelper('s3', 'phc-near-1', 'PHARMACIST')
    ];
    const logs = [
      logHelper('s1', 'phc-near-1', 'PRESENT', targetDate),
      logHelper('s2', 'phc-near-1', 'PRESENT', targetDate),
      logHelper('s3', 'phc-near-1', 'PRESENT', targetDate)
    ];

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    const near1 = res.nearby.find(p => p.phc_id === 'phc-near-1');
    assert.strictEqual(near1.roles.MEDICAL_OFFICER.present, 1);
    assert.strictEqual(near1.roles.NURSE.present, 1);
    assert.strictEqual(near1.roles.PHARMACIST.present, 1);
    assert.strictEqual(res.roleRiskNote, ROLE_RISK_NOTE);
    assert.strictEqual(res.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
  });

  await t.test('11. No automatic staff reassignment or transfer mutation occurs', async () => {
    const staff = [staffHelper('s1', 'phc-near-1')];
    const logs = [logHelper('s1', 'phc-near-1', 'PRESENT', targetDate)];

    const res = await findNearbyWorkforceCapacity('phc-source', {
      targetDate,
      mockPhcs,
      mockStaff: staff,
      mockAttendance: logs
    });

    // Ensure source staff roster is unmodified
    assert.strictEqual(staff[0].phc_id, 'phc-near-1');
    assert.strictEqual(res.sourceWorkforce.totalAssigned, 0);
  });

  await t.test('12. Missing source PHC returns safe empty payload without crashing', async () => {
    const res = await findNearbyWorkforceCapacity(null);
    assert.strictEqual(res.sourcePhcId, null);
    assert.strictEqual(res.sourceWorkforce.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(res.nearby.length, 0);
  });
});
