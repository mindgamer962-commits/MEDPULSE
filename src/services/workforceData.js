/**
 * Deterministic Prototype Workforce Configuration and Generator for MedPulse.
 * All records generated here are explicitly labeled as CONSTRUCTED PROTOTYPE DATA.
 *
 * PROVENANCE:
 * "These workforce and attendance values are synthetic operational data used to demonstrate
 * the MedPulse workflow. They are not official government staffing or attendance records."
 */

export const WORKFORCE_DATASET_METADATA = {
  id: 'prototype_2026_09_14',
  datasetType: 'CONSTRUCTED_PROTOTYPE',
  targetDate: '2026-09-14',
  phcCount: 28,
  description: 'Synthetic workforce and attendance data for MedPulse hackathon workflow demonstration.',
  authoritativeSourceConnected: false,
  provenanceDisclaimer: 'These workforce and attendance values are synthetic operational data used to demonstrate the MedPulse workflow. They are not official government staffing or attendance records.'
};

export const ALLOWED_ROLES = ['MEDICAL_OFFICER', 'NURSE', 'PHARMACIST', 'OTHER'];
export const ALLOWED_STAFF_STATUSES = ['ACTIVE', 'ON_LEAVE', 'TRANSFERRED', 'INACTIVE'];
export const ALLOWED_ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'AUTHORIZED_LEAVE'];

/**
 * Deterministic PHC Archetypes for the 28 PHCs.
 * Designed to demonstrate ADEQUATE, AT_RISK, and CRITICAL conditions realistically.
 */
