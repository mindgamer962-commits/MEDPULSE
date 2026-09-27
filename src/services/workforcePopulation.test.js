import test from 'node:test';
import assert from 'node:assert';
import {
  generatePrototypeWorkforce,
  validatePrototypeWorkforce,
  ALLOWED_ROLES,
  ALLOWED_STAFF_STATUSES,
  ALLOWED_ATTENDANCE_STATUSES,
  WORKFORCE_DATASET_METADATA
} from './workforceData.js';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';
import { calculateWorkforceRisk, WORKFORCE_STATUS } from './workforceRisk.js';
import { findNearbyWorkforceCapacity } from './networkWorkforce.js';

test('Day 9 Step 7C - Constructed Prototype Workforce Data Tests', async (t) => {
  const mock28Phcs = [
    { phc_id: 'phc-achrol', name: 'PHC Achrol', district_id: 'd1', latitude: 27.14, longitude: 75.95 },
    { phc_id: 'phc-adalaj', name: 'PHC Adalaj', district_id: 'd2', latitude: 23.16, longitude: 72.58 },
    { phc_id: 'phc-alipore', name: 'PHC Alipore', district_id: 'd3', latitude: 20.76, longitude: 72.98 },
    { phc_id: 'phc-barabanki-rural', name: 'PHC Barabanki Rural', district_id: 'd4', latitude: 26.92, longitude: 81.18 },
    { phc_id: 'phc-bhankrota', name: 'PHC Bhankrota', district_id: 'd1', latitude: 26.86, longitude: 75.69 },
    { phc_id: 'phc-boraj', name: 'PHC Boraj', district_id: 'd1', latitude: 26.90, longitude: 75.47 },
    { phc_id: 'phc-borsar', name: 'PHC Borsar', district_id: 'd5', latitude: 19.98, longitude: 75.25 },
    { phc_id: 'phc-chinhat', name: 'PHC Chinhat', district_id: 'd6', latitude: 26.88, longitude: 81.01 },
    { phc_id: 'phc-gadat', name: 'PHC Gadat', district_id: 'd3', latitude: 20.85, longitude: 73.01 },
    { phc_id: 'phc-hond', name: 'PHC Hond', district_id: 'd3', latitude: 20.91, longitude: 73.05 },
    { phc_id: 'phc-jamsar', name: 'PHC Jamsar', district_id: 'd7', latitude: 19.85, longitude: 73.02 },
    { phc_id: 'phc-kakori', name: 'PHC Kakori', district_id: 'd6', latitude: 26.87, longitude: 80.79 },
    { phc_id: 'phc-kaman', name: 'PHC Kaman', district_id: 'd7', latitude: 19.35, longitude: 72.91 },
    { phc_id: 'phc-kevdra', name: 'PHC Kevdra', district_id: 'd8', latitude: 21.35, longitude: 70.42 },
    { phc_id: 'phc-koth', name: 'PHC Koth', district_id: 'd9', latitude: 22.58, longitude: 72.31 },
    { phc_id: 'phc-koyali', name: 'PHC Koyali', district_id: 'd10', latitude: 22.37, longitude: 73.13 },
    { phc_id: 'phc-kuha', name: 'PHC Kuha', district_id: 'd9', latitude: 22.92, longitude: 72.73 },
    { phc_id: 'phc-kumathe', name: 'PHC Kumathe', district_id: 'd11', latitude: 17.68, longitude: 74.02 },
    { phc_id: 'phc-malihabad', name: 'PHC Malihabad', district_id: 'd6', latitude: 26.92, longitude: 80.71 },
    { phc_id: 'phc-mandore', name: 'PHC Mandore', district_id: 'd12', latitude: 26.35, longitude: 73.04 },
    { phc_id: 'phc-mohanlalganj', name: 'PHC Mohanlalganj', district_id: 'd6', latitude: 26.67, longitude: 80.98 },
    { phc_id: 'phc-mojidad', name: 'PHC Mojidad', district_id: 'd13', latitude: 22.55, longitude: 71.82 },
    { phc_id: 'phc-mokhasan', name: 'PHC Mokhasan', district_id: 'd2', latitude: 23.31, longitude: 72.54 },
    { phc_id: 'phc-nakra', name: 'PHC Nakra', district_id: 'd8', latitude: 21.52, longitude: 70.46 },
    { phc_id: 'phc-netra', name: 'PHC Netra', district_id: 'd14', latitude: 25.42, longitude: 73.18 },
    { phc_id: 'phc-nimgaon', name: 'PHC Nimgaon', district_id: 'd15', latitude: 18.82, longitude: 74.15 },
    { phc_id: 'phc-sanathal', name: 'PHC Sanathal', district_id: 'd9', latitude: 22.98, longitude: 72.47 },
    { phc_id: 'phc-vataman', name: 'PHC Vataman', district_id: 'd9', latitude: 22.51, longitude: 72.45 }
  ];

  const targetDate = '2026-09-14';
  const dataset = generatePrototypeWorkforce(mock28Phcs, targetDate);

  await t.test('1. 28 PHC coverage is complete', () => {
    assert.strictEqual(mock28Phcs.length, 28);
    const phcIdsInDataset = new Set(dataset.staff.map(s => s.phc_id));
    assert.strictEqual(phcIdsInDataset.size, 28);
    for (const phc of mock28Phcs) {
      assert.ok(phcIdsInDataset.has(phc.phc_id), `Missing PHC: ${phc.phc_id}`);
    }
  });

  await t.test('2. Deterministic staff and attendance generation (repeated runs produce exact matches)', () => {
    const d1 = generatePrototypeWorkforce(mock28Phcs, targetDate);
    const d2 = generatePrototypeWorkforce(mock28Phcs, targetDate);
    assert.deepStrictEqual(d1.staff, d2.staff);
    assert.deepStrictEqual(d1.staffAttendance, d2.staffAttendance);
  });

  await t.test('3. Dataset validation passes all 15 integrity constraints', () => {
    const val = validatePrototypeWorkforce(dataset, mock28Phcs);
    assert.strictEqual(val.isValid, true);
    assert.strictEqual(val.errors.length, 0);
  });

  await t.test('4. Valid role and status distributions across all staff', () => {
    for (const s of dataset.staff) {
      assert.ok(ALLOWED_ROLES.includes(s.role), `Invalid role: ${s.role}`);
      assert.ok(ALLOWED_STAFF_STATUSES.includes(s.status), `Invalid status: ${s.status}`);
      assert.strictEqual(s.datasetType, 'CONSTRUCTED_PROTOTYPE');
    }
  });

  await t.test('5. Valid attendance statuses and check-in timestamps', () => {
    for (const a of dataset.staffAttendance) {
      assert.ok(ALLOWED_ATTENDANCE_STATUSES.includes(a.status), `Invalid status: ${a.status}`);
      assert.strictEqual(a.date, targetDate);
      if (a.status === 'PRESENT' || a.status === 'LATE') {
        assert.ok(a.check_in !== null);
        assert.ok(a.check_out !== null);
        assert.ok(new Date(a.check_out) > new Date(a.check_in));
      } else {
        assert.strictEqual(a.check_in, null);
        assert.strictEqual(a.check_out, null);
      }
    }
  });

  await t.test('6. No duplicate staff IDs or duplicate attendance records', () => {
    const staffIds = new Set();
    for (const s of dataset.staff) {
      assert.ok(!staffIds.has(s.staff_id));
      staffIds.add(s.staff_id);
    }

    const attKeys = new Set();
    for (const a of dataset.staffAttendance) {
      const k = `${a.staff_id}_${a.date}`;
      assert.ok(!attKeys.has(k));
      attKeys.add(k);
    }
  });

  await t.test('7. Calculated workforce risk produces ADEQUATE, AT_RISK, and CRITICAL distribution', () => {
    const riskCounts = { ADEQUATE: 0, AT_RISK: 0, CRITICAL: 0, INSUFFICIENT_DATA: 0 };

    for (const phc of mock28Phcs) {
      const metrics = calculateAttendanceMetrics(phc.phc_id, targetDate, dataset.staff, dataset.staffAttendance);
      const risk = calculateWorkforceRisk(metrics);

      assert.strictEqual(metrics.dataStatus, 'AVAILABLE');
      assert.ok(typeof metrics.attendancePercentage === 'number');
      assert.ok(metrics.totalAssigned >= 4 && metrics.totalAssigned <= 12);
      riskCounts[risk.status]++;
    }

    // Verify all 3 active operational risk conditions are present across the 28 PHCs
    assert.ok(riskCounts.ADEQUATE > 0, `Expected ADEQUATE > 0, got ${riskCounts.ADEQUATE}`);
    assert.ok(riskCounts.AT_RISK > 0, `Expected AT_RISK > 0, got ${riskCounts.AT_RISK}`);
    assert.ok(riskCounts.CRITICAL > 0, `Expected CRITICAL > 0, got ${riskCounts.CRITICAL}`);
    assert.strictEqual(riskCounts.INSUFFICIENT_DATA, 0, 'No PHC should be INSUFFICIENT_DATA with complete dataset');
  });

  await t.test('8. Explicit ABSENT records drive calculations (e.g. PHC Nakra produces CRITICAL 50%)', () => {
    const metrics = calculateAttendanceMetrics('phc-nakra', targetDate, dataset.staff, dataset.staffAttendance);
    assert.strictEqual(metrics.totalAssigned, 8);
    assert.strictEqual(metrics.present, 4);
    assert.strictEqual(metrics.absent, 4);
    assert.strictEqual(metrics.attendancePercentage, 50.0);
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.CRITICAL);
  });

  await t.test('9. Authorized leave is excluded from expected denominator (e.g. PHC Adalaj)', () => {
    const metrics = calculateAttendanceMetrics('phc-adalaj', targetDate, dataset.staff, dataset.staffAttendance);
    assert.strictEqual(metrics.totalAssigned, 8);
    assert.strictEqual(metrics.present, 6);
    assert.strictEqual(metrics.late, 1);
    assert.strictEqual(metrics.authorizedLeave, 1);
    // (6 + 1) / (8 - 1) = 7/7 = 100%
    assert.strictEqual(metrics.attendancePercentage, 100.0);
    const risk = calculateWorkforceRisk(metrics);
    assert.strictEqual(risk.status, WORKFORCE_STATUS.ADEQUATE);
  });

  await t.test('10. Network Workforce Capacity sees nearby prototype data with distances', async () => {
    const netRes = await findNearbyWorkforceCapacity('phc-adalaj', {
      targetDate,
      mockPhcs: mock28Phcs,
      mockStaff: dataset.staff,
      mockAttendance: dataset.staffAttendance
    });

    assert.strictEqual(netRes.sourcePhcId, 'phc-adalaj');
    assert.strictEqual(netRes.sourceWorkforce.status, WORKFORCE_STATUS.ADEQUATE);
    assert.strictEqual(netRes.nearby.length, 5);
    // Excludes source PHC
    assert.strictEqual(netRes.nearby.some(p => p.phc_id === 'phc-adalaj'), false);
    // Distance ordering
    for (let i = 0; i < netRes.nearby.length - 1; i++) {
      assert.ok(netRes.nearby[i].distance_km <= netRes.nearby[i + 1].distance_km);
    }
    // Surrounding data status is AVAILABLE
    for (const near of netRes.nearby) {
      assert.strictEqual(near.dataStatus, 'AVAILABLE');
      assert.ok(typeof near.attendancePercentage === 'number');
      assert.ok(['ADEQUATE', 'AT_RISK', 'CRITICAL'].includes(near.workforceStatus));
    }
  });

  await t.test('11. Metadata contains provenance disclaimer and non-official disclaimer', () => {
    assert.strictEqual(WORKFORCE_DATASET_METADATA.datasetType, 'CONSTRUCTED_PROTOTYPE');
    assert.strictEqual(WORKFORCE_DATASET_METADATA.authoritativeSourceConnected, false);
    assert.match(WORKFORCE_DATASET_METADATA.provenanceDisclaimer, /synthetic operational data/);
  });
});
