import React, { useState, useEffect } from 'react';
import { prepareBedMigration, executeBedMigration, verifyBedMigration } from '../services/migration.js';

export default function MigrationPreview({ phcs }) {
  const [report, setReport] = useState(null);
  
  // Execution state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null); // SUCCESS or FAILED
  const [executionError, setExecutionError] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null); // The full verification report object

  useEffect(() => {
    if (phcs && phcs.length > 0 && !executionResult) {
      const result = prepareBedMigration(phcs);
      setReport(result);
    }
  }, [phcs, executionResult]);

  const handleExecuteMigration = async () => {
    if (!report || report.status !== 'SUCCESS') return;
    
    setIsExecuting(true);
    setShowConfirmModal(false);
    setExecutionResult(null);
    setExecutionError(null);
    setVerificationResult(null);

    try {
      // 1. Execute Migration
      await executeBedMigration(report.records);
      setExecutionResult("SUCCESS");
      
      // 2. Read-back Verification
      const verifyReport = await verifyBedMigration(report.records);
      setVerificationResult(verifyReport);
      
    } catch (err) {
      console.error(err);
      setExecutionResult("FAILED");
      setExecutionError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!report) {
    return (
      <div className="migration-preview" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)' }}>Loading PHC Data...</p>
      </div>
    );
  }

  return (
    <div className="migration-workspace" style={{ padding: '2rem' }}>
      
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              ⚠️ Confirm Database Write
            </h2>
            <p style={{ fontSize: '1.1rem', marginBottom: '2rem' }}>
              Are you sure you want to write these <strong>28</strong> validated bed records to Firestore?
            </p>
            <div className="dialog-buttons" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowConfirmModal(false)} disabled={isExecuting}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-critical)', borderColor: 'var(--color-critical)' }} onClick={handleExecuteMigration} disabled={isExecuting}>
                {isExecuting ? "Executing..." : "Confirm Migration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Results UI */}
      {executionResult && (
        <div style={{ marginBottom: '2rem' }}>
          {executionResult === 'SUCCESS' ? (
            <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-safe)', borderRadius: '8px', padding: '1.5rem', marginBottom: '1rem' }}>
              <h2 style={{ color: 'var(--color-safe)', margin: '0 0 0.5rem 0' }}>MIGRATION SUCCESSFUL</h2>
              <p style={{ margin: '0 0 1rem 0' }}>Records written: <strong>28</strong> into <code>beds/&#123;phc_id&#125;</code></p>
              
              {verificationResult ? (
                verificationResult.status === "VERIFIED" ? (
                  <h3 style={{ color: 'var(--color-safe)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    MIGRATION VERIFIED
                  </h3>
                ) : (
                  <h3 style={{ color: 'var(--color-warning)', margin: '0 0 1rem 0' }}>
                    Migration completed but verification failed.
                  </h3>
                )
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px' }}></div> Verifying...
                </div>
              )}

              {/* Per-PHC Verification List */}
              {verificationResult && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '1rem' }}>
                  {verificationResult.records.map((r, i) => (
                    <div key={i} style={{ padding: '0.5rem', border: `1px solid ${r.match ? 'var(--color-safe)' : 'var(--color-critical)'}`, borderRadius: '4px', backgroundColor: 'var(--color-bg)' }}>
                      <strong style={{ display: 'block', fontSize: '0.85rem' }}>{r.phc_id}</strong>
                      <span style={{ fontSize: '0.8rem', color: r.match ? 'var(--color-safe)' : 'var(--color-critical)' }}>
                        {r.match ? "✓ migrated" : `❌ ${r.reason || 'failed'}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-critical)', borderRadius: '8px', padding: '1.5rem' }}>
              <h2 style={{ color: 'var(--color-critical)', margin: '0 0 0.5rem 0' }}>MIGRATION FAILED</h2>
              <p>The atomic batch operation did not commit successfully. It is safe to retry once the error is resolved.</p>
              <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: '4px', border: '1px solid var(--color-border)', color: 'var(--color-critical)', fontFamily: 'monospace', marginTop: '1rem' }}>
                Error: {executionError}
              </div>
            </div>
          )}
        </div>
      )}

      {report.status === "FAILED" ? (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-critical)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ color: 'var(--color-critical)', margin: '0 0 1rem 0' }}>Migration Preparation Failed</h2>
          <p>The live PHC dataset does not match the expected configuration for this prototype.</p>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><strong>Expected PHCs:</strong> {report.expectedPHCs}</li>
            <li><strong>Actual PHCs found:</strong> {report.actualPHCs}</li>
            {report.missingPHCs?.length > 0 && <li><strong style={{ color: 'var(--color-critical)' }}>Missing PHCs:</strong> {report.missingPHCs.join(', ')}</li>}
            {report.unexpectedPHCs?.length > 0 && <li><strong style={{ color: 'var(--color-critical)' }}>Unexpected PHCs:</strong> {report.unexpectedPHCs.join(', ')}</li>}
            {report.duplicatePHCs?.length > 0 && <li><strong style={{ color: 'var(--color-critical)' }}>Duplicate PHCs:</strong> {report.duplicatePHCs.join(', ')}</li>}
            {report.invalidRecords > 0 && <li><strong style={{ color: 'var(--color-critical)' }}>Invalid Generated Records:</strong> {report.invalidRecords}</li>}
          </ul>
        </div>
      ) : (
        <>
          {/* Main Approval Header */}
          {!executionResult && (
            <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  BED MIGRATION — READY FOR APPROVAL
                </h1>
                <p style={{ fontSize: '1rem', color: 'var(--color-warning)', fontWeight: 'bold', margin: '0' }}>
                  ⚠️ This action will write 28 bed records to Firestore (<code>beds/&#123;phc_id&#125;</code>)
                </p>
              </div>
              <button 
                className="btn btn-primary" 
                style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}
                disabled={report.status !== 'SUCCESS' || isExecuting}
                onClick={() => setShowConfirmModal(true)}
              >
                Approve & Execute Migration
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Total PHCs</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{report.totalPHCs}</div>
            </div>
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Valid Records</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-safe)' }}>{report.validRecords}</div>
            </div>
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Total Beds</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{report.summary.total_beds}</div>
            </div>
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Total Available</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{report.summary.total_available_beds}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ flex: 1, padding: '1rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-safe)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-safe)' }}>{report.summary.safe_count}</div>
              <div style={{ fontSize: '0.85rem' }}>SAFE</div>
            </div>
            <div style={{ flex: 1, padding: '1rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', border: '1px solid var(--color-warning)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-warning)' }}>{report.summary.at_risk_count}</div>
              <div style={{ fontSize: '0.85rem' }}>AT RISK</div>
            </div>
            <div style={{ flex: 1, padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-critical)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-critical)' }}>{report.summary.critical_count}</div>
              <div style={{ fontSize: '0.85rem' }}>CRITICAL</div>
            </div>
          </div>

          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Proposed Bed Configurations</h2>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                <tr>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>PHC</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Total</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Occupied</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Available</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Emergency</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>ICU</th>
                  <th style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.records.map((r) => (
                  <tr key={r.phc_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 'bold' }}>{r.phc_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{r.phc_id}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>{r.total_beds}</td>
                    <td style={{ padding: '1rem' }}>{r.occupied_beds}</td>
                    <td style={{ padding: '1rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{r.available_beds}</td>
                    <td style={{ padding: '1rem' }}>{r.emergency_beds}</td>
                    <td style={{ padding: '1rem' }}>{r.icu_beds}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold',
                        backgroundColor: r.status === 'SAFE' ? 'rgba(34,197,94,0.1)' : r.status === 'AT_RISK' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
                        color: r.status === 'SAFE' ? 'var(--color-safe)' : r.status === 'AT_RISK' ? 'var(--color-warning)' : 'var(--color-critical)'
                      }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