export const PHC_ARCHETYPES = {
  // ADEQUATE Facilities (>= 90% attendance)
  'phc-achrol': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-adalaj': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'AUTHORIZED_LEAVE' }
    ]
  },
  'phc-alipore': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-bhankrota': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // 9/10 = 90.0% -> ADEQUATE
    ]
  },
  'phc-chinhat': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'MEDICAL_OFFICER', att: 'LATE' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-gadat': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-jamsar': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'AUTHORIZED_LEAVE' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-kaman': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'LATE' }
    ]
  },
  'phc-koyali': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-kuha': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-mandore': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-mohanlalganj': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'AUTHORIZED_LEAVE' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-mokhasan': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },
  'phc-sanathal': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' }
    ]
  },

  // AT_RISK Facilities (75% to 89.9% attendance)
  'phc-barabanki-rural': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'LATE' },
      { role: 'OTHER', att: 'ABSENT' } // (5+1)/8 = 6/8 = 75.0% -> AT_RISK
    ]
  },
  'phc-boraj': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' } // 5/6 = 83.3% -> AT_RISK
    ]
  },
  'phc-hond': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'AUTHORIZED_LEAVE' },
      { role: 'OTHER', att: 'PRESENT' } // 5/(7-1) = 5/6 = 83.3% -> AT_RISK
    ]
  },
  'phc-kakori': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'MEDICAL_OFFICER', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' },
      { role: 'OTHER', att: 'PRESENT' } // (7+1)/10 = 8/10 = 80.0% -> AT_RISK
    ]
  },
  'phc-kumathe': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'LATE' } // (6+1)/8 = 7/8 = 87.5% -> AT_RISK
    ]
  },
  'phc-malihabad': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'LATE' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // (5+1)/8 = 6/8 = 75.0% -> AT_RISK
    ]
  },
  'phc-mojidad': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' } // 5/6 = 83.3% -> AT_RISK
    ]
  },
  'phc-vataman': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'LATE' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // (5+1)/8 = 6/8 = 75.0% -> AT_RISK
    ]
  },

  // CRITICAL Facilities (< 75% attendance)
  'phc-borsar': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'ABSENT' },
      { role: 'OTHER', att: 'PRESENT' } // 3/6 = 50.0% -> CRITICAL
    ]
  },
  'phc-kevdra': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'PHARMACIST', att: 'ABSENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' } // 4/7 = 57.1% -> CRITICAL
    ]
  },
  'phc-koth': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // 4/8 = 50.0% -> CRITICAL
    ]
  },
  'phc-nakra': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // 4/8 = 50.0% -> CRITICAL
    ]
  },
  'phc-netra': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'ABSENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // 4/7 = 57.1% -> CRITICAL
    ]
  },
  'phc-nimgaon': {
    staff: [
      { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
      { role: 'NURSE', att: 'PRESENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'NURSE', att: 'ABSENT' },
      { role: 'PHARMACIST', att: 'ABSENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'PRESENT' },
      { role: 'OTHER', att: 'ABSENT' } // 4/8 = 50.0% -> CRITICAL
    ]
  }
};

/**
 * Generates deterministic prototype staff and attendance records for all provided PHCs.
 * 
 * @param {Array} phcsList - List of PHC objects with phc_id
 * @param {string} [targetDate='2026-09-14'] - Demonstration date
 * @returns {Object} { staff: Array, staffAttendance: Array, metadata: Object }
 */
export function generatePrototypeWorkforce(phcsList, targetDate = '2026-09-14') {
  if (!phcsList || !Array.isArray(phcsList) || phcsList.length === 0) {
    throw new Error('Cannot generate workforce: PHC list is empty or invalid.');
  }

  const staffRecords = [];
  const attendanceRecords = [];

  for (const phc of phcsList) {
    const phcId = phc.phc_id || phc.id;
    if (!phcId) continue;

    const archetype = PHC_ARCHETYPES[phcId] || {
      // Default fallback configuration if a new PHC is present
      staff: [
        { role: 'MEDICAL_OFFICER', att: 'PRESENT' },
        { role: 'NURSE', att: 'PRESENT' },
        { role: 'NURSE', att: 'PRESENT' },
        { role: 'PHARMACIST', att: 'PRESENT' },
        { role: 'OTHER', att: 'PRESENT' }
      ]
    };

    const roleCounters = {
      MEDICAL_OFFICER: 1,
      NURSE: 1,
      PHARMACIST: 1,
      OTHER: 1
    };

    for (const item of archetype.staff) {
      const role = item.role;
      const index = String(roleCounters[role]++).padStart(2, '0');
      const roleCode = role === 'MEDICAL_OFFICER' ? 'mo' : role === 'NURSE' ? 'nr' : role === 'PHARMACIST' ? 'ph' : 'ot';
      const staffId = `staff_${phcId}_${roleCode}_${index}`;

      const staffDoc = {
        staff_id: staffId,
        phc_id: phcId,
        role: role,
        status: 'ACTIVE',
        datasetType: 'CONSTRUCTED_PROTOTYPE',
        last_updated: targetDate
      };
      staffRecords.push(staffDoc);

      const attStatus = item.att;
      const attendanceId = `att_${staffId}_${targetDate}`;

      let checkIn = null;
      let checkOut = null;

      if (attStatus === 'PRESENT') {
        checkIn = `${targetDate}T08:00:00Z`;
        checkOut = `${targetDate}T16:00:00Z`;
      } else if (attStatus === 'LATE') {
        checkIn = `${targetDate}T09:30:00Z`;
        checkOut = `${targetDate}T16:30:00Z`;
      }

      const attendanceDoc = {
        attendance_id: attendanceId,
        staff_id: staffId,
        phc_id: phcId,
        date: targetDate,
        status: attStatus,
        check_in: checkIn,
        check_out: checkOut,
        datasetType: 'CONSTRUCTED_PROTOTYPE'
      };
      attendanceRecords.push(attendanceDoc);
    }
  }

  const metadata = {
    ...WORKFORCE_DATASET_METADATA,
    targetDate,
    totalStaffRecords: staffRecords.length,
    totalAttendanceRecords: attendanceRecords.length
  };

  return {
    staff: staffRecords,
    staffAttendance: attendanceRecords,
    metadata
  };
}

/**
 * Validates the generated dataset against all 15 integrity rules.
 * 
 * @param {Object} dataset - Output of generatePrototypeWorkforce
 * @param {Array} phcsList - Master PHCs list
 * @returns {Object} { isValid: boolean, errors: Array }
 */
export function validatePrototypeWorkforce(dataset, phcsList) {
  const errors = [];

  if (!dataset || !dataset.staff || !dataset.staffAttendance) {
    errors.push('Dataset structure is missing staff or staffAttendance.');
    return { isValid: false, errors };
  }

  const validPhcIds = new Set(phcsList.map(p => p.phc_id || p.id));
  const staffIdMap = new Map();
  const staffPhcMap = new Map();

  // 1. Validate 28 PHC coverage
  const datasetPhcIds = new Set(dataset.staff.map(s => s.phc_id));
  if (datasetPhcIds.size !== 28) {
    errors.push(`Expected 28 distinct PHCs in dataset, found ${datasetPhcIds.size}.`);
  }

  // 2-5. Validate Staff
  for (const staff of dataset.staff) {
    if (!validPhcIds.has(staff.phc_id)) {
      errors.push(`Staff ${staff.staff_id} references non-existent PHC ${staff.phc_id}.`);
    }
    if (staffIdMap.has(staff.staff_id)) {
      errors.push(`Duplicate staff_id detected: ${staff.staff_id}.`);
    }
    staffIdMap.set(staff.staff_id, staff);
    staffPhcMap.set(staff.staff_id, staff.phc_id);

    if (!ALLOWED_ROLES.includes(staff.role)) {
      errors.push(`Staff ${staff.staff_id} has invalid role: ${staff.role}.`);
    }
    if (!ALLOWED_STAFF_STATUSES.includes(staff.status)) {
      errors.push(`Staff ${staff.staff_id} has invalid status: ${staff.status}.`);
    }
    if (staff.datasetType !== 'CONSTRUCTED_PROTOTYPE') {
      errors.push(`Staff ${staff.staff_id} missing CONSTRUCTED_PROTOTYPE tag.`);
    }
  }

  // 6-15. Validate Attendance
  const attendanceStaffDateSet = new Set();
  const attendanceIdSet = new Set();

  for (const att of dataset.staffAttendance) {
    if (attendanceIdSet.has(att.attendance_id)) {
      errors.push(`Duplicate attendance_id: ${att.attendance_id}.`);
    }
    attendanceIdSet.add(att.attendance_id);

    if (!staffIdMap.has(att.staff_id)) {
      errors.push(`Attendance ${att.attendance_id} references orphaned staff_id: ${att.staff_id}.`);
    }

    const expectedPhc = staffPhcMap.get(att.staff_id);
    if (expectedPhc !== att.phc_id) {
      errors.push(`Attendance ${att.attendance_id} PHC ${att.phc_id} does not match staff PHC ${expectedPhc}.`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(att.date)) {
      errors.push(`Attendance ${att.attendance_id} has invalid date format: ${att.date}.`);
    }

    const staffDateKey = `${att.staff_id}_${att.date}`;
    if (attendanceStaffDateSet.has(staffDateKey)) {
      errors.push(`Duplicate attendance for staff ${att.staff_id} on date ${att.date}.`);
    }
    attendanceStaffDateSet.add(staffDateKey);

    if (!ALLOWED_ATTENDANCE_STATUSES.includes(att.status)) {
      errors.push(`Attendance ${att.attendance_id} has invalid status: ${att.status}.`);
    }

    if (att.status === 'PRESENT' || att.status === 'LATE') {
      if (!att.check_in || !att.check_out) {
        errors.push(`Attendance ${att.attendance_id} (${att.status}) missing check_in/check_out.`);
      } else if (new Date(att.check_out) <= new Date(att.check_in)) {
        errors.push(`Attendance ${att.attendance_id} check_out (${att.check_out}) is not greater than check_in (${att.check_in}).`);
      }
    } else if (att.status === 'ABSENT' || att.status === 'AUTHORIZED_LEAVE') {
      if (att.check_in !== null || att.check_out !== null) {
        errors.push(`Attendance ${att.attendance_id} (${att.status}) must have null check_in and check_out.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 32-bit FNV-1a Hash for deterministic pseudo-random distribution.
 *
 * @param {string} seedStr
 * @returns {number}
 */
export function getWorkforceDeterministicHash(seedStr) {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0);
}

const CRITICAL_FACILITIES = new Set([
  'phc-borsar', 'phc-kevdra', 'phc-koth', 'phc-nakra', 'phc-vataman'
]);

const AT_RISK_FACILITIES = new Set([
  'phc-barabanki-rural', 'phc-boraj', 'phc-hond', 'phc-kakori',
  'phc-kumathe', 'phc-malihabad', 'phc-mojidad', 'phc-netra', 'phc-nimgaon'
]);

/**
 * Generates deterministic prototype attendance records for missing dates.
 * ZERO Firestore writes. Pure calculation function.
 *
 * @param {Array} staffList - List of all staff records
 * @param {Array<string>} [datesList] - List of missing dates YYYY-MM-DD
 * @returns {Array<Object>} Generated candidate attendance records
 */
export function generateDeterministicAttendanceExtension(
  staffList,
  datesList = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
) {
  const activeStaff = staffList.filter((s) => s.status === 'ACTIVE');
  const candidateRecords = [];

  for (const date of datesList) {
    for (const staff of activeStaff) {
      const seedStr = `${staff.staff_id}_${date}_MEDPULSE_WORKFORCE_DAY18`;
      const hash = getWorkforceDeterministicHash(seedStr);
      const bucket = hash % 100;

      let status = 'PRESENT';
      if (CRITICAL_FACILITIES.has(staff.phc_id)) {
        if (bucket < 50) status = 'PRESENT';
        else if (bucket < 60) status = 'LATE';
        else if (bucket < 65) status = 'AUTHORIZED_LEAVE';
        else status = 'ABSENT';
      } else if (AT_RISK_FACILITIES.has(staff.phc_id)) {
        if (bucket < 72) status = 'PRESENT';
        else if (bucket < 84) status = 'LATE';
        else if (bucket < 89) status = 'AUTHORIZED_LEAVE';
        else status = 'ABSENT';
      } else {
        // ADEQUATE
        if (bucket < 88) status = 'PRESENT';
        else if (bucket < 94) status = 'LATE';
        else if (bucket < 97) status = 'AUTHORIZED_LEAVE';
        else status = 'ABSENT';
      }

      let checkIn = null;
      let checkOut = null;
      if (status === 'PRESENT') {
        checkIn = `${date}T08:00:00Z`;
        checkOut = `${date}T16:00:00Z`;
      } else if (status === 'LATE') {
        checkIn = `${date}T09:30:00Z`;
        checkOut = `${date}T16:30:00Z`;
      }

      candidateRecords.push({
        attendance_id: `att_${staff.staff_id}_${date}`,
        staff_id: staff.staff_id,
        phc_id: staff.phc_id,
        date: date,
        status: status,
        check_in: checkIn,
        check_out: checkOut,
        datasetType: 'CONSTRUCTED_PROTOTYPE',
        is_constructed_prototype: true,
        data_provenance: 'CONSTRUCTED_PROTOTYPE',
        provenance_note: 'Constructed prototype operational attendance data for Day 18 evaluation continuity. Not real staff attendance data.'
      });
    }
  }

  return candidateRecords;
}

