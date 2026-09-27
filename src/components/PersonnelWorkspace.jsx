import React, { useState, useEffect } from 'react';
import { calculateWorkforceRisk, getWorkforceRisk, WORKFORCE_STATUS, WORKFORCE_THRESHOLDS, ROLE_RISK_NOTE } from '../services/workforceRisk.js';
import { findNearbyWorkforceCapacity } from '../services/networkWorkforce.js';
import { getStaffRecords, getAttendanceRecords } from '../services/workforceDb.js';
import './PersonnelWorkspace.css';

export default function PersonnelWorkspace({
  phcs = [],
  selectedPhcId = '',
  onSelectPhc = () => {},
  mockStaff = null,
  mockAttendance = null
}) {
  const [targetDate, setTargetDate] = useState('2026-09-14');
  const [loading, setLoading] = useState(false);
  const [workforceData, setWorkforceData] = useState(null);
  const [networkCapacity, setNetworkCapacity] = useState(null);

  const activePHC = phcs.find((p) => p.phc_id === selectedPhcId) || null;

  useEffect(() => {
    let isMounted = true;

    async function evaluateWorkforce() {
      if (!selectedPhcId) {
        setWorkforceData(null);
        setNetworkCapacity(null);
        return;
      }

      setLoading(true);
      // Clear stale state while loading
      setWorkforceData(null);
      setNetworkCapacity(null);

      try {
        // Fetch staff and attendance records (or use injected props for tests)
        let staffList = mockStaff;
        let attendanceList = mockAttendance;

        if (!staffList) {
          staffList = await getStaffRecords();
        }
        if (!attendanceList) {
          attendanceList = await getAttendanceRecords(targetDate);
        }

        // Evaluate workforce risk using pure services (zero Firestore mutations)
        const risk = getWorkforceRisk(selectedPhcId, targetDate, staffList || [], attendanceList || []);
        
        // Evaluate nearby workforce capacity using pure network service
        const networkRes = await findNearbyWorkforceCapacity(selectedPhcId, {
          targetDate,
          mockPhcs: phcs,
          mockStaff: staffList || [],
          mockAttendance: attendanceList || []
        });

        if (isMounted) {
          setWorkforceData(risk);
          setNetworkCapacity(networkRes);
        }
      } catch (err) {
        console.error('Error evaluating workforce state:', err);
        if (isMounted) {
          setWorkforceData({
            status: WORKFORCE_STATUS.INSUFFICIENT_DATA,
            dataStatus: 'ERROR',
            attendancePercentage: null,
            reason: 'Error evaluating workforce records.',
            thresholds: {
              adequateMin: WORKFORCE_THRESHOLDS.ADEQUATE_MIN,
              atRiskMin: WORKFORCE_THRESHOLDS.AT_RISK_MIN,
              disclaimer: WORKFORCE_THRESHOLDS.DISCLAIMER
            },
            metrics: null,
            roles: null,
            roleRiskNote: ROLE_RISK_NOTE
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    evaluateWorkforce();

    return () => {
      isMounted = false;
    };
  }, [selectedPhcId, targetDate, phcs, mockStaff, mockAttendance]);

  const isDataAvailable = workforceData && workforceData.dataStatus === 'AVAILABLE';

  // Badge class helper
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ADEQUATE':
        return 'badge-adequate';
      case 'AT_RISK':
        return 'badge-at-risk';
      case 'CRITICAL':
        return 'badge-critical';
      default:
        return 'badge-insufficient';
    }
  };

  const formatRiskStatus = (status) => {
    switch (status) {
      case 'ADEQUATE':
        return 'ADEQUATE';
      case 'AT_RISK':
        return 'AT RISK';
      case 'CRITICAL':
        return 'CRITICAL';
      default:
        return 'INSUFFICIENT DATA';
    }
  };

  return (
    <div className="personnel-workspace">
      {/* Workspace Header */}
      <div className="page-header personnel-header">
        <div className="page-header-content">
          <div className="badge-pill info-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Personnel Availability
          </div>
          <h1 className="page-title">Personnel Availability Dashboard</h1>
          <p className="page-subtitle">
            {activePHC ? (
              <span>
                <strong>{activePHC.name}</strong> • {activePHC.district || activePHC.district_name || 'Jaipur District'}, {activePHC.state || 'Rajasthan'} • Target Date: <strong>{targetDate}</strong>
              </span>
            ) : (
              'Monitor PHC personnel attendance, role-level availability, and staffing risk.'
            )}
          </p>
        </div>

        {/* Facility Context Toolbar */}
        <div className="personnel-toolbar">
          <div className="toolbar-item">
            <label className="toolbar-label">Active Facility</label>
            <select
              className="personnel-select"
              value={selectedPhcId}
              onChange={(e) => onSelectPhc(e.target.value)}
              disabled={loading}
            >
              {phcs.map((p) => (
                <option key={p.phc_id} value={p.phc_id}>
                  {p.name} ({p.district || p.district_name || 'General'})
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-item">
            <label className="toolbar-label">Target Date</label>
            <div className="date-input-wrapper">
              <input
                type="date"
                className="personnel-date-input"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                disabled={loading}
              />
              <span className={`feed-status-pill ${isDataAvailable ? 'feed-active' : ''}`}>
                {isDataAvailable ? 'Prototype Feed Active' : 'Feed Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Data Provenance & Availability Banner */}
      {isDataAvailable ? (
        <div className="personnel-banner prototype-banner">
          <div className="banner-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <div className="banner-body">
            <div className="banner-title-row">
              <h3 className="banner-title prototype-title">CONSTRUCTED PROTOTYPE DATA</h3>
              <span className="badge-tag prototype-tag">DEMO DATASET ({targetDate})</span>
            </div>
            <p className="banner-desc prototype-desc">
              Workforce and attendance values are synthetic operational data used to demonstrate the MedPulse workflow. They are not official government staffing or attendance records.
            </p>
            <div className="banner-provenance-note prototype-note">
              <strong>Operational Provenance:</strong> Displaying deterministic prototype workforce dataset for <strong>{activePHC?.name || 'Selected PHC'}</strong> across 28 facilities. No live biometric or official HRMS connection is active.
            </div>
          </div>
        </div>
      ) : (
        <div className="personnel-banner warning-banner">
          <div className="banner-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div className="banner-body">
            <div className="banner-title-row">
              <h3 className="banner-title">Attendance Data Unavailable</h3>
              <span className="badge-tag">READY FOR FEED CONSUMPTION</span>
            </div>
            <p className="banner-desc">
              Facility-level personnel attendance data is not currently connected to an authoritative workforce/attendance feed for date {targetDate}.
            </p>
            <div className="banner-provenance-note">
              <strong>Operational Provenance:</strong> MedPulse is ready to consume authoritative staff roster and attendance feeds. Current personnel attendance data is unavailable for {activePHC?.name || 'this facility'}.
            </div>
          </div>
        </div>
      )}

      {/* Loading State Overlay */}
      {loading ? (
        <div className="personnel-loading">
          <div className="spinner"></div>
          <p>Evaluating facility workforce signals...</p>
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div className="personnel-metrics-grid">
            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Assigned Staff</span>
                <span className="metric-tag">Roster</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? workforceData.metrics.totalAssigned : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Active rostered staff' : 'Awaiting staff roster feed'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Present</span>
                <span className="metric-tag">Present</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? workforceData.metrics.present : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Status: PRESENT' : 'Awaiting attendance logs'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Late Arrivals</span>
                <span className="metric-tag">Late</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? workforceData.metrics.late : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Status: LATE' : 'Awaiting time-stamp logs'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">On Duty</span>
                <span className="metric-tag">Operational</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? (workforceData.metrics.onDuty ?? (workforceData.metrics.present + workforceData.metrics.late)) : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'PRESENT + LATE' : 'Awaiting operational logs'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Absent</span>
                <span className="metric-tag">Absence</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? workforceData.metrics.absent : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Status: ABSENT' : 'Awaiting verified absence feed'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Authorized Leave</span>
                <span className="metric-tag">Scheduled</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable ? workforceData.metrics.authorizedLeave : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Approved PTO (excluded)' : 'Awaiting leave management feed'}
              </div>
            </div>

            <div className="personnel-metric-card">
              <div className="metric-header">
                <span className="metric-title">Attendance Rate</span>
                <span className="metric-tag">Capacity</span>
              </div>
              <div className="metric-value-container">
                <span className={`metric-value ${isDataAvailable ? 'active-metric-value' : 'unavailable-text'}`}>
                  {isDataAvailable && workforceData.attendancePercentage !== null ? `${workforceData.attendancePercentage}%` : 'Unavailable'}
                </span>
              </div>
              <div className="metric-caption">
                {isDataAvailable ? 'Expected workforce ratio' : 'Requires active attendance logs'}
              </div>
            </div>
          </div>

          {/* Workforce Staffing Risk Card */}
          <div className="workforce-risk-card">
            <div className="risk-card-left">
              <div className="risk-status-label">Workforce Staffing Risk</div>
              <div className={`risk-status-badge ${getStatusBadgeClass(workforceData?.status)}`}>
                {formatRiskStatus(workforceData?.status)}
              </div>
              <div className="risk-status-display">
                {formatRiskStatus(workforceData?.status)}
              </div>
              {isDataAvailable && workforceData?.attendancePercentage !== null && (
                <div className="risk-attendance-rate">
                  Attendance: {workforceData.attendancePercentage}%
                </div>
              )}
            </div>
            <div className="risk-card-right">
              <div className="risk-reason-title">Operational Diagnostic:</div>
              <p className="risk-reason-text">
                {workforceData?.reason || 'Workforce risk cannot be determined because facility attendance data is unavailable.'}
              </p>

              {/* Contextual Role Information */}
              {isDataAvailable && workforceData?.roles && (
                <div className="risk-role-context">
                  <span className="risk-role-context-item">
                    🩺 Doctors: {workforceData.roles.MEDICAL_OFFICER.present} / {workforceData.roles.MEDICAL_OFFICER.assigned}
                  </span>
                  <span className="risk-role-context-sep">•</span>
                  <span className="risk-role-context-item">
                    💉 Nurses: {workforceData.roles.NURSE.present} / {workforceData.roles.NURSE.assigned}
                  </span>
                  <span className="risk-role-context-sep">•</span>
                  <span className="risk-role-context-item">
                    💊 Pharmacists: {workforceData.roles.PHARMACIST.present} / {workforceData.roles.PHARMACIST.assigned}
                  </span>
                  <span className="risk-role-context-sep">•</span>
                  <span className="risk-role-context-item">
                    📋 Other: {workforceData.roles.OTHER.present} / {workforceData.roles.OTHER.assigned}
                  </span>
                </div>
              )}

              <div className="risk-disclaimer">
                🛡️ <strong>Threshold Standard:</strong> {workforceData?.thresholds?.disclaimer || WORKFORCE_THRESHOLDS.DISCLAIMER}
              </div>
            </div>
          </div>

          {/* Role-Level Breakdown Section */}
          <div className="personnel-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Role-Level Attendance & Staffing</h2>
                <p className="section-subtitle">
                  Operational distribution across clinical and support roles (Present / Assigned).
                </p>
              </div>
              <span className="section-status-tag">4 SUPPORTED ROLES</span>
            </div>

            {/* Role Summary Cards (Present / Assigned) */}
            <div className="role-cards-grid">
              {[
                { key: 'MEDICAL_OFFICER', label: 'Doctors / Medical Officers', shortLabel: 'Doctors', icon: '🩺' },
                { key: 'NURSE', label: 'Nurses', shortLabel: 'Nurses', icon: '💉' },
                { key: 'PHARMACIST', label: 'Pharmacists', shortLabel: 'Pharmacists', icon: '💊' },
                { key: 'OTHER', label: 'Other Personnel', shortLabel: 'Other Personnel', icon: '📋' }
              ].map((role) => {
                const roleData = isDataAvailable && workforceData.roles ? workforceData.roles[role.key] : null;
                const ratioText = roleData
                  ? `${roleData.present} / ${roleData.assigned}`
                  : 'Unavailable';
                return (
                  <div key={role.key} className="role-summary-card">
                    <div className="role-card-header">
                      <span className="role-card-title">
                        <span>{role.icon}</span>
                        {role.label}
                      </span>
                      {roleData && roleData.attendancePercentage !== null && (
                        <span className="role-rate-val">{roleData.attendancePercentage}%</span>
                      )}
                    </div>
                    <div className="role-card-ratio">
                      <span className={`role-ratio-val ${!roleData ? 'muted-val' : ''}`}>
                        {ratioText}
                      </span>
                      <span className="role-card-subtext">Present / Assigned</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="role-table-container">
              <table className="personnel-table">
                <thead>
                  <tr>
                    <th>Designated Role</th>
                    <th>Present / Assigned</th>
                    <th>Assigned Roster</th>
                    <th>Present</th>
                    <th>On Duty</th>
                    <th>Late</th>
                    <th>Absent</th>
                    <th>Authorized Leave</th>
                    <th>Availability %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'MEDICAL_OFFICER', label: 'Doctors / Medical Officers', icon: '🩺' },
                    { key: 'NURSE', label: 'Nurses', icon: '💉' },
                    { key: 'PHARMACIST', label: 'Pharmacists', icon: '💊' },
                    { key: 'OTHER', label: 'Other Personnel', icon: '📋' }
                  ].map((role) => {
                    const roleData = isDataAvailable && workforceData.roles ? workforceData.roles[role.key] : null;
                    return (
                      <tr key={role.key}>
                        <td className="role-name-cell">
                          <span className="role-icon">{role.icon}</span>
                          <strong>{role.label}</strong>
                        </td>
                        <td>
                          {roleData ? (
                            <strong>{roleData.present} / {roleData.assigned}</strong>
                          ) : (
                            <span className="cell-muted">Unavailable</span>
                          )}
                        </td>
                        <td>{roleData ? roleData.assigned : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData ? roleData.present : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData ? (roleData.onDuty ?? (roleData.present + roleData.late)) : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData ? roleData.late : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData ? roleData.absent : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData ? roleData.authorizedLeave : <span className="cell-muted">Unavailable</span>}</td>
                        <td>{roleData && roleData.attendancePercentage !== null ? `${roleData.attendancePercentage}%` : <span className="cell-muted">Unavailable</span>}</td>
                        <td>
                          <span className={`badge-tag cell-badge ${roleData ? 'cell-badge-active' : ''}`}>
                            {roleData ? 'EVALUATED' : 'FEED UNAVAILABLE'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="role-limitation-callout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>
                <strong>Role-Level Evaluation Standard:</strong> {ROLE_RISK_NOTE} MedPulse does not make arbitrary assumptions regarding doctor minimums or doctor surpluses without approved standards.
              </span>
            </div>
          </div>

          {/* Nearby Workforce Intelligence Section */}
          <div className="personnel-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">NEARBY WORKFORCE INTELLIGENCE</h2>
                <p className="section-subtitle">
                  Surrounding PHC workforce visibility within the geographic network.
                </p>
              </div>
              <span className="section-status-tag">GEOGRAPHICAL NETWORK</span>
            </div>

            {networkCapacity && networkCapacity.nearby && networkCapacity.nearby.length > 0 ? (
              <div className="nearby-workforce-grid">
                {networkCapacity.nearby.map((phc) => {
                  const hasNearData = phc.dataStatus === 'AVAILABLE';
                  return (
                    <div key={phc.phc_id} className="nearby-facility-card">
                      <div className="nearby-facility-header">
                        <div>
                          <h4 className="nearby-facility-name">{phc.name}</h4>
                          <span className="nearby-facility-district">{phc.district_name || 'Central District'}</span>
                        </div>
                        <div className="nearby-distance-badge">
                          {phc.distance_km !== null ? `${phc.distance_km} km` : 'Distance N/A'}
                        </div>
                      </div>

                      <div className="nearby-facility-status-row">
                        <span className={`nearby-status-pill ${getStatusBadgeClass(phc.workforceStatus)}`}>
                          Risk: {formatRiskStatus(phc.workforceStatus)}
                        </span>
                        <span className="nearby-feed-note">
                          {hasNearData && phc.attendancePercentage !== null ? `Attendance: ${phc.attendancePercentage}%` : 'Awaiting Feed'}
                        </span>
                      </div>

                      <div className="nearby-metrics-summary">
                        <div className="nearby-submetric">
                          <span className="submetric-lbl">Assigned:</span>
                          <span className="submetric-val">{hasNearData ? phc.totalAssigned : 'Unavailable'}</span>
                        </div>
                        <div className="nearby-submetric">
                          <span className="submetric-lbl">Present:</span>
                          <span className="submetric-val">{hasNearData ? phc.present : 'Unavailable'}</span>
                        </div>
                        <div className="nearby-submetric">
                          <span className="submetric-lbl">On Duty:</span>
                          <span className="submetric-val">{hasNearData ? (phc.onDuty ?? (phc.present + phc.late)) : 'Unavailable'}</span>
                        </div>
                        <div className="nearby-submetric">
                          <span className="submetric-lbl">Rate:</span>
                          <span className="submetric-val">{hasNearData && phc.attendancePercentage !== null ? `${phc.attendancePercentage}%` : 'Unavailable'}</span>
                        </div>
                      </div>

                      <div className="nearby-reason-box">
                        {phc.reason}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="nearby-empty-state">
                <p>No surrounding facilities with active coordinate data available.</p>
              </div>
            )}
          </div>

          {/* Human Approval & Administrative Authority Boundary Banner */}
          <div className="personnel-governance-banner">
            <div className="gov-icon-wrapper">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div className="gov-body">
              <h3 className="gov-title">Decision Support Only — Administrative Authority Required</h3>
              <p className="gov-text">
                MedPulse Workforce Intelligence provides decision support and capacity visibility only. The system does not automatically transfer staff, reassign shifts, modify personnel records, or alter attendance logs. Any personnel rebalancing requires explicit human authorization and administrative approval.
              </p>
              <div className="gov-tags">
                <span className="gov-tag">🔒 Zero Automated Reassignment</span>
                <span className="gov-tag">📋 Administrative Authorization Required</span>
                <span className="gov-tag">🛡️ Read-Only Visibility</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
