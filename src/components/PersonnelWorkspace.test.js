import test from 'node:test';
import assert from 'node:assert';
import { calculateWorkforceRisk, getWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from '../services/workforceRisk.js';
import { findNearbyWorkforceCapacity } from '../services/networkWorkforce.js';

test('Day 9 Step 7 - Personnel & Workforce UI Logic Integration', async (t) => {
  const mockPhcs = [
    { phc_id: 'phc-1', name: 'PHC Alpha', district_id: 'd1', district_name: 'Central', latitude: 12.9716, longitude: 77.5946 },
    { phc_id: 'phc-2', name: 'PHC Beta', district_id: 'd1', district_name: 'Central', latitude: 12.9816, longitude: 77.6046 }
  ];
  const targetDate = '2026-09-14';

  await t.test('1. Default unlinked state produces DATA_UNAVAILABLE / INSUFFICIENT_DATA and never 0%', () => {
    // When no authoritative feed is connected (empty staff & attendance)
    const risk = getWorkforceRisk('phc-1', targetDate, [], []);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(risk.dataStatus, 'INSUFFICIENT_DATA');
    assert.strictEqual(risk.attendancePercentage, null);
    assert.notStrictEqual(risk.attendancePercentage, 0);
    assert.notStrictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.notStrictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
    assert.match(risk.reason, /no active staff are assigned/);
  });

  await t.test('2. Provenance note and threshold disclaimer are strictly preserved', () => {
    const risk = calculateWorkforceRisk(null);
    assert.strictEqual(risk.thresholds.disclaimer, WORKFORCE_THRESHOLDS.DISCLAIMER);
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
  });

  await t.test('3. PHC selection switching re-evaluates workforce state deterministically', async () => {
    const resPhc1 = await findNearbyWorkforceCapacity('phc-1', {
      targetDate,
      mockPhcs,
      mockStaff: [],
      mockAttendance: []
    });
    const resPhc2 = await findNearbyWorkforceCapacity('phc-2', {
      targetDate,
      mockPhcs,
      mockStaff: [],
      mockAttendance: []
    });

    assert.strictEqual(resPhc1.sourcePhcId, 'phc-1');
    assert.strictEqual(resPhc2.sourcePhcId, 'phc-2');
    assert.strictEqual(resPhc1.nearby[0].phc_id, 'phc-2');
    assert.strictEqual(resPhc2.nearby[0].phc_id, 'phc-1');
  });

  await t.test('4. Role breakdown exposes 4 canonical roles without inventing doctor surplus', () => {
    const staff = [
      { staff_id: 's1', phc_id: 'phc-1', role: 'MEDICAL_OFFICER', status: 'ACTIVE' },
      { staff_id: 's2', phc_id: 'phc-1', role: 'NURSE', status: 'ACTIVE' },
      { staff_id: 's3', phc_id: 'phc-1', role: 'PHARMACIST', status: 'ACTIVE' },
      { staff_id: 's4', phc_id: 'phc-1', role: 'OTHER', status: 'ACTIVE' }
    ];
    const logs = [
      { attendance_id: 'a1', staff_id: 's1', phc_id: 'phc-1', date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a2', staff_id: 's2', phc_id: 'phc-1', date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a3', staff_id: 's3', phc_id: 'phc-1', date: targetDate, status: 'PRESENT' },
      { attendance_id: 'a4', staff_id: 's4', phc_id: 'phc-1', date: targetDate, status: 'PRESENT' }
    ];

    const risk = getWorkforceRisk('phc-1', targetDate, staff, logs);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(risk.attendancePercentage, 100.0);
    assert.strictEqual(risk.roles.MEDICAL_OFFICER.assigned, 1);
    assert.strictEqual(risk.roles.NURSE.assigned, 1);
    assert.strictEqual(risk.roles.PHARMACIST.assigned, 1);
    assert.strictEqual(risk.roles.OTHER.assigned, 1);
    // Role limitation note is present
    assert.strictEqual(risk.roleRiskNote, ROLE_RISK_NOTE);
  });

  await t.test('5. Nearby workforce intelligence preserves unlinked status for all neighbors', async () => {
    const netRes = await findNearbyWorkforceCapacity('phc-1', {
      targetDate,
      mockPhcs,
      mockStaff: [],
      mockAttendance: []
    });

    assert.strictEqual(netRes.nearby.length, 1);
    assert.strictEqual(netRes.nearby[0].workforceStatus, WORKFORCE_STATUS.INSUFFICIENT_DATA);
    assert.strictEqual(netRes.nearby[0].attendancePercentage, null);
    assert.strictEqual(netRes.nearby[0].dataStatus, 'INSUFFICIENT_DATA');
    assert.notStrictEqual(netRes.nearby[0].workforceStatus, WORKFORCE_STATUS.ADEQUATE);
  });

  await t.test('6. Zero mutations or automated reassignments', () => {
    const staff = [{ staff_id: 's1', phc_id: 'phc-2', role: 'NURSE', status: 'ACTIVE' }];
    const risk = getWorkforceRisk('phc-1', targetDate, staff, []);
    // Ensure s1 was not reassigned to phc-1
    assert.strictEqual(staff[0].phc_id, 'phc-2');
    assert.strictEqual(risk.metrics.totalAssigned, 0);
  });
});
