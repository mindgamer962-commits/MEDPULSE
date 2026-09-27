import { calculateAttendanceMetrics } from './attendanceMetrics.js';

/**
 * Operational Prototype Thresholds for Workforce Attendance Risk.
 * Explicitly labeled as operational prototype thresholds — NOT official government staffing standards.
 */
export const WORKFORCE_THRESHOLDS = {
  ADEQUATE_MIN: 90.0,
  AT_RISK_MIN: 75.0,
  DISCLAIMER: 'Operational prototype thresholds — not official government staffing standards.'
};

export const WORKFORCE_STATUS = {
  ADEQUATE: 'ADEQUATE',
  AT_RISK: 'AT_RISK',
  CRITICAL: 'CRITICAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
};

export const ROLE_RISK_NOTE = 'Role-level criticality requires authoritative minimum staffing requirements.';

/**
 * Pure calculation utility to evaluate Workforce Risk.
 * Zero Firestore access. Zero database writes.
 *
 * @param {Object} metrics - Output from calculateAttendanceMetrics or equivalent metrics object
 * @returns {Object} Workforce risk decision support object
 */
export function calculateWorkforceRisk(metrics) {
  const baseThresholds = {
    adequateMin: WORKFORCE_THRESHOLDS.ADEQUATE_MIN,
    atRiskMin: WORKFORCE_THRESHOLDS.AT_RISK_MIN,
    disclaimer: WORKFORCE_THRESHOLDS.DISCLAIMER
  };

  // 1. Validate Input Structure
  if (!metrics || typeof metrics !== 'object') {
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId: null,
      date: null,
      attendancePercentage: null,
      dataStatus: 'INSUFFICIENT_DATA',
      reason: 'Workforce risk cannot be determined because metric data is missing or invalid.',
      thresholds: baseThresholds,
      metrics: null,
      roles: null,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  const phcId = metrics.phcId || null;
  const date = metrics.date || null;
  const dataStatus = metrics.dataStatus || 'INSUFFICIENT_DATA';
  const roles = metrics.roles || null;
  const metricsSummary = {
    totalAssigned: typeof metrics.totalAssigned === 'number' ? metrics.totalAssigned : 0,
    present: typeof metrics.present === 'number' ? metrics.present : 0,
    late: typeof metrics.late === 'number' ? metrics.late : 0,
    absent: typeof metrics.absent === 'number' ? metrics.absent : 0,
    authorizedLeave: typeof metrics.authorizedLeave === 'number' ? metrics.authorizedLeave : 0,
    unrecorded: typeof metrics.unrecorded === 'number' ? metrics.unrecorded : 0
  };

  // 2. Missing Data Rules
  if (dataStatus === 'INSUFFICIENT_DATA') {
    const reason = metricsSummary.totalAssigned === 0
      ? 'Workforce risk cannot be determined because no active staff are assigned to this PHC.'
      : 'Workforce risk cannot be determined due to insufficient staff roster data.';
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason,
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  if (dataStatus === 'DATA_UNAVAILABLE') {
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason: 'Attendance data is unavailable for the target date.',
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  if (dataStatus === 'INCOMPLETE_DATA') {
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason: `Workforce risk cannot be determined because attendance records are incomplete (${metricsSummary.unrecorded} unrecorded).`,
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  if (dataStatus === 'INVALID_DATA') {
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason: 'Workforce risk cannot be determined due to invalid or conflicting attendance records.',
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  if (dataStatus !== 'AVAILABLE') {
    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason: 'Workforce risk cannot be determined due to unavailable or incomplete attendance data.',
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  // 3. Handle Special Denominator Condition (All staff on authorized leave)
  if (metrics.attendancePercentage === null || typeof metrics.attendancePercentage !== 'number') {
    if (metricsSummary.totalAssigned > 0 && (metricsSummary.totalAssigned - metricsSummary.authorizedLeave <= 0)) {
      return {
        status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
        phcId,
        date,
        attendancePercentage: null,
        dataStatus,
        reason: 'All assigned personnel are on authorized leave; no expected on-duty workforce.',
        thresholds: baseThresholds,
        metrics: metricsSummary,
        roles,
        roleRiskNote: ROLE_RISK_NOTE
      };
    }

    return {
      status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
      phcId,
      date,
      attendancePercentage: null,
      dataStatus,
      reason: 'Workforce risk cannot be determined because attendance percentage is not available.',
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  const pct = metrics.attendancePercentage;

  // 4. Threshold Evaluation (Operational Prototype Thresholds)
  if (pct >= WORKFORCE_THRESHOLDS.ADEQUATE_MIN) {
    return {
      status: WORKFORCE_STATUS.ADEQUATE,
      phcId,
      date,
      attendancePercentage: pct,
      dataStatus,
      reason: `Workforce attendance (${pct}%) is within the adequate operational range (>= ${WORKFORCE_THRESHOLDS.ADEQUATE_MIN}%).`,
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  if (pct >= WORKFORCE_THRESHOLDS.AT_RISK_MIN) {
    return {
      status: WORKFORCE_STATUS.AT_RISK,
      phcId,
      date,
      attendancePercentage: pct,
      dataStatus,
      reason: `Workforce attendance (${pct}%) is below the adequate threshold but above critical (${WORKFORCE_THRESHOLDS.AT_RISK_MIN}% - ${WORKFORCE_THRESHOLDS.ADEQUATE_MIN}%).`,
      thresholds: baseThresholds,
      metrics: metricsSummary,
      roles,
      roleRiskNote: ROLE_RISK_NOTE
    };
  }

  return {
    status: WORKFORCE_STATUS.CRITICAL,
    phcId,
    date,
    attendancePercentage: pct,
    dataStatus,
    reason: `Workforce attendance (${pct}%) is below the operational critical threshold (< ${WORKFORCE_THRESHOLDS.AT_RISK_MIN}%).`,
    thresholds: baseThresholds,
    metrics: metricsSummary,
    roles,
    roleRiskNote: ROLE_RISK_NOTE
  };
}

/**
 * Convenience helper to compute attendance metrics and classify workforce risk.
 * Pure calculation utility. Zero Firestore access.
 *
 * @param {string} phcId
 * @param {string} targetDate
 * @param {Array} staffList
 * @param {Array} attendanceList
 * @returns {Object} Workforce risk decision support object
 */
export function getWorkforceRisk(phcId, targetDate, staffList, attendanceList) {
  const metrics = calculateAttendanceMetrics(phcId, targetDate, staffList, attendanceList);
  return calculateWorkforceRisk(metrics);
}
