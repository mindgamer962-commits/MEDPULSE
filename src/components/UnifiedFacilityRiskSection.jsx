import React, { useState, useEffect, useRef } from 'react';
import { getFacilityUnifiedRisk, UNIFIED_RISK_STATUS } from '../services/unifiedFacilityRisk.js';
import { getFootfallStats } from '../services/db.js';
import { getPHCBedAvailability } from '../services/beds.js';
import {
  calculateFederatedDemandForecast,
  compareDemandForecasts,
  FEDERATED_MODEL_METADATA
} from '../services/federatedForecast.js';
import './UnifiedFacilityRiskSection.css';

/**
 * Unified Facility Risk Section
 *
 * Consolidates Medicine stock-out risk, Bed capacity risk, Personnel attendance risk,
 * and Federated Demand Forecast into a single, explainable facility-level operational overview.
 * Zero Firestore writes during inference. Reuses existing domain calculations.
 */
export default function UnifiedFacilityRiskSection({
  phcs = [],
  selectedPhcId = '',
  medicines = [],
  medicineResults = null,
  initialTargetDate = '2026-09-14',
  admissionRate = 8,
  mockUnifiedResult = null,
  mockAiExplanation = null,
  mockFederatedForecast = null,
  onSelectPhc = null
}) {
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unifiedData, setUnifiedData] = useState(mockUnifiedResult);
  const [expandedSection, setExpandedSection] = useState(null); // 'medicine' | 'beds' | 'personnel' | null
  const [federatedSignal, setFederatedSignal] = useState(null);

  // AI Operational Explanation State
  const [aiExplanation, setAiExplanation] = useState(mockAiExplanation?.explanation || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(mockAiExplanation?.available !== false);

  const activePHC = phcs.find((p) => p.phc_id === selectedPhcId) || null;
  const phcName = activePHC?.name || activePHC?.phc_name || selectedPhcId || 'Unknown Facility';
  const districtName = activePHC?.district || activePHC?.district_name || 'General';
  const stateName = activePHC?.state || activePHC?.state_name || 'Rajasthan';

  const aiRequestIdRef = useRef(0);

  // Clear stale state when PHC, targetDate, or mock inputs change
  useEffect(() => {
    aiRequestIdRef.current++; // Invalidate any in-flight AI requests
    if (mockAiExplanation) {
      setAiExplanation(mockAiExplanation.explanation || null);
      setAiAvailable(mockAiExplanation.available !== false);
      setAiError(null);
    } else {
      setAiExplanation(null);
      setAiError(null);
      setAiAvailable(true);
    }
  }, [selectedPhcId, targetDate, mockAiExplanation]);

  const handleGenerateAIExplanation = async () => {
    if (!selectedPhcId || aiLoading) return;
    const currentRequestId = ++aiRequestIdRef.current;
    setAiLoading(true);
    setAiError(null);
    setAiExplanation(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/ai/explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phcId: selectedPhcId,
          targetDate,
          admissionRate
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const insight = await response.json();
      if (aiRequestIdRef.current === currentRequestId) {
        if (insight && insight.available !== false && insight.explanation) {
          setAiExplanation(insight.explanation);
          setAiAvailable(true);
        } else {
          setAiExplanation(null);
          setAiAvailable(false);
        }
      }
    } catch (err) {
      console.error('Multi-resource AI explanation request failed:', err);
      if (aiRequestIdRef.current === currentRequestId) {
        setAiExplanation(null);
        setAiAvailable(false);
        setAiError('AI explanation temporarily unavailable.');
      }
    } finally {
      if (aiRequestIdRef.current === currentRequestId) {
        setAiLoading(false);
      }
    }
  };

  // Track active evaluation request to prevent race conditions during rapid PHC switching
  const evalIdRef = useRef(0);

  useEffect(() => {
    // If mock result is provided for testing, use it immediately
    if (mockUnifiedResult) {
      setUnifiedData(mockUnifiedResult);
      setLoading(false);
      setError(null);
      return;
    }

    if (!selectedPhcId) {
      setUnifiedData(null);
      setLoading(false);
      return;
    }

    const currentEvalId = ++evalIdRef.current;
    setLoading(true);
    setError(null);
    setUnifiedData(null); // Clear stale results immediately

    async function fetchUnifiedRisk() {
      try {
        const result = await getFacilityUnifiedRisk(selectedPhcId, {
          targetDate,
          admissionRate,
          phc: activePHC,
          medicines: medicines.length > 0 ? medicines : undefined,
          medicineResults: (medicineResults && medicineResults.length > 0) ? medicineResults : undefined
        });

        if (evalIdRef.current === currentEvalId) {
          setUnifiedData(result);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to calculate unified facility risk:', err);
        if (evalIdRef.current === currentEvalId) {
          setError('Unable to calculate unified facility risk.');
          setLoading(false);
        }
      }
    }

    fetchUnifiedRisk();
  }, [selectedPhcId, targetDate, admissionRate, mockUnifiedResult, activePHC, medicines, medicineResults]);

  // Resolve Federated Forecast Signal
  useEffect(() => {
    let isMounted = true;

    if (mockFederatedForecast) {
      const comp = mockFederatedForecast.comparison || compareDemandForecasts(
        mockFederatedForecast.deterministicDemand ?? null,
        mockFederatedForecast
      );
      setFederatedSignal({
        available: mockFederatedForecast.available ?? (mockFederatedForecast.forecastDemand !== null),
        modelVersion: mockFederatedForecast.modelVersion || FEDERATED_MODEL_METADATA.modelVersion,
        forecastDemand: mockFederatedForecast.forecastDemand ?? null,
        dataStatus: mockFederatedForecast.dataStatus || (mockFederatedForecast.forecastDemand !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA'),
        comparison: comp
      });
      return;
    }

    if (!selectedPhcId || !unifiedData) {
      setFederatedSignal(null);
      return;
    }

    async function evaluateFederatedSignal() {
      try {
        // 1. Authoritative Footfall Data
        let footfallStats = null;
        try {
          footfallStats = await getFootfallStats(selectedPhcId, targetDate);
        } catch {
          footfallStats = null;
        }

        const recentFootfallAvg = footfallStats?.last7DaysAvg ?? null;
        let footfallTrendRatio = footfallStats?.trendRatio ?? null;
        if (!footfallTrendRatio && footfallStats?.last7DaysAvg && footfallStats?.prev7DaysAvg && footfallStats.prev7DaysAvg > 0) {
          footfallTrendRatio = parseFloat((footfallStats.last7DaysAvg / footfallStats.prev7DaysAvg).toFixed(4));
        }

        // 2. Authoritative Bed Availability & Occupancy Rate
        let currentOccupancyRate = null;
        try {
          const bedData = await getPHCBedAvailability(selectedPhcId);
          if (bedData && bedData.data_available && bedData.beds) {
            const totalBeds = bedData.beds.total_beds;
            const occupiedBeds = bedData.beds.occupied_beds;
            if (
              typeof totalBeds === 'number' &&
              totalBeds > 0 &&
              typeof occupiedBeds === 'number' &&
              occupiedBeds >= 0 &&
              occupiedBeds <= totalBeds
            ) {
              currentOccupancyRate = parseFloat((occupiedBeds / totalBeds).toFixed(4));
            }
          }
        } catch {
          currentOccupancyRate = null;
        }

        // 3. Operational Seasonal Factor (Baseline standard index)
        const seasonalFactor = 1.0;

        // 4. Federated Pure Inference
        const fedResult = calculateFederatedDemandForecast({
          targetDate,
          recentFootfallAvg,
          footfallTrendRatio,
          currentOccupancyRate,
          seasonalFactor
        });

        // 5. Deterministic demand for explanatory comparison
        const detDemand = recentFootfallAvg;
        const comparison = compareDemandForecasts(detDemand, fedResult);

        if (isMounted) {
          setFederatedSignal({
            ...fedResult,
            comparison
          });
        }
      } catch (err) {
        console.warn('Failed to calculate federated signal:', err);
        if (isMounted) {
          setFederatedSignal({
            available: false,
            modelVersion: FEDERATED_MODEL_METADATA.modelVersion,
            forecastDemand: null,
            dataStatus: 'INSUFFICIENT_DATA',
            comparison: {
              deterministicDemand: null,
              federatedDemand: null,
              divergence: null,
              direction: 'UNAVAILABLE'
            }
          });
        }
      }
    }

    evaluateFederatedSignal();

    return () => {
      isMounted = false;
    };
  }, [selectedPhcId, targetDate, unifiedData, mockFederatedForecast]);

  const toggleSection = (section) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const getStatusText = (status) => {
    switch (status) {
      case UNIFIED_RISK_STATUS.CRITICAL:
        return 'CRITICAL';
      case UNIFIED_RISK_STATUS.AT_RISK:
        return 'AT RISK';
      case UNIFIED_RISK_STATUS.SAFE:
        return 'SAFE';
      case UNIFIED_RISK_STATUS.INSUFFICIENT_DATA:
      default:
        return 'UNAVAILABLE';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case UNIFIED_RISK_STATUS.CRITICAL:
        return 'status-critical';
      case UNIFIED_RISK_STATUS.AT_RISK:
        return 'status-at_risk';
      case UNIFIED_RISK_STATUS.SAFE:
        return 'status-safe';
      default:
        return 'status-insufficient_data';
    }
  };

  const getHeroRiskClass = (overallRisk) => {
    switch (overallRisk) {
      case UNIFIED_RISK_STATUS.CRITICAL:
        return 'risk-critical';
      case UNIFIED_RISK_STATUS.AT_RISK:
        return 'risk-at_risk';
      case UNIFIED_RISK_STATUS.SAFE:
        return 'risk-safe';
      default:
        return 'risk-insufficient_data';
    }
  };

  const getHeroBadgeClass = (overallRisk) => {
    switch (overallRisk) {
      case UNIFIED_RISK_STATUS.CRITICAL:
        return 'badge-critical';
      case UNIFIED_RISK_STATUS.AT_RISK:
        return 'badge-at_risk';
      case UNIFIED_RISK_STATUS.SAFE:
        return 'badge-safe';
      default:
        return 'badge-insufficient_data';
    }
  };

  return (
    <section className="unified-risk-container" aria-label="Unified Facility Risk Section">
      {/* 1. Facility Context Header */}
      <div className="unified-risk-header">
        <div className="unified-risk-title-group">
          <h2 className="unified-risk-heading">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary, #1d4ed8)' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Unified Facility Risk
          </h2>
          <div className="unified-facility-meta">
            <span className="meta-item">
              <span className="meta-label">PHC:</span> {phcName}
            </span>
            <span>•</span>
            <span className="meta-item">
              <span className="meta-label">District:</span> {districtName}
            </span>
            <span>•</span>
            <span className="meta-item">
              <span className="meta-label">State:</span> {stateName}
            </span>
          </div>
        </div>

        <div className="unified-risk-controls">
          <div className="unified-date-picker-group">
            <label htmlFor="unified-target-date">Target Date:</label>
            <input
              id="unified-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              aria-label="Target Date for Facility Evaluation"
            />
          </div>
        </div>
      </div>

      {/* 2. Loading / Error / Data Content */}
      {loading && (
        <div className="unified-loading-state" data-testid="unified-loading">
          <div className="unified-spinner"></div>
          <div>Calculating facility risk...</div>
        </div>
      )}

      {error && !loading && (
        <div className="unified-error-state" data-testid="unified-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-critical, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ color: 'var(--color-critical, #ef4444)', fontWeight: 600 }}>{error}</div>
        </div>
      )}

      {!loading && !error && unifiedData && (
        <>
          {/* 3. Overall Risk Hero Banner */}
          <div className={`overall-risk-hero ${getHeroRiskClass(unifiedData.overallRisk)}`} data-testid="overall-risk-hero">
            <div className="overall-risk-top">
              <div className="overall-risk-label">Overall Facility Risk</div>
              <div className={`overall-risk-badge ${getHeroBadgeClass(unifiedData.overallRisk)}`} data-testid="overall-risk-badge">
                {unifiedData.overallRisk === UNIFIED_RISK_STATUS.CRITICAL && '🔴 '}
                {unifiedData.overallRisk === UNIFIED_RISK_STATUS.AT_RISK && '🟡 '}
                {unifiedData.overallRisk === UNIFIED_RISK_STATUS.SAFE && '🟢 '}
                {unifiedData.overallRisk === UNIFIED_RISK_STATUS.INSUFFICIENT_DATA && '⚠️ '}
                {unifiedData.overallRisk === UNIFIED_RISK_STATUS.INSUFFICIENT_DATA
                  ? 'UNIFIED RISK UNAVAILABLE'
                  : getStatusText(unifiedData.overallRisk)}
              </div>
            </div>

            <div className="overall-risk-reason" data-testid="overall-risk-reason">
              {unifiedData.reason}
            </div>

            {unifiedData.riskDrivers && unifiedData.riskDrivers.length > 0 && (
              <div className="overall-risk-drivers" data-testid="overall-risk-drivers">
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>Primary Drivers:</span>
                {unifiedData.riskDrivers.map((driver) => (
                  <span key={driver} className="driver-pill">
                    {driver}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 4. Three Component Signals Grid */}
          <div className="unified-components-grid">
            {/* Component A: Medicine */}
            <div className={`unified-component-card ${getStatusBadgeClass(unifiedData.medicine.risk).replace('status-', 'card-')}`} data-testid="component-medicine">
              <div className="component-card-top">
                <div className="component-title-group">
                  <div className="component-icon" style={{ color: 'var(--color-primary, #1d4ed8)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </div>
                  <span className="component-title">Medicine Supply</span>
                </div>
                <span className={`component-status-badge ${getStatusBadgeClass(unifiedData.medicine.risk)}`}>
                  {getStatusText(unifiedData.medicine.risk)}
                </span>
              </div>

              <div className="component-summary-text">
                {unifiedData.medicine.risk === UNIFIED_RISK_STATUS.CRITICAL && unifiedData.medicine.details?.medicineRiskDrivers?.length > 0
                  ? `Critical stock-out predicted for: ${unifiedData.medicine.details.medicineRiskDrivers.join(', ')}.`
                  : unifiedData.medicine.risk === UNIFIED_RISK_STATUS.AT_RISK && unifiedData.medicine.details?.medicineRiskDrivers?.length > 0
                  ? `Elevated stock risk detected for: ${unifiedData.medicine.details.medicineRiskDrivers.join(', ')}.`
                  : unifiedData.medicine.risk === UNIFIED_RISK_STATUS.SAFE
                  ? 'All monitored essential medicines have adequate stock coverage.'
                  : 'Medicine inventory and forecast data is incomplete or unavailable.'}
              </div>

              <button
                type="button"
                className="component-toggle-btn"
                onClick={() => toggleSection('medicine')}
                aria-expanded={expandedSection === 'medicine'}
              >
                {expandedSection === 'medicine' ? '▲ Hide Details' : '▼ View Details'}
              </button>

              {expandedSection === 'medicine' && (
                <div className="component-expanded-details" data-testid="details-medicine">
                  <div className="details-row">
                    <span>Monitored Medicines:</span>
                    <span className="row-val">{unifiedData.medicine.details?.totalMonitored ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>Evaluated Medicines:</span>
                    <span className="row-val">{unifiedData.medicine.details?.evaluatedCount ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>Critical Items:</span>
                    <span className="row-val" style={{ color: '#ef4444' }}>
                      {unifiedData.medicine.details?.criticalMedicines?.length ?? 0}
                    </span>
                  </div>
                  <div className="details-row">
                    <span>At-Risk Items:</span>
                    <span className="row-val" style={{ color: '#f59e0b' }}>
                      {unifiedData.medicine.details?.atRiskMedicines?.length ?? 0}
                    </span>
                  </div>
                  <div className="details-row">
                    <span>Safe Items:</span>
                    <span className="row-val" style={{ color: '#22c55e' }}>
                      {unifiedData.medicine.details?.safeMedicines?.length ?? 0}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Component B: Beds */}
            <div className={`unified-component-card ${getStatusBadgeClass(unifiedData.beds.risk).replace('status-', 'card-')}`} data-testid="component-beds">
              <div className="component-card-top">
                <div className="component-title-group">
                  <div className="component-icon" style={{ color: '#8b5cf6' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4v16" />
                      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                      <path d="M2 17h20" />
                      <path d="M6 8v9" />
                    </svg>
                  </div>
                  <span className="component-title">Bed Capacity</span>
                </div>
                <span className={`component-status-badge ${getStatusBadgeClass(unifiedData.beds.risk)}`}>
                  {getStatusText(unifiedData.beds.risk)}
                </span>
              </div>

              <div className="component-summary-text">
                {unifiedData.beds.risk === UNIFIED_RISK_STATUS.CRITICAL
                  ? `Over capacity predicted. Shortage expected on ${unifiedData.beds.details?.earliestPredictedShortage || 'upcoming days'}.`
                  : unifiedData.beds.risk === UNIFIED_RISK_STATUS.AT_RISK
                  ? 'Capacity margin is tight based on projected patient admission rate.'
                  : unifiedData.beds.risk === UNIFIED_RISK_STATUS.SAFE
                  ? `Sufficient bed capacity available (${unifiedData.beds.details?.currentAvailableBeds ?? 'adequate'} beds).`
                  : 'Bed capacity or forecast data is incomplete or unavailable.'}
              </div>

              <button
                type="button"
                className="component-toggle-btn"
                onClick={() => toggleSection('beds')}
                aria-expanded={expandedSection === 'beds'}
              >
                {expandedSection === 'beds' ? '▲ Hide Details' : '▼ View Details'}
              </button>

              {expandedSection === 'beds' && (
                <div className="component-expanded-details" data-testid="details-beds">
                  <div className="details-row">
                    <span>Available Beds:</span>
                    <span className="row-val">{unifiedData.beds.details?.currentAvailableBeds ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>Forecast Status:</span>
                    <span className="row-val">{unifiedData.beds.originalStatus ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>Earliest Shortage:</span>
                    <span className="row-val">{unifiedData.beds.details?.earliestPredictedShortage || 'None predicted'}</span>
                  </div>
                  <div className="details-row">
                    <span>Forecast Horizon:</span>
                    <span className="row-val">3-Day Window ({admissionRate}% rate)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Component C: Personnel */}
            <div className={`unified-component-card ${getStatusBadgeClass(unifiedData.personnel.risk).replace('status-', 'card-')}`} data-testid="component-personnel">
              <div className="component-card-top">
                <div className="component-title-group">
                  <div className="component-icon" style={{ color: 'var(--color-success, #10b981)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <span className="component-title">Personnel Attendance</span>
                </div>
                <span className={`component-status-badge ${getStatusBadgeClass(unifiedData.personnel.risk)}`}>
                  {getStatusText(unifiedData.personnel.risk)}
                </span>
              </div>

              <div className="component-summary-text">
                {unifiedData.personnel.risk === UNIFIED_RISK_STATUS.CRITICAL
                  ? `Critical staffing deficit (${unifiedData.personnel.details?.attendancePercentage?.toFixed(1) ?? '<75'}% workforce attendance).`
                  : unifiedData.personnel.risk === UNIFIED_RISK_STATUS.AT_RISK
                  ? `Moderate staffing constraint (${unifiedData.personnel.details?.attendancePercentage?.toFixed(1) ?? '75-90'}% workforce attendance).`
                  : unifiedData.personnel.risk === UNIFIED_RISK_STATUS.SAFE
                  ? `Adequate staffing coverage (${unifiedData.personnel.details?.attendancePercentage?.toFixed(1) ?? '≥90'}% workforce attendance).`
                  : 'Personnel attendance records are incomplete or missing for this date.'}
              </div>

              <button
                type="button"
                className="component-toggle-btn"
                onClick={() => toggleSection('personnel')}
                aria-expanded={expandedSection === 'personnel'}
              >
                {expandedSection === 'personnel' ? '▲ Hide Details' : '▼ View Details'}
              </button>

              {expandedSection === 'personnel' && (
                <div className="component-expanded-details" data-testid="details-personnel">
                  <div className="details-row">
                    <span>Assigned Staff:</span>
                    <span className="row-val">{unifiedData.personnel.details?.metrics?.totalAssigned ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>On Duty / Present:</span>
                    <span className="row-val">{unifiedData.personnel.details?.metrics?.present ?? 'N/A'}</span>
                  </div>
                  <div className="details-row">
                    <span>Late:</span>
                    <span className="row-val">{unifiedData.personnel.details?.metrics?.late ?? 0}</span>
                  </div>
                  <div className="details-row">
                    <span>Absent:</span>
                    <span className="row-val" style={{ color: '#ef4444' }}>
                      {unifiedData.personnel.details?.metrics?.absent ?? 0}
                    </span>
                  </div>
                  <div className="details-row">
                    <span>Authorized Leave:</span>
                    <span className="row-val">{unifiedData.personnel.details?.metrics?.authorizedLeave ?? 0}</span>
                  </div>
                  <div className="details-row">
                    <span>Attendance Rate:</span>
                    <span className="row-val">
                      {unifiedData.personnel.details?.attendancePercentage !== null && unifiedData.personnel.details?.attendancePercentage !== undefined
                        ? `${unifiedData.personnel.details.attendancePercentage.toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="details-row">
                    <span>Workforce Status:</span>
                    <span className="row-val">{unifiedData.personnel.originalStatus ?? 'N/A'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Federated Demand Forecast Signal (Additional Intelligence) */}
          <div className="unified-federated-card" data-testid="unified-federated-signal">
            <div className="federated-card-header">
              <div className="federated-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#0284c7' }}>
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                <span>Federated Forecast Signal</span>
                <span className="federated-non-auth-pill">Additional Predictive Signal</span>
              </div>
              <span className="federated-version-tag">v{federatedSignal?.modelVersion || '1.0.0'}</span>
            </div>

            <div className="federated-card-body">
              {federatedSignal?.available ? (
                <div className="federated-stats-row">
                  <div className="federated-stat-item">
                    <span className="federated-stat-label">Federated Forecast:</span>
                    <span className="federated-stat-val" data-testid="federated-demand-val">
                      {federatedSignal.forecastDemand} units/day
                    </span>
                  </div>
                  {federatedSignal.comparison?.deterministicDemand !== null && (
                    <div className="federated-stat-item">
                      <span className="federated-stat-label">Deterministic Demand:</span>
                      <span className="federated-stat-val">
                        {federatedSignal.comparison.deterministicDemand} units/day
                      </span>
                    </div>
                  )}
                  {federatedSignal.comparison?.divergence !== null && (
                    <div className="federated-stat-item">
                      <span className="federated-stat-label">Divergence:</span>
                      <span className={`federated-stat-val ${federatedSignal.comparison.divergence > 0 ? 'text-higher' : federatedSignal.comparison.divergence < 0 ? 'text-lower' : 'text-aligned'}`} data-testid="federated-divergence-val">
                        {federatedSignal.comparison.divergence > 0 ? `+${federatedSignal.comparison.divergence}` : federatedSignal.comparison.divergence} units ({federatedSignal.comparison.direction})
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="federated-insufficient-notice" data-testid="federated-insufficient-notice">
                  <span className="insufficient-dot">⚠️</span>
                  <span>Federated forecast signal is currently unavailable (Insufficient operational signals). Authoritative deterministic risk engine is operating normally.</span>
                </div>
              )}
            </div>
          </div>

          {/* 5. Multi-Resource AI Operational Explanation */}
          <div className="unified-ai-section" data-testid="unified-ai-section">
            <div className="unified-ai-btn-container">
              <button
                type="button"
                className="unified-ai-btn"
                onClick={handleGenerateAIExplanation}
                disabled={aiLoading || !selectedPhcId}
                data-testid="generate-operational-ai-btn"
              >
                {aiLoading ? (
                  <>
                    <span className="unified-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Generating operational explanation...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    </svg>
                    Generate Operational Explanation
                  </>
                )}
              </button>
            </div>

            {aiLoading && (
              <div className="unified-ai-loading" data-testid="unified-ai-loading">
                <span className="unified-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span>Generating operational explanation...</span>
              </div>
            )}

            {aiError && (
              <div className="unified-data-alert" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }} data-testid="unified-ai-error">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>{aiError}</div>
              </div>
            )}

            {aiExplanation && (
              <div className="unified-ai-card" data-testid="unified-ai-card">
                <div className="unified-ai-card-header">
                  <div className="unified-ai-card-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    </svg>
                    <span>AI Operational Explanation</span>
                  </div>
                  <span className="unified-ai-badge">Powered by Gemini 2.5 Flash</span>
                </div>
                <div className="unified-ai-body" data-testid="unified-ai-body">
                  {aiExplanation}
                </div>
                <div className="unified-ai-footer">
                  <span>AI-generated operational explanation based on MedPulse's calculated facility signals.</span>
                </div>
              </div>
            )}
          </div>

          {/* 6. Data Quality & Truthful Governance Section */}
          <div className="unified-governance-footer">
            {!unifiedData.dataQuality?.isComplete && (
              <div className="unified-data-alert" data-testid="unified-data-alert">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <strong>Data Quality Notice:</strong>{' '}
                  Unified facility risk cannot be determined because required data is unavailable or insufficient for:{' '}
                  {unifiedData.dataQuality?.missingComponents?.map((c) => c.toLowerCase()).join(' and ')}.
                </div>
              </div>
            )}

            <div className="unified-provenance-text">
              Unified facility risk combines existing medicine, bed-capacity, and personnel risk signals. It is a MedPulse decision-support indicator, not an official government classification. Workforce attendance data is prototype data constructed for system demonstration purposes.
            </div>
          </div>
        </>
      )}
    </section>
  );
}
