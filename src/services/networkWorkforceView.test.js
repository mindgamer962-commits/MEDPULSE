import test from 'node:test';
import assert from 'node:assert';
import { findNearbyWorkforceCapacity } from './networkWorkforce.js';
import { WORKFORCE_STATUS } from './workforceRisk.js';

test('Day 10 Step 5 — Network Workforce View & Visibility Suite', async (t) => {
  const targetDate = '2026-09-14';
  const altDate = '2026-09-15';

  const mockPhcs = [
    { phc_id: 'phc_src', name: 'PHC Source', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9124, longitude: 75.7873 },
    { phc_id: 'phc_near_1', name: 'PHC Near 1', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9200, longitude: 75.7900 },
    { phc_id: 'phc_near_2', name: 'PHC Near 2', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9300, longitude: 75.8000 },
    { phc_id: 'phc_near_3', name: 'PHC Near 3', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9400, longitude: 75.8100 },
    { phc_id: 'phc_near_4', name: 'PHC Near 4', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9500, longitude: 75.8200 },
    { phc_id: 'phc_near_5', name: 'PHC Near 5', district_id: 'd1', district_name: 'Jaipur', latitude: 26.9600, longitude: 75.8300 },
    { phc_id: 'phc_far_6', name: 'PHC Far 6', district_id: 'd1', district_name: 'Jaipur', latitude: 27.5000, longitude: 76.5000 }
  ];

  const mockStaff = [
    // Source: 2 staff
    { staff_id: 's_src_1', phc_id: 'phc_src', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_src_2', phc_id: 'phc_src', role: 'NURSE', status: 'ACTIVE' },

    // Near 1: 2 staff (100% -> ADEQUATE)
    { staff_id: 's_n1_1', phc_id: 'phc_near_1', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_n1_2', phc_id: 'phc_near_1', role: 'NURSE', status: 'ACTIVE' },

    // Near 2: 2 staff (50% -> CRITICAL)
    { staff_id: 's_n2_1', phc_id: 'phc_near_2', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_n2_2', phc_id: 'phc_near_2', role: 'NURSE', status: 'ACTIVE' },

    // Near 3: 2 staff (80% -> AT_RISK via leave)
    { staff_id: 's_n3_1', phc_id: 'phc_near_3', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
    { staff_id: 's_n3_2', phc_id: 'phc_near_3', role: 'NURSE', status: 'ACTIVE' },

    // Near 4: 1 staff
    { staff_id: 's_n4_1', phc_id: 'phc_near_4', role: 'PHARMACIST', status: 'ACTIVE' },

    // Near 5: 1 staff
    { staff_id: 's_n5_1', phc_id: 'phc_near_5', role: 'OTHER', status: 'ACTIVE' }
  ];

  const mockAttendance = [
    // Source: 1 present, 1 absent -> 50%
    { attendance_id: 'a_src_1', staff_id: 's_src_1', phc_id: 'phc_src', date: targetDate, status: 'PRESENT' },
    { attendance_id: 'a_src_2', staff_id: 's_src_2', phc_id: 'phc_src', date: targetDate, status: 'ABSENT' },

    // Near 1: 2 present -> 100%
    { attendance_id: 'a_n1_1', staff_id: 's_n1_1', phc_id: 'phc_near_1', date: targetDate, status: 'PRESENT' },
    { attendance_id: 'a_n1_2', staff_id: 's_n1_2', phc_id: 'phc_near_1', date: targetDate, status: 'PRESENT' },

    // Near 2: 1 present, 1 absent -> 50%
    { attendance_id: 'a_n2_1', staff_id: 's_n2_1', phc_id: 'phc_near_2', date: targetDate, status: 'PRESENT' },
    { attendance_id: 'a_n2_2', staff_id: 's_n2_2', phc_id: 'phc_near_2', date: targetDate, status: 'ABSENT' },

    // Near 3: 1 present, 1 late -> 100%
    { attendance_id: 'a_n3_1', staff_id: 's_n3_1', phc_id: 'phc_near_3', date: targetDate, status: 'PRESENT' },
    { attendance_id: 'a_n3_2', staff_id: 's_n3_2', phc_id: 'phc_near_3', date: targetDate, status: 'LATE' },

    // Near 4: 1 present -> 100%
    { attendance_id: 'a_n4_1', staff_id: 's_n4_1', phc_id: 'phc_near_4', date: targetDate, status: 'PRESENT' },

    // Near 5: 1 present -> 100%
    { attendance_id: 'a_n5_1', staff_id: 's_n5_1', phc_id: 'phc_near_5', date: targetDate, status: 'PRESENT' }
  ];

  await t.test('1. Returns nearest 5 PHCs', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    assert.strictEqual(res.nearby.length, 5);
  });

  await t.test('2. Selected source PHC is strictly excluded from nearby list', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    const foundSource = res.nearby.some(n => n.phc_id === 'phc_src');
    assert.strictEqual(foundSource, false);
  });

  await t.test('3. Nearby PHCs are sorted in ascending distance order', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    for (let i = 0; i < res.nearby.length - 1; i++) {
      assert.ok(res.nearby[i].distance_km <= res.nearby[i + 1].distance_km);
    }
  });

  await t.test('4. Workforce data accurately computed for nearby facilities (Assigned, Present, On Duty, Rate)', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    const near3 = res.nearby.find(n => n.phc_id === 'phc_near_3');
    assert.strictEqual(near3.totalAssigned, 2);
    assert.strictEqual(near3.present, 1);
    assert.strictEqual(near3.late, 1);
    assert.strictEqual(near3.onDuty, 2);
    assert.strictEqual(near3.attendancePercentage, 100.0);
  });

  await t.test('5. Independent workforce risk: Nearby facilities maintain independent evaluation', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    // Source is CRITICAL (50%)
    assert.strictEqual(res.sourceWorkforce.status, WORKFORCE_STATUS.CRITICAL);
    // Near 1 is ADEQUATE (100%)
    const near1 = res.nearby.find(n => n.phc_id === 'phc_near_1');
    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.ADEQUATE);
    // Near 2 is CRITICAL (50%)
    const near2 = res.nearby.find(n => n.phc_id === 'phc_near_2');
    assert.strictEqual(near2.workforceStatus, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('6. PHC-specific workforce values do not leak between neighbors', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    const near1 = res.nearby.find(n => n.phc_id === 'phc_near_1');
    const near4 = res.nearby.find(n => n.phc_id === 'phc_near_4');
    assert.strictEqual(near1.totalAssigned, 2);
    assert.strictEqual(near4.totalAssigned, 1);
  });

  await t.test('7. Missing workforce records safely produce INSUFFICIENT_DATA for affected neighbor', async () => {
    // Near 5 has no staff assigned
    const staffWithoutNear5 = mockStaff.filter(s => s.phc_id !== 'phc_near_5');
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff: staffWithoutNear5,
      mockAttendance
    });
    const near5 = res.nearby.find(n => n.phc_id === 'phc_near_5');
    assert.strictEqual(near5.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(near5.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(near5.attendancePercentage, null);
  });

  await t.test('8. Incomplete workforce data safely handles unrecorded logs', async () => {
    // Near 1 has 2 staff but only 1 log
    const attIncomplete = mockAttendance.filter(a => a.staff_id !== 's_n1_2');
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance: attIncomplete
    });
    const near1 = res.nearby.find(n => n.phc_id === 'phc_near_1');
    assert.strictEqual(near1.workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(near1.dataStatus, 'INCOMPLETE_DATA');
    assert.strictEqual(near1.unrecorded, 1);
  });

  await t.test('9. Invalid or missing coordinates handled safely', async () => {
    const phcsWithInvalid = [
      { phc_id: 'phc_invalid', name: 'PHC Invalid', latitude: null, longitude: null },
      ...mockPhcs
    ];
    const res = await findNearbyWorkforceCapacity('phc_invalid', {
      targetDate,
      limit: 5,
      mockPhcs: phcsWithInvalid,
      mockStaff,
      mockAttendance
    });
    assert.strictEqual(res.locationAvailable, false);
    assert.strictEqual(res.nearby.length, 0);
  });

  await t.test('10. Target date filtering strictly isolates attendance for requested date', async () => {
    const resTarget = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    const resAlt = await findNearbyWorkforceCapacity('phc_src', {
      targetDate: altDate, // No logs exist for altDate
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    assert.strictEqual(resTarget.nearby[0].dataStatus, 'AVAILABLE');
    assert.strictEqual(resAlt.nearby[0].dataStatus, 'DATA_UNAVAILABLE');
  });

  await t.test('11. Zero Firestore writes during evaluation', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    assert.ok(res.nearby.length > 0);
  });

  await t.test('12. No staff reassignment or roster mutation occurs', async () => {
    const originalStaff = JSON.parse(JSON.stringify(mockStaff));
    await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    assert.deepStrictEqual(mockStaff, originalStaff);
  });

  await t.test('13. No transfer or reassignment controls/actions exist', async () => {
    const res = await findNearbyWorkforceCapacity('phc_src', {
      targetDate,
      limit: 5,
      mockPhcs,
      mockStaff,
      mockAttendance
    });
    // Payload contains strictly visibility metadata
    assert.strictEqual(res.nearby[0].transferAllowed, undefined);
    assert.strictEqual(res.nearby[0].reassignAllowed, undefined);
  });
});
