import test from 'node:test';
import assert from 'node:assert';
import { calculateAttendanceMetrics } from './attendanceMetrics.js';

test('Day 9 Step 4 - Attendance Metrics Calculation', async (t) => {
    const phcId = 'phc-1';
    const date = '2026-09-09';
    const staffTemplate = (id, role = 'MEDICAL_OFFICER', status = 'ACTIVE', phc = 'phc-1') => ({
        staff_id: id, phc_id: phc, role, status
    });
    const logTemplate = (id, status = 'PRESENT', phc = 'phc-1', d = '2026-09-09') => ({
        attendance_id: 'a-'+id, staff_id: id, phc_id: phc, date: d, status
    });

    await t.test('1. All attendance states calculate correctly', () => {
        const staff = [
            staffTemplate('s1'), staffTemplate('s2'), staffTemplate('s3'), staffTemplate('s4')
        ];
        const logs = [
            logTemplate('s1', 'PRESENT'),
            logTemplate('s2', 'ABSENT'),
            logTemplate('s3', 'LATE'),
            logTemplate('s4', 'AUTHORIZED_LEAVE')
        ];
        
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.totalAssigned, 4);
        assert.strictEqual(res.present, 1);
        assert.strictEqual(res.absent, 1);
        assert.strictEqual(res.late, 1);
        assert.strictEqual(res.authorizedLeave, 1);
        // Formula: (Present + Late) / (Total - Leave) => (1 + 1) / (4 - 1) = 2 / 3 = 66.7%
        assert.strictEqual(res.attendancePercentage, 66.7);
    });

    await t.test('2. Missing attendance yields DATA_UNAVAILABLE', () => {
        const res = calculateAttendanceMetrics(phcId, date, [staffTemplate('s1')], []);
        assert.strictEqual(res.dataStatus, 'DATA_UNAVAILABLE');
    });

    await t.test('3. Zero assigned staff yields INSUFFICIENT_DATA', () => {
        const res = calculateAttendanceMetrics(phcId, date, [], [logTemplate('s1')]);
        assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA');
    });

    await t.test('4. Inactive and Transferred staff are ignored', () => {
        const staff = [
            staffTemplate('s1', 'NURSE', 'ACTIVE'),
            staffTemplate('s2', 'NURSE', 'INACTIVE'),
            staffTemplate('s3', 'NURSE', 'TRANSFERRED')
        ];
        const logs = [logTemplate('s1', 'PRESENT')];
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.totalAssigned, 1);
        assert.strictEqual(res.attendancePercentage, 100);
    });

    await t.test('5. Duplicate attendance flags INVALID_DATA', () => {
        const staff = [staffTemplate('s1')];
        const logs = [logTemplate('s1', 'PRESENT'), logTemplate('s1', 'LATE')];
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.dataStatus, 'INVALID_DATA');
    });

    await t.test('6. PHC mismatch handles orphaned data securely', () => {
        const staff = [staffTemplate('s1', 'NURSE', 'ACTIVE', 'phc-2')]; // Not in phc-1
        const logs = [logTemplate('s1', 'PRESENT', 'phc-1')]; // Logged in phc-1
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.dataStatus, 'INSUFFICIENT_DATA'); // Because assigned == 0 for phc-1
    });

    await t.test('7. Role-level calculations', () => {
        const staff = [
            staffTemplate('s1', 'MEDICAL_OFFICER'),
            staffTemplate('s2', 'NURSE'),
            staffTemplate('s3', 'PHARMACIST')
        ];
        const logs = [
            logTemplate('s1', 'PRESENT'),
            logTemplate('s2', 'ABSENT'),
            logTemplate('s3', 'LATE')
        ];
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.roles.MEDICAL_OFFICER.attendancePercentage, 100);
        assert.strictEqual(res.roles.NURSE.attendancePercentage, 0);
        assert.strictEqual(res.roles.PHARMACIST.attendancePercentage, 100);
        assert.strictEqual(res.roles.OTHER.attendancePercentage, null);
    });

    await t.test('8. Missing attendance record for assigned staff yields INCOMPLETE_DATA and does NOT increment absent', () => {
        const staff = [
            staffTemplate('s1', 'MEDICAL_OFFICER'),
            staffTemplate('s2', 'NURSE')
        ];
        // Only s1 has a log; s2 is missing
        const logs = [
            logTemplate('s1', 'PRESENT')
        ];
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.dataStatus, 'INCOMPLETE_DATA');
        assert.strictEqual(res.present, 1);
        assert.strictEqual(res.absent, 0, 'Missing attendance must NOT count as ABSENT');
        assert.strictEqual(res.unrecorded, 1);
        assert.strictEqual(res.attendancePercentage, null);
        assert.strictEqual(res.roles.NURSE.unrecorded, 1);
        assert.strictEqual(res.roles.NURSE.absent, 0);
    });

    await t.test('9. All staff on authorized leave yields null percentage without division error', () => {
        const staff = [staffTemplate('s1')];
        const logs = [logTemplate('s1', 'AUTHORIZED_LEAVE')];
        const res = calculateAttendanceMetrics(phcId, date, staff, logs);
        assert.strictEqual(res.dataStatus, 'AVAILABLE');
        assert.strictEqual(res.authorizedLeave, 1);
        assert.strictEqual(res.attendancePercentage, null);
    });
});
