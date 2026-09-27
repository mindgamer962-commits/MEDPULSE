/**
 * Pure calculation utility for Personnel Attendance Metrics.
 * Operates strictly on supplied arrays. Zero Firestore writes.
 *
 * @param {string} phcId
 * @param {string} targetDate - ISO date string YYYY-MM-DD
 * @param {Array} staffList - Array of staff objects
 * @param {Array} attendanceList - Array of attendance objects
 */
export function calculateAttendanceMetrics(phcId, targetDate, staffList, attendanceList) {
  const result = {
    phcId,
    date: targetDate,
    dataStatus: 'AVAILABLE',
    totalAssigned: 0,
    present: 0,
    absent: 0,
    late: 0,
    onDuty: 0,
    authorizedLeave: 0,
    unrecorded: 0,
    attendancePercentage: null,
    roles: {
      MEDICAL_OFFICER: { assigned: 0, present: 0, absent: 0, late: 0, onDuty: 0, authorizedLeave: 0, unrecorded: 0, attendancePercentage: null },
      NURSE: { assigned: 0, present: 0, absent: 0, late: 0, onDuty: 0, authorizedLeave: 0, unrecorded: 0, attendancePercentage: null },
      PHARMACIST: { assigned: 0, present: 0, absent: 0, late: 0, onDuty: 0, authorizedLeave: 0, unrecorded: 0, attendancePercentage: null },
      OTHER: { assigned: 0, present: 0, absent: 0, late: 0, onDuty: 0, authorizedLeave: 0, unrecorded: 0, attendancePercentage: null }
    }
  };

  if (!staffList || staffList.length === 0) {
    result.dataStatus = 'INSUFFICIENT_DATA';
    return result;
  }

  // 1. ASSIGNED STAFF: Must be ACTIVE and mapped to this PHC.
  // Note: For historical dates, a pure 'ACTIVE' check assumes their current state is true for the past.
  // A true historical system requires effective-dated assignments.
  const assignedStaff = staffList.filter(s => s.phc_id === phcId && s.status === 'ACTIVE');
  
  if (assignedStaff.length === 0) {
    result.dataStatus = 'INSUFFICIENT_DATA';
    return result;
  }

  result.totalAssigned = assignedStaff.length;

  if (!attendanceList || attendanceList.length === 0) {
    result.dataStatus = 'DATA_UNAVAILABLE';
    return result;
  }

  // 2. ATTENDANCE LOGIC
  const targetAttendance = attendanceList.filter(a => a.phc_id === phcId && a.date === targetDate);

  // Data Completeness Rule: If we have staff but NO attendance pushed for this day yet
  if (targetAttendance.length === 0) {
    result.dataStatus = 'DATA_UNAVAILABLE';
    return result;
  }

  // Check for duplicates and status validity
  let duplicateError = false;
  let invalidStatusError = false;

  for (const staff of assignedStaff) {
    const role = result.roles[staff.role] ? staff.role : 'OTHER';
    result.roles[role].assigned++;

    const staffLogs = targetAttendance.filter(a => a.staff_id === staff.staff_id);
    
    if (staffLogs.length > 1) {
      duplicateError = true;
      continue;
    }

    if (staffLogs.length === 1) {
      const log = staffLogs[0];
      const status = log.status;
      
      if (status === 'PRESENT') {
        result.present++;
        result.roles[role].present++;
      } else if (status === 'LATE') {
        // LATE is operationally PRESENT for capacity, but tracked separately for compliance.
        result.late++;
        result.roles[role].late++;
      } else if (status === 'ABSENT') {
        // Only explicit authoritative records with status === 'ABSENT' count as absent.
        result.absent++;
        result.roles[role].absent++;
      } else if (status === 'AUTHORIZED_LEAVE') {
        // AUTHORIZED_LEAVE explicitly removes the staff from the expected daily denominator.
        result.authorizedLeave++;
        result.roles[role].authorizedLeave++;
      } else {
        invalidStatusError = true;
      }
    } else {
      // Missing log for an assigned staff member must NOT default to ABSENT.
      // A missing log indicates missing/incomplete attendance feed.
      result.unrecorded++;
      result.roles[role].unrecorded++;
    }
  }

  if (duplicateError || invalidStatusError) {
    result.dataStatus = 'INVALID_DATA';
    return result;
  }

  if (result.unrecorded > 0) {
    // Incomplete attendance feed
    result.dataStatus = 'INCOMPLETE_DATA';
    return result;
  }

  // 3. ATTENDANCE PERCENTAGE FORMULA
  // Numerator = PRESENT + LATE (both physically in the building providing care)
  // Denominator = TOTAL_ASSIGNED - AUTHORIZED_LEAVE (removes scheduled PTO from penalizing the metric)
  const calcPercentage = (present, late, total, leave) => {
    const denominator = total - leave;
    if (denominator <= 0) return null;
    return parseFloat((((present + late) / denominator) * 100).toFixed(1));
  };

  result.onDuty = result.present + result.late;
  result.attendancePercentage = calcPercentage(result.present, result.late, result.totalAssigned, result.authorizedLeave);

  for (const roleKey of Object.keys(result.roles)) {
    const r = result.roles[roleKey];
    r.onDuty = r.present + r.late;
    if (r.assigned > 0) {
      r.attendancePercentage = calcPercentage(r.present, r.late, r.assigned, r.authorizedLeave);
    }
  }

  return result;
}
