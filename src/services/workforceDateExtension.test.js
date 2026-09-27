import test from 'node:test';
import assert from 'node:assert';
import {
  generatePrototypeWorkforce,
  generateDeterministicAttendanceExtension,
  ALLOWED_ATTENDANCE_STATUSES
} from './workforceData.js';
import { getWorkforceRisk, WORKFORCE_STATUS } from './workforceRisk.js';

test('Day 18 Step 2B — Workforce Attendance Date Extension Safety Suite', async (t) => {
  const mock28Phcs = [
    { phc_id: 'phc-achrol', name: 'PHC Achrol' },
    { phc_id: 'phc-adalaj', name: 'PHC Adalaj' },
    { phc_id: 'phc-alipore', name: 'PHC Alipore' },
    { phc_id: 'phc-barabanki-rural', name: 'PHC Barabanki Rural' },
    { phc_id: 'phc-bhankrota', name: 'PHC Bhankrota' },
    { phc_id: 'phc-boraj', name: 'PHC Boraj' },
    { phc_id: 'phc-borsar', name: 'PHC Borsar' },
    { phc_id: 'phc-chinhat', name: 'PHC Chinhat' },
    { phc_id: 'phc-gadat', name: 'PHC Gadat' },
    { phc_id: 'phc-hond', name: 'PHC Hond' },
    { phc_id: 'phc-jamsar', name: 'PHC Jamsar' },
    { phc_id: 'phc-kakori', name: 'PHC Kakori' },
    { phc_id: 'phc-kaman', name: 'PHC Kaman' },
    { phc_id: 'phc-kevdra', name: 'PHC Kevdra' },
    { phc_id: 'phc-koth', name: 'PHC Koth' },
    { phc_id: 'phc-koyali', name: 'PHC Koyali' },
    { phc_id: 'phc-kuha', name: 'PHC Kuha' },
    { phc_id: 'phc-kumathe', name: 'PHC Kumathe' },
    { phc_id: 'phc-malihabad', name: 'PHC Malihabad' },
    { phc_id: 'phc-mandore', name: 'PHC Mandore' },
    { phc_id: 'phc-mohanlalganj', name: 'PHC Mohanlalganj' },
    { phc_id: 'phc-mojidad', name: 'PHC Mojidad' },
    { phc_id: 'phc-mokhasan', name: 'PHC Mokhasan' },
    { phc_id: 'phc-nakra', name: 'PHC Nakra' },
    { phc_id: 'phc-netra', name: 'PHC Netra' },
    { phc_id: 'phc-nimgaon', name: 'PHC Nimgaon' },
    { phc_id: 'phc-sanathal', name: 'PHC Sanathal' },
    { phc_id: 'phc-vataman', name: 'PHC Vataman' }
  ];

  const base = generatePrototypeWorkforce(mock28Phcs, '2026-09-14');
  const staff = base.staff;
  const existing20260914 = base.staffAttendance;

  const newDates = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
  const candidates = generateDeterministicAttendanceExtension(staff, newDates);

  await t.test('1. Baseline 2026-09-14 records are intact (exactly 210 records across 28 PHCs)', () => {
    assert.strictEqual(existing20260914.length, 210);
    assert.strictEqual(staff.length, 210);
    const phcCount = new Set(existing20260914.map(a => a.phc_id)).size;
    assert.strictEqual(phcCount, 28);
  });

  await t.test('2. Candidate count is exactly 1,260 (210 active staff x 6 new dates)', () => {
    assert.strictEqual(candidates.length, 1260);
  });

  await t.test('3. Exactly 210 records per new date with 28/28 PHC coverage', () => {
    for (const d of newDates) {
      const dateRecords = candidates.filter(c => c.date === d);
      assert.strictEqual(dateRecords.length, 210, `Expected 210 records for date ${d}`);
      const phcs = new Set(dateRecords.map(c => c.phc_id));
      assert.strictEqual(phcs.size, 28, `Expected 28 PHCs for date ${d}`);
    }
  });

  await t.test('4. Zero duplicate staff/date combinations and zero overlap with baseline', () => {
    const keySet = new Set(existing20260914.map(a => `${a.staff_id}_${a.date}`));
    assert.strictEqual(keySet.size, 210);

    for (const c of candidates) {
      const key = `${c.staff_id}_${c.date}`;
      assert.ok(!keySet.has(key), `Duplicate detected for ${key}`);
      keySet.add(key);
    }
    assert.strictEqual(keySet.size, 1470);
  });

  await t.test('5. Zero orphan attendance records and PHC ID matches staff assignment', () => {
    const staffPhcMap = new Map(staff.map(s => [s.staff_id, s.phc_id]));
    for (const c of candidates) {
      assert.ok(staffPhcMap.has(c.staff_id), `Orphan staff ID: ${c.staff_id}`);
      assert.strictEqual(c.phc_id, staffPhcMap.get(c.staff_id), `PHC mismatch for staff ${c.staff_id}`);
    }
  });

  await t.test('6. Valid status enum and check-in/check-out timestamp semantics', () => {
    for (const c of candidates) {
      assert.ok(ALLOWED_ATTENDANCE_STATUSES.includes(c.status), `Invalid status: ${c.status}`);
      if (c.status === 'PRESENT' || c.status === 'LATE') {
        assert.ok(c.check_in !== null);
        assert.ok(c.check_out !== null);
        assert.ok(new Date(c.check_out) > new Date(c.check_in));
      } else {
        assert.strictEqual(c.check_in, null);
        assert.strictEqual(c.check_out, null);
      }
    }
  });

  await t.test('7. Complete provenance tags on all candidate records', () => {
    for (const c of candidates) {
      assert.strictEqual(c.datasetType, 'CONSTRUCTED_PROTOTYPE');
      assert.strictEqual(c.is_constructed_prototype, true);
      assert.strictEqual(c.data_provenance, 'CONSTRUCTED_PROTOTYPE');
      assert.ok(typeof c.provenance_note === 'string' && c.provenance_note.length > 10);
    }
  });

  await t.test('8. Deterministic generator idempotency (repeated runs produce identical candidates)', () => {
    const run1 = generateDeterministicAttendanceExtension(staff, newDates);
    const run2 = generateDeterministicAttendanceExtension(staff, newDates);
    assert.deepStrictEqual(run1, run2);
  });

  await t.test('9. Generated attendance enables valid getWorkforceRisk() across all 7 dates', () => {
    const combinedAttendance = [...existing20260914, ...candidates];
    const allDates = ['2026-09-14', ...newDates];

    for (const phc of mock28Phcs) {
      for (const d of allDates) {
        const risk = getWorkforceRisk(phc.phc_id, d, staff, combinedAttendance);
        assert.notStrictEqual(
          risk.status,
          WORKFORCE_STATUS.INSUFFICIENT_DATA,
          `Expected valid workforce risk for ${phc.phc_id} on ${d}, got ${risk.status} (${risk.reason})`
        );
        assert.strictEqual(typeof risk.attendancePercentage, 'number');
        assert.ok(risk.attendancePercentage >= 0 && risk.attendancePercentage <= 100);
      }
    }
  });
});
