import { findNearestPHCs } from './network.js';
import { getWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from './workforceRisk.js';

/**
 * Finds nearby PHCs and their workforce capacity states.
 * Pure decision-support service. Zero automated staff transfers. Zero Firestore writes.
 *
 * @param {string} sourcePhcId - The ID of the primary PHC
 * @param {Object} options - Configuration and dependency injection options
 * @param {string} [options.targetDate] - Target date string (YYYY-MM-DD)
 * @param {number} [options.limit=5] - Maximum number of nearby PHCs to return
 * @param {Array} [options.mockPhcs] - Optional array of PHCs for testing
 * @param {Array} [options.mockStaff] - Optional array of staff records
 * @param {Array} [options.mockAttendance] - Optional array of attendance records
 * @param {Function} [options.getStaffFn] - Optional async data provider for staff
 * @param {Function} [options.getAttendanceFn] - Optional async data provider for attendance
 * @returns {Promise<Object>} Network workforce capacity decision support payload
 */
export async function findNearbyWorkforceCapacity(sourcePhcId, options = {}) {
  const targetDate = options.targetDate || new Date().toISOString().split('T')[0];
  const limit = typeof options.limit === 'number' ? options.limit : 5;

  const result = {
    sourcePhcId,
    targetDate,
    locationAvailable: false,
    sourceWorkforce: null,
    nearby: [],
    roleRiskNote: ROLE_RISK_NOTE,
    disclaimer: WORKFORCE_THRESHOLDS.DISCLAIMER
  };

  if (!sourcePhcId) {
    result.sourceWorkforce = {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      dataStatus: 'INSUFFICIENT_DATA',
      attendancePercentage: null,
      totalAssigned: 0,
      present: 0,
      late: 0,
      absent: 0,
      authorizedLeave: 0,
      unrecorded: 0,
      reason: 'Workforce risk cannot be determined because no source PHC was specified.',
      roles: null
    };
    return result;
  }

  // 1. Retrieve all staff & attendance data if available
  let allStaff = options.mockStaff || [];
  let allAttendance = options.mockAttendance || [];

  if (options.getStaffFn && !options.mockStaff) {
    try {
      allStaff = (await options.getStaffFn()) || [];
    } catch {
      allStaff = [];
    }
  }

  if (options.getAttendanceFn && !options.mockAttendance) {
    try {
      allAttendance = (await options.getAttendanceFn(targetDate)) || [];
    } catch {
      allAttendance = [];
    }
  }

  // 2. Evaluate Source PHC Workforce Risk
  const sourceRisk = getWorkforceRisk(sourcePhcId, targetDate, allStaff, allAttendance);
  result.sourceWorkforce = {
    status: sourceRisk.status,
    dataStatus: sourceRisk.dataStatus,
    attendancePercentage: sourceRisk.attendancePercentage,
    totalAssigned: sourceRisk.metrics?.totalAssigned || 0,
    present: sourceRisk.metrics?.present || 0,
    late: sourceRisk.metrics?.late || 0,
    onDuty: (sourceRisk.metrics?.present || 0) + (sourceRisk.metrics?.late || 0),
    absent: sourceRisk.metrics?.absent || 0,
    authorizedLeave: sourceRisk.metrics?.authorizedLeave || 0,
    unrecorded: sourceRisk.metrics?.unrecorded || 0,
    reason: sourceRisk.reason,
    roles: sourceRisk.roles
  };

  // 3. Find Nearest PHCs using existing geographical network logic
  const nearestResult = await findNearestPHCs(sourcePhcId, limit, options.mockPhcs);
  result.locationAvailable = nearestResult.location_available;

  if (!nearestResult.location_available || !nearestResult.results || nearestResult.results.length === 0) {
    return result;
  }

  // 4. Map and evaluate each nearby PHC's workforce capacity
  result.nearby = nearestResult.results.map(phc => {
    const phcRisk = getWorkforceRisk(phc.phc_id, targetDate, allStaff, allAttendance);

    return {
      phc_id: phc.phc_id,
      name: phc.name || phc.phc_id,
      district_id: phc.district_id || null,
      district_name: phc.district_name || phc.district || null,
      distance_km: phc.distance_km,
      workforceStatus: phcRisk.status,
      attendancePercentage: phcRisk.attendancePercentage,
      totalAssigned: phcRisk.metrics?.totalAssigned || 0,
      present: phcRisk.metrics?.present || 0,
      late: phcRisk.metrics?.late || 0,
      onDuty: (phcRisk.metrics?.present || 0) + (phcRisk.metrics?.late || 0),
      absent: phcRisk.metrics?.absent || 0,
      authorizedLeave: phcRisk.metrics?.authorizedLeave || 0,
      unrecorded: phcRisk.metrics?.unrecorded || 0,
      dataStatus: phcRisk.dataStatus,
      reason: phcRisk.reason,
      roles: phcRisk.roles
    };
  });

  return result;
}
