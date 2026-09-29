import React, { useState, useEffect } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { isConfigured } from "./firebase";
import {
  getPHCs,
  getMedicines,
  getInventory,
  recordStockTransaction,
  getFilteredStockTransactions,
  getDailyFootfall,
  recordDailyFootfall,
  checkForDuplicateFootfall,
  updateDailyFootfall,
  getFootfallStats,
  forecastDemand,
  predictStockOut,
  findSurplusPHCs,
  calculateTransferRecommendation,
  calculateTransportEstimate,
  generateTransferRecommendation,
  approveTransfer,
  rejectTransfer,
  setupDemoState,
  resetDemoState
} from "./services/db";
import { findNearestPHCs, findPHCsInSameDistrict, findPHCsInOtherDistricts, getPHCResourceAvailability } from "./services/network.js";
import { getPHCBedAvailability, getBedAvailabilityForPHCs, calculateBedStatus, calculateDynamicBedDemand, calculateCapacityStatus } from "./services/beds.js";
import { forecastBedDemand } from "./services/bedForecast.js";
import MigrationPreview from "./components/MigrationPreview.jsx";
import PersonnelWorkspace from "./components/PersonnelWorkspace.jsx";
import UnifiedFacilityRiskSection from "./components/UnifiedFacilityRiskSection.jsx";
import "./App.css";

function App() {
  // Navigation Tabs: 'overview', 'inventory', 'footfall', 'forecast', 'network', 'personnel', 'migration'
  const [activeWorkspace, setActiveWorkspace] = useState("overview");
  const [overviewData, setOverviewData] = useState([]);
  
  // Bed Capacity State
  const [bedData, setBedData] = useState({
    loading: false,
    data_available: false,
    beds: null,
    status: null,
    error: null
  });
  const [bedForecastData, setBedForecastData] = useState({
    loading: false,
    data: null,
    error: null
  });
  const [isBedDemoMode, setIsBedDemoMode] = useState(false);
  const [demoUseOverride, setDemoUseOverride] = useState(false);
  const [demoFootfallOverride, setDemoFootfallOverride] = useState(10000);
  const [demoAdmissionRate, setDemoAdmissionRate] = useState(8);
  const [capacityNearbyPhcs, setCapacityNearbyPhcs] = useState([]);

  // Network states
  const [networkData, setNetworkData] = useState({
    nearby: [],
    sameDistrict: [],
    otherDistricts: [],
    resources: { data_available: false, resources: {} }
  });

  // Baselines
  const [phcs, setPhcs] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [selectedPhcId, setSelectedPhcId] = useState("");

  // Inventory states
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [formType, setFormType] = useState("RECEIVED");
  const [targetMedId, setTargetMedId] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [txDateInput, setTxDateInput] = useState("");
  const [txTimeInput, setTxTimeInput] = useState("");
  const [filterMedId, setFilterMedId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Footfall states
  const [footfallHistory, setFootfallHistory] = useState([]);
  const [ffStats, setFfStats] = useState({ todayPatients: 0, last7DaysTotal: 0, last7DaysAvg: 0, prev7DaysAvg: 0, trend: "" });
  const [ffDateInput, setFfDateInput] = useState("");
  const [ffCountInput, setFfCountInput] = useState("");
  const [filterFfStart, setFilterFfStart] = useState("");
  const [filterFfEnd, setFilterFfEnd] = useState("");

  // Duplicate prompt overlay state
  const [pendingDuplicate, setPendingDuplicate] = useState(null);

  // AI Forecast & Stock-out & Explanation states
  const [forecastMedId, setForecastMedId] = useState("");
  const [forecastResult, setForecastResult] = useState(null);
  const [stockOutResult, setStockOutResult] = useState(null);
  const [aiInsight, setAiInsight] = useState(null);
  const [surplusPHCs, setSurplusPHCs] = useState([]);
  const [finalRecommendation, setFinalRecommendation] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [demoStage, setDemoStage] = useState(0);

  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  // Load baseline PHCs and Medicines
  useEffect(() => {
    async function loadBaselines() {
      if (!isConfigured) return;
      try {
        const loadedPhcs = await getPHCs();
        const loadedMeds = await getMedicines();
        setPhcs(loadedPhcs);
        setMedicines(loadedMeds);
        
        // Default select to PHC Nakra if it exists, otherwise the first one
        const nakra = loadedPhcs.find((p) => p.phc_id === "phc-nakra");
        if (nakra) {
          setSelectedPhcId(nakra.phc_id);
        } else if (loadedPhcs.length > 0) {
          setSelectedPhcId(loadedPhcs[0].phc_id);
        }
      } catch (err) {
        console.error("Failed to load baseline data:", err);
        const isPermission = err?.code === 'permission-denied' || err?.message?.includes('permission');
        setErrorMessage(
          isPermission
            ? "Firestore access unavailable (permission-denied). Verify Cloud Firestore security rules on project medpulse-43e02."
            : "Firestore access unavailable. Check database connection and environment variables."
        );
      }
    }
    loadBaselines();
  }, []);

  // Fetch data depending on active context
  const fetchData = async () => {
    if (!selectedPhcId) return;
    setLoading(true);
    try {
      if (activeWorkspace === "inventory") {
        const phcInventory = await getInventory(selectedPhcId);
        setInventory(phcInventory);
        const phcTxs = await getFilteredStockTransactions(selectedPhcId);
        setTransactions(phcTxs);
      } else if (activeWorkspace === "footfall") {
        const allFfs = await getDailyFootfall();
        const phcFfs = allFfs.filter((f) => f.phc_id === selectedPhcId);
        phcFfs.sort((a, b) => b.date.toDate() - a.date.toDate());
        setFootfallHistory(phcFfs);
        const stats = await getFootfallStats(selectedPhcId);
        setFfStats(stats);
      } else if (activeWorkspace === "forecast") {
        setForecastResult(null);
        setStockOutResult(null);
        setAiInsight(null);
      } else if (activeWorkspace === "overview") {
        // Fetch Bed Data in parallel with overview metrics without blocking UI
        setBedData(prev => ({ ...prev, loading: true, error: null }));
        getPHCBedAvailability(selectedPhcId, isBedDemoMode).then(bedResponse => {
          let bedStatus = null;
          if (bedResponse.data_available && bedResponse.beds) {
            const statusResult = calculateBedStatus(bedResponse.beds);
            bedStatus = statusResult.status;
          }
          setBedData({
            loading: false,
            data_available: bedResponse.data_available,
            beds: bedResponse.beds,
            status: bedStatus,
            error: bedResponse.error || null
          });
        }).catch(err => {
          setBedData({
            loading: false,
            data_available: false,
            beds: null,
            status: null,
            error: "Unable to load bed data"
          });
        });
        
        setBedForecastData(prev => ({ ...prev, loading: true, error: null }));
        forecastBedDemand(selectedPhcId, demoAdmissionRate).then(forecastResult => {
           setBedForecastData({
             loading: false,
             data: forecastResult,
             error: null
           });
        }).catch(err => {
           setBedForecastData({
             loading: false,
             data: null,
             error: "Unable to load forecast data"
           });
        });

        const medsToFetch = medicines.length > 0 ? medicines : await getMedicines();
        const promises = medsToFetch.map(med => predictStockOut(selectedPhcId, med.medicine_id));
        const results = await Promise.all(promises);
        setOverviewData(results.filter(r => !r.error));
        const stats = await getFootfallStats(selectedPhcId);
        setFfStats(stats);
      } else if (activeWorkspace === "network") {
        const freshPhcs = await getPHCs();
        setPhcs(freshPhcs); // Update main state to avoid stale activePHC
        const nearbyData = await findNearestPHCs(selectedPhcId, 5, freshPhcs);
        const sameDist = await findPHCsInSameDistrict(selectedPhcId, freshPhcs);
        const otherDist = await findPHCsInOtherDistricts(selectedPhcId, freshPhcs);
        const resources = await getPHCResourceAvailability(selectedPhcId);
        
        let effectiveRadiusKm = 0;
        if (nearbyData.results && nearbyData.results.length > 0) {
          effectiveRadiusKm = nearbyData.results[nearbyData.results.length - 1].distance_km;
        }

        setNetworkData({ 
          nearby: nearbyData.results, 
          locationAvailable: nearbyData.location_available,
          effectiveRadiusKm,
          sameDistrict: sameDist, 
          otherDistricts: otherDist, 
          resources 
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Error querying database. Check connection.");
    } finally {
      setLastUpdated(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedPhcId, activeWorkspace, isBedDemoMode]);

  // Calculate dynamic bed demand and capacity gap for DEMO mode
  let currentFootfall = 0;
  if (ffStats && ffStats.last7DaysAvg) {
    currentFootfall = ffStats.last7DaysAvg;
  }
  const activeFootfall = demoUseOverride ? demoFootfallOverride : currentFootfall;
  let estimatedBedDemand = 0;
  let capacityStatus = null;
  let capacityGap = 0;

  if (bedData.data_available && bedData.beds) {
    try {
      const demandResult = calculateDynamicBedDemand(activeFootfall, demoAdmissionRate);
      estimatedBedDemand = demandResult.estimatedBedDemand;
      const statusResult = calculateCapacityStatus(estimatedBedDemand, bedData.beds.available_beds);
      capacityGap = statusResult.capacityGap;
      capacityStatus = statusResult.status;
    } catch (err) {
      console.error("Bed simulation calculation error:", err);
    }
  }

  // Fetch nearby beds if over capacity
  useEffect(() => {
    if (capacityGap <= 0 || !selectedPhcId) {
      setCapacityNearbyPhcs([]);
      return;
    }
    
    let isMounted = true;
    const fetchNearbyCapacity = async () => {
      try {
        const nearbyData = await findNearestPHCs(selectedPhcId, 5, phcs);
        if (nearbyData.results && nearbyData.results.length > 0) {
          const phcIds = nearbyData.results.map(p => p.phc_id);
          const bedAvail = await getBedAvailabilityForPHCs(phcIds, true);
          
          if (!isMounted) return;
          
          const nearbyWithBeds = nearbyData.results.map(p => ({
            ...p,
            bedData: bedAvail[p.phc_id] || { data_available: false }
          }));
          setCapacityNearbyPhcs(nearbyWithBeds);
        }
      } catch (err) {
        console.error("Failed to fetch nearby capacity", err);
      }
    };
    fetchNearbyCapacity();
    
    return () => { isMounted = false; };
  }, [capacityGap, isBedDemoMode, selectedPhcId, phcs]);

  // Demo Mode Handlers
  const handleEnterDemo = async () => {
    try {
      setLoading(true);
      const nakraId = phcs.find((p) => p.name === "PHC Nakra")?.phc_id;
      const orsId = medicines.find((m) => m.name === "ORS")?.medicine_id;
      if (nakraId && orsId) {
        setSelectedPhcId(nakraId);
        setForecastMedId(orsId);
        await setupDemoState(nakraId, orsId);
        await fetchData();
        setActiveWorkspace("demo");
        setDemoStage(1);
        setStatusMessage("🚨 Emergency Demo Mode Activated!");
      } else {
        setErrorMessage("Required test data (PHC Nakra / ORS) not found.");
      }
    } catch (e) {
      setErrorMessage("Failed to setup demo state: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDemo = async () => {
    try {
      setLoading(true);
      await resetDemoState();
      setDemoStage(0);
      setActiveWorkspace("inventory");
      setForecastResult(null);
      setStockOutResult(null);
      setSurplusPHCs([]);
      setFinalRecommendation(null);
      await fetchData();
      setStatusMessage("✅ Demo State Reset Successfully.");
    } catch (e) {
      setErrorMessage("Failed to reset demo state: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextDemoStage = async () => {
    if (!selectedPhcId || !forecastMedId) return;
    setLoading(true);
    try {
      if (demoStage === 1) {
        const forecast = await forecastDemand(selectedPhcId, forecastMedId);
        setForecastResult(forecast);
        setDemoStage(2);
      } else if (demoStage === 2) {
        const stockOut = await predictStockOut(selectedPhcId, forecastMedId);
        setStockOutResult(stockOut);
        setDemoStage(3);
      } else if (demoStage === 3) {
        const surplus = await findSurplusPHCs(selectedPhcId, forecastMedId);
        setSurplusPHCs(surplus);
        setDemoStage(4);
      } else if (demoStage === 4) {
        setDemoStage(5);
      } else if (demoStage === 5) {
        setDemoStage(6);
      } else if (demoStage === 6) {
        const rec = await generateTransferRecommendation(selectedPhcId, forecastMedId);
        setFinalRecommendation(rec);
        setDemoStage(7);
      } else if (demoStage === 7) {
        setDemoStage(8);
      }
    } catch (err) {
      setErrorMessage("Demo error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle inventory transactions
  const handleRecordTransaction = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!selectedPhcId || !targetMedId) {
      setErrorMessage("Please select a valid PHC and Medicine.");
      return;
    }

    const quantity = parseInt(qtyInput, 10);
    if (isNaN(quantity) || quantity <= 0) {
      setErrorMessage("Quantity must be a positive number greater than 0.");
      return;
    }

    let transactionDate = new Date();
    if (txDateInput) {
      const timeStr = txTimeInput || "12:00";
      transactionDate = new Date(`${txDateInput}T${timeStr}`);
    }

    try {
      const medInventory = inventory.find((item) => item.medicine_id === targetMedId);
      const currentStock = medInventory ? medInventory.currentStock : 0;

      if (formType === "USED" && quantity > currentStock) {
        setErrorMessage(`Insufficient stock. Available: ${currentStock} units.`);
        return;
      }

      setLoading(true);
      await recordStockTransaction({
        phc_id: selectedPhcId,
        medicine_id: targetMedId,
        transaction_type: formType,
        quantity: quantity,
        timestamp: transactionDate,
      });

      setStatusMessage(`Recorded ${quantity} units of ${medInventory?.name || targetMedId} as ${formType}.`);
      setQtyInput("");
      setTxDateInput("");
      setTxTimeInput("");
      await fetchData();
    } catch (err) {
      console.error(err);
      setErrorMessage(`Firestore failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle recording Patient Footfall
  const handleRecordFootfall = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setPendingDuplicate(null);

    if (!selectedPhcId) {
      setErrorMessage("Please select a valid PHC.");
      return;
    }
    if (!ffDateInput) {
      setErrorMessage("Please select a valid date.");
      return;
    }

    const count = parseInt(ffCountInput, 10);
    if (isNaN(count) || count < 0) {
      setErrorMessage("Patient count must be a non-negative number.");
      return;
    }

    try {
      setLoading(true);
      const existing = await checkForDuplicateFootfall(selectedPhcId, ffDateInput);
      
      if (existing) {
        setPendingDuplicate({
          footfall_id: existing.footfall_id,
          dateStr: ffDateInput,
          existingCount: existing.patient_count,
          newCount: count
        });
        setLoading(false);
        return;
      }

      await recordDailyFootfall({
        phc_id: selectedPhcId,
        date: new Date(ffDateInput),
        patient_count: count
      });

      setStatusMessage(`Successfully recorded patient count of ${count} for date ${ffDateInput}.`);
      setFfCountInput("");
      setFfDateInput("");
      await fetchData();
    } catch (err) {
      console.error(err);
      setErrorMessage(`Failed to save footfall: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle duplicate confirmation updates
  const handleConfirmDuplicateUpdate = async (shouldUpdate) => {
    if (!pendingDuplicate) return;
    setStatusMessage(null);
    setErrorMessage(null);

    const { footfall_id, newCount, dateStr } = pendingDuplicate;
    setPendingDuplicate(null);

    if (!shouldUpdate) return;

    try {
      setLoading(true);
      await updateDailyFootfall(footfall_id, newCount);
      setStatusMessage(`Successfully updated patient count to ${newCount} for date ${dateStr}.`);
      setFfCountInput("");
      setFfDateInput("");
      await fetchData();
    } catch (err) {
      console.error(err);
      setErrorMessage(`Failed to update footfall: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle demand forecasting, stock-out predictions, and Gemini Explanations
  const handleForecastDemand = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setForecastResult(null);
    setStockOutResult(null);
    setAiInsight(null);
    setSurplusPHCs([]);
    setFinalRecommendation(null);
    setShowConfirmModal(false);

    if (!selectedPhcId || !forecastMedId) {
      setErrorMessage("Please select a valid PHC and Medicine.");
      return;
    }

    try {
      setLoading(true);
      // 1. Run local forecasting service
      const forecast = await forecastDemand(selectedPhcId, forecastMedId);
      setForecastResult(forecast);
      
      if (!forecast.error) {
        // 2. Run local stock-out calculations
        const stockOut = await predictStockOut(selectedPhcId, forecastMedId);
        setStockOutResult(stockOut);

        // Always fetch surplus (returns empty if no shortage)
        const surplus = await findSurplusPHCs(selectedPhcId, forecastMedId);
        setSurplusPHCs(surplus);

        // Generate unified transfer recommendation (returns NO_SHORTAGE if safe)
        const recommendation = await generateTransferRecommendation(selectedPhcId, forecastMedId);
        setFinalRecommendation(recommendation);


        // 3. Fetch server-side Gemini Explanation
        try {
          const defaultApiUrl = import.meta.env.DEV ? "" : "https://medpulse-ec30.onrender.com";
          const apiUrl = import.meta.env.VITE_API_URL || defaultApiUrl;
          const response = await fetch(`${apiUrl}/api/ai/explanation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ phcId: selectedPhcId, medicineId: forecastMedId })
          });

          if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
          }

          const insight = await response.json();
          setAiInsight(insight);
        } catch (fetchErr) {
          console.error("Gemini server endpoint failed:", fetchErr);
          // Graceful fallback: MedPulse continues to function without breaking
          setAiInsight({
            explanation: null,
            available: false
          });
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(`Forecasting failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTransfer = async () => {
    if (!finalRecommendation) return;
    setIsApproving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const isDemo = activeWorkspace === "demo";
      await approveTransfer(finalRecommendation, isDemo);
      setStatusMessage(`✅ Transfer of ${finalRecommendation.recommendedTransferQuantity} ${finalRecommendation.medicineName} approved and recorded successfully.`);
      
      if (isDemo) {
        setDemoStage(9); // Move to Result stage
        await fetchData(); // Fetch fresh data
        setShowConfirmModal(false);
      } else {
        setFinalRecommendation(null);
        setShowConfirmModal(false);
        const e = { preventDefault: () => {} };
        await handleForecastDemand(e); 
      }
    } catch (err) {
      setErrorMessage(err.message);
      setShowConfirmModal(false);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectTransfer = async () => {
    if (!finalRecommendation) return;
    try {
      const isDemo = activeWorkspace === "demo";
      await rejectTransfer(finalRecommendation, isDemo);
      setStatusMessage("❌ Transfer recommendation rejected.");
      setFinalRecommendation(null);
      setShowConfirmModal(false);
      if (isDemo) {
        setDemoStage(9);
      }
    } catch (err) {
      setErrorMessage("Error rejecting transfer.");
    }
  };

  // Filters computed arrays
  const filteredTransactions = transactions.filter((tx) => {
    if (filterMedId && tx.medicine_id !== filterMedId) return false;
    if (filterType && tx.transaction_type !== filterType) return false;
    if (filterDate) {
      const txDateStr = tx.timestamp.toDate().toISOString().split("T")[0];
      if (txDateStr !== filterDate) return false;
    }
    return true;
  });

  const filteredFootfalls = footfallHistory.filter((ff) => {
    const ffDateStr = ff.date.toDate().toISOString().split("T")[0];
    if (filterFfStart && ffDateStr < filterFfStart) return false;
    if (filterFfEnd && ffDateStr > filterFfEnd) return false;
    return true;
  });

  const activePHC = phcs.find((p) => p.phc_id === selectedPhcId);

    const criticalCount = overviewData.filter(d => d.riskLevel === "CRITICAL").length;
  const riskCount = overviewData.filter(d => d.riskLevel === "AT_RISK").length;
  const criticalItem = overviewData.find(d => d.riskLevel === "CRITICAL");
  const orsItem = overviewData.find(d => d.medicineName === "ORS") || overviewData[0];

  return (
    <div className="app-layout">
      {/* Global Header */}
      <header className="global-header">
        <div className="header-left">
          <svg className="menu-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          <div className="phc-dropdown">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <select
              value={selectedPhcId}
              onChange={(e) => setSelectedPhcId(e.target.value)}
            >
              {phcs.map((p) => (
                <option key={p.phc_id} value={p.phc_id}>
                  {p.name}, {p.district} District
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="header-right">
          {lastUpdated && (
            <div className="last-synced">
              <span className="sync-dot"></span>
              Last synced: {lastUpdated}
            </div>
          )}
          <div className="notifications">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <span className="notif-badge">3</span>
          </div>
          <div className="user-profile">
            <div className="avatar">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div className="user-info">
              <span className="user-name">John Officer</span>
              <span className="user-role">District Health Officer</span>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: "var(--color-primary)"}}><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            MEDPULSE
          </div>
          <div className="sidebar-brand-subtitle">Operational Health & Supply Console</div>
        </div>

        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "overview" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("overview"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          Overview
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "inventory" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("inventory"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          Inventory
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "footfall" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("footfall"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Footfall
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "forecast" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("forecast"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Forecast & Risk
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "network" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("network"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          Network
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "demo" ? "active" : ""}`}
          onClick={handleEnterDemo}
          disabled={activeWorkspace === "demo" || loading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Emergency
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "personnel" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("personnel"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Personnel
        </button>
        <button 
          className={`sidebar-nav-btn ${activeWorkspace === "migration" ? "active" : ""}`}
          onClick={() => { setActiveWorkspace("migration"); setStatusMessage(null); setErrorMessage(null); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Migration
        </button>

        <div className="sidebar-footer">
          <div className="sidebar-status-group">
            <div className="sidebar-status">
              <span className="status-dot-sidebar"></span> System Status
            </div>
            <div className="sidebar-status-sub">All systems operational</div>
          </div>
          <div className="sidebar-meta">
            <div>Data Quality</div>
            <div style={{fontSize: "1rem", fontWeight: "700", color: "#f8fafc", marginTop: "0.25rem"}}>98%</div>
            <div className="progress-bar-container"><div className="progress-bar-fill"></div></div>
          </div>
          <div style={{fontSize: "0.7rem", color: "var(--color-sidebar-text-muted)", marginTop: "1rem"}}>
            © 2025 MedPulse<br/>v1.0.0
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {/* Notifications */}
        {statusMessage && <div className="toast success" style={{marginBottom: '1rem'}}>✅ {statusMessage}</div>}
        {errorMessage && <div className="toast error" style={{marginBottom: '1rem'}}>❌ {errorMessage}</div>}

        {/* Duplicate Update Confirmation Prompts */}
        {pendingDuplicate && (
          <div className="duplicate-dialog toast warning" style={{marginBottom: '1rem'}}>
            ⚠️ <strong>Footfall Record Conflict!</strong>
            <p>
              Footfall is already recorded for this PHC on <strong>{pendingDuplicate.dateStr}</strong>.<br />
              Existing patient count: <strong>{pendingDuplicate.existingCount}</strong>.<br />
              Do you want to update it to <strong>{pendingDuplicate.newCount}</strong>?
            </p>
            <div className="dialog-buttons">
              <button className="btn btn-primary" onClick={() => handleConfirmDuplicateUpdate(true)}>Yes, Update</button>
              <button className="btn btn-outline" onClick={() => handleConfirmDuplicateUpdate(false)}>Cancel</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="loader-container">
            <div className="spinner"></div>
            <span>Processing Request...</span>
          </div>
        )}

        {/* ==================================================
            OVERVIEW WORKSPACE
            ================================================== */}
        {activeWorkspace === "overview" && !loading && (
          <div className="overview-workspace">
            <div className="page-header">
              <h1 className="page-title">Overview</h1>
              <p className="page-subtitle">Real-time snapshot of medicine supply, demand & stock-out risk</p>
            </div>

            <UnifiedFacilityRiskSection
              phcs={phcs}
              selectedPhcId={selectedPhcId}
              medicines={medicines}
              medicineResults={overviewData}
              admissionRate={demoAdmissionRate}
            />

            <div className="kpi-grid">
              <div className="kpi-card kpi-primary">
                <div className="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg></div>
                <div className="kpi-content">
                  <span className="kpi-title">Total PHCs</span>
                  <span className="kpi-value">{phcs.length}</span>
                  <span className="kpi-sub">Across {activePHC?.district || 'District'}</span>
                </div>
              </div>
              <div className="kpi-card kpi-critical">
                <div className="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                <div className="kpi-content">
                  <span className="kpi-title">Critical Stock Risks</span>
                  <span className="kpi-value">{criticalCount}</span>
                  <span className="kpi-sub">PHCs with stock-out &lt; 2 days</span>
                </div>
              </div>
              <div className="kpi-card kpi-warning">
                <div className="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>
                <div className="kpi-content">
                  <span className="kpi-title">At-Risk Medicines</span>
                  <span className="kpi-value">{riskCount}</span>
                  <span className="kpi-sub">Medicines with 2-7 days</span>
                </div>
              </div>
              <div className="kpi-card kpi-success">
                <div className="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></div>
                <div className="kpi-content">
                  <span className="kpi-title">Total Medicines</span>
                  <span className="kpi-value">{medicines.length}</span>
                  <span className="kpi-sub">Monitored across all PHCs</span>
                </div>
              </div>
            </div>

            <div className="overview-layout">
              {/* Left Column */}
              <div className="overview-col-left">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Stock-out Risk Summary ({activePHC?.name})</h2>
                  </div>
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Medicine</th>
                          <th>Current Stock</th>
                          <th>Predicted 7-Day Demand</th>
                          <th>Days Remaining</th>
                          <th>Risk Level</th>
                          <th>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.map(d => {
                          const med = medicines.find(m => m.medicine_id === d.medicineId);
                          return (
                            <tr key={d.medicineId}>
                              <td><strong>{med?.name}</strong></td>
                              <td className={d.riskLevel === 'CRITICAL' ? 'text-crit' : d.riskLevel === 'SAFE' ? 'text-safe' : ''}>{d.currentStock} units</td>
                              <td>{d.predicted7DayDemand} units</td>
                              <td className={d.riskLevel === 'CRITICAL' ? 'text-crit' : d.riskLevel === 'SAFE' ? 'text-safe' : ''}>{d.estimatedDaysRemaining !== null ? d.estimatedDaysRemaining + ' days' : 'N/A'}</td>
                              <td>
                                <span className={`badge ${d.riskLevel === 'SAFE' ? 'safe' : d.riskLevel === 'AT_RISK' ? 'warn' : 'crit'}`}>
                                  {d.riskLevel}
                                </span>
                              </td>
                              <td>
                                {d.averageDailyDemand > 10 ? <span className="trend-arrow up">↑</span> : <span className="trend-arrow flat">→</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {overviewData.length === 0 && (
                          <tr><td colSpan="6" style={{textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)'}}>No medicine risk data available.</td></tr>
                        )}
                      </tbody>
                    </table>
                    <a className="table-footer-link" onClick={() => setActiveWorkspace("forecast")}>View full stock-out risk →</a>
                  </div>
                </div>

                {/* AI Demand Forecast Chart */}
                <div className="card">
                  <div className="card-header" style={{marginBottom: '0'}}>
                    <h2 className="card-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>AI Demand Forecast <span style={{fontWeight: '400', fontSize: '0.9rem', color: 'var(--color-text-muted)'}}>(Next 7 Days)</span></h2>
                    <a className="card-link" onClick={() => setActiveWorkspace("forecast")}>View Forecast</a>
                  </div>
                  
                  {orsItem ? (
                    <div className="forecast-chart-container">
                      <div className="fc-header">
                        <div className="fc-stat">
                          <span className="fc-stat-label">Predicted 7-Day Demand</span>
                          <span className="fc-stat-val text-text">{orsItem.predicted7DayDemand} <span style={{fontSize: '0.9rem', fontWeight: '600'}}>units</span></span>
                        </div>
                        <div className="fc-stat" style={{marginLeft: '2rem'}}>
                          <span className="fc-stat-label">Avg. Daily Demand</span>
                          <span className="fc-stat-val text-text" style={{fontSize: '1.25rem'}}>{orsItem.averageDailyDemand} <span style={{fontSize: '0.85rem', fontWeight: '600'}}>units</span></span>
                        </div>
                        <div className="fc-legend">
                          <div className="legend-item"><div className="legend-line"></div> Historical Usage</div>
                          <div className="legend-item"><div className="legend-line dashed"></div> Forecast</div>
                        </div>
                      </div>
                      
                      {/* Simple SVG Chart Representation */}
                      <div className="chart-svg-wrapper">
                        <svg width="100%" height="100%" viewBox="0 0 600 200" preserveAspectRatio="none">
                          {/* Y Axis Grid */}
                          <line x1="40" y1="20" x2="600" y2="20" stroke="var(--color-border)" strokeDasharray="4" />
                          <text x="30" y="25" fontSize="12" fill="var(--color-text-muted)" textAnchor="end">600</text>
                          
                          <line x1="40" y1="80" x2="600" y2="80" stroke="var(--color-border)" strokeDasharray="4" />
                          <text x="30" y="85" fontSize="12" fill="var(--color-text-muted)" textAnchor="end">400</text>
                          
                          <line x1="40" y1="140" x2="600" y2="140" stroke="var(--color-border)" strokeDasharray="4" />
                          <text x="30" y="145" fontSize="12" fill="var(--color-text-muted)" textAnchor="end">200</text>
                          
                          <line x1="40" y1="200" x2="600" y2="200" stroke="var(--color-border)" strokeWidth="2" />
                          <text x="30" y="195" fontSize="12" fill="var(--color-text-muted)" textAnchor="end">0</text>
                          
                          {/* Historical Line (Solid Blue) */}
                          <polyline points="40,160 100,140 160,160 220,130 280,120 340,125" fill="none" stroke="var(--color-primary)" strokeWidth="3" />
                          {/* Historical Dots */}
                          <circle cx="40" cy="160" r="4" fill="var(--color-primary)" />
                          <circle cx="100" cy="140" r="4" fill="var(--color-primary)" />
                          <circle cx="160" cy="160" r="4" fill="var(--color-primary)" />
                          <circle cx="220" cy="130" r="4" fill="var(--color-primary)" />
                          <circle cx="280" cy="120" r="4" fill="var(--color-primary)" />
                          <circle cx="340" cy="125" r="4" fill="var(--color-primary)" />

                          {/* Forecast Line (Dashed Green) */}
                          <polyline points="340,125 400,150 460,135 520,135 580,120" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeDasharray="6,4" />
                          {/* Forecast Dots */}
                          <circle cx="400" cy="150" r="4" fill="var(--color-success)" />
                          <circle cx="460" cy="135" r="4" fill="var(--color-success)" />
                          <circle cx="520" cy="135" r="4" fill="var(--color-success)" />
                          <circle cx="580" cy="120" r="4" fill="var(--color-success)" />
                          
                          {/* X Axis Labels */}
                          <text x="70" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 12</text>
                          <text x="140" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 13</text>
                          <text x="210" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 14</text>
                          <text x="280" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 15</text>
                          <text x="350" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 16</text>
                          <text x="420" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 17</text>
                          <text x="490" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 18</text>
                          <text x="560" y="215" fontSize="11" fill="var(--color-text-muted)" textAnchor="middle">Aug 19</text>
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div style={{padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)'}}>No forecast data available.</div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="overview-col-right">
                
                {/* Critical Action Required */}
                {criticalItem && (
                  <div className="card critical-action-card">
                    <h2 className="card-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                      Critical Action Required
                    </h2>
                    <div className="ca-phc-name">{activePHC?.name} <span style={{fontWeight: '400', fontSize: '0.8rem', color: 'var(--color-text-muted)'}}>, {activePHC?.district} District</span></div>
                    
                    <div className="ca-desc">
                      <strong>{medicines.find(m => m.medicine_id === criticalItem.medicineId)?.name}</strong> is projected to run out of stock.
                    </div>
                    
                    <div className="ca-stats">
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <span className="ca-stat-label">Estimated remaining</span>
                        <span className="ca-stat-value">{criticalItem.estimatedDaysRemaining} days</span>
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <span className="ca-stat-label">Predicted 7-day demand</span>
                        <span className="ca-stat-value dark">{criticalItem.predicted7DayDemand} units</span>
                      </div>
                    </div>
                    
                    <button className="btn btn-primary" onClick={() => { setForecastMedId(criticalItem.medicineId); setActiveWorkspace("forecast"); }}>
                      View Recommendation &rarr;
                    </button>
                  </div>
                )}

                {/* Patient Footfall Trend */}
                <div className="card">
                  <div className="card-header" style={{marginBottom: '0.5rem'}}>
                    <h2 className="card-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>Patient Footfall Trend <span style={{fontWeight: '400', fontSize: '0.8rem', color: 'var(--color-text-muted)'}}>(7-Day Avg)</span></h2>
                    <a className="card-link" onClick={() => setActiveWorkspace("footfall")}>View Details</a>
                  </div>
                  
                  <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'}}>
                    <div className="footfall-trend-info" style={{flexDirection: 'column', gap: '0'}}>
                      <div className="ff-main-val">{ffStats?.last7DaysAvg || 0}</div>
                      <div className="ff-sub-val">Patients / day</div>
                      <div className="ff-trend-pct">
                        {ffStats?.trend === 'INCREASING' ? '↑' : ffStats?.trend === 'DECREASING' ? '↓' : '→'} 
                        {ffStats?.trend === 'INCREASING' ? '32%' : '0%'} 
                        <span style={{color: 'var(--color-text-muted)', fontWeight: '400'}}>vs previous 7 days</span>
                      </div>
                    </div>
                    
                    {/* Mini SVG sparkline */}
                    <div style={{width: '120px', height: '60px', marginTop: '0.5rem'}}>
                      <svg width="100%" height="100%" viewBox="0 0 120 60" preserveAspectRatio="none">
                        <polyline points="0,50 20,40 40,55 60,30 80,45 100,20 120,10" fill="none" stroke="var(--color-info)" strokeWidth="2" />
                        <circle cx="120" cy="10" r="3" fill="var(--color-info)" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Bed Availability */}
                <div className="card">
                  <div className="card-header" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h2 className="card-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
                        Bed Availability
                      </h2>
                    </div>
                    <div className="demo-toggle" style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--color-bg-secondary)', padding: '0.25rem', borderRadius: '4px' }}>
                      <button 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', border: 'none', backgroundColor: !isBedDemoMode ? 'var(--color-primary)' : 'transparent', color: !isBedDemoMode ? 'white' : 'var(--color-text)', cursor: 'pointer', fontWeight: 'bold' }}
                        onClick={() => setIsBedDemoMode(false)}
                      >LIVE DATA</button>
                      <button 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', border: 'none', backgroundColor: isBedDemoMode ? 'var(--color-warning)' : 'transparent', color: isBedDemoMode ? 'white' : 'var(--color-text)', cursor: 'pointer', fontWeight: 'bold' }}
                        onClick={() => setIsBedDemoMode(true)}
                      >DEMO DATA</button>
                    </div>
                  </div>
                  
                  {isBedDemoMode && (
                    <div style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', borderBottom: '1px solid var(--color-warning)', padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ color: 'var(--color-warning)', fontWeight: 'bold', fontSize: '0.85rem' }}>DEMO DATA</span>
                      <span style={{ color: 'var(--color-warning)', fontSize: '0.75rem', textAlign: 'center' }}>Simulated for demonstration — not real PHC capacity</span>
                    </div>
                  )}

                  {bedData.loading ? (
                    <div style={{padding: '2rem', textAlign: 'center'}}>
                      <div className="spinner" style={{margin: '0 auto', marginBottom: '1rem'}}></div>
                      <div style={{color: 'var(--color-text-muted)'}}>Loading bed data...</div>
                    </div>
                  ) : bedData.error ? (
                    <div style={{padding: '2rem', textAlign: 'center', color: 'var(--color-critical)'}}>
                      Unable to load bed data
                    </div>
                  ) : bedData.status === "INVALID_DATA" ? (
                    <div style={{padding: '2rem', textAlign: 'center', color: 'var(--color-critical)'}}>
                      Bed data requires verification
                    </div>
                  ) : !bedData.data_available ? (
                    <div style={{padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)'}}>
                      Insufficient Data
                    </div>
                  ) : (
                    <div className="bed-stats-container">
                      <div className="bed-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '1.5rem' }}>
                        <div className="bed-stat-box" style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{bedData.beds.total_beds}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Total Beds</div>
                        </div>
                        <div className="bed-stat-box" style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{bedData.beds.occupied_beds}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Occupied</div>
                        </div>
                        <div className="bed-stat-box" style={{ textAlign: 'center', padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{bedData.beds.available_beds}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Available</div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Occupancy</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{Math.round((bedData.beds.occupied_beds / bedData.beds.total_beds) * 100)}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Status</div>
                          <span className={`badge ${bedData.status === 'SAFE' ? 'safe' : bedData.status === 'AT_RISK' ? 'warn' : 'crit'}`}>
                            {bedData.status}
                          </span>
                        </div>
                      </div>

                      {(bedData.beds.emergency_beds !== undefined || bedData.beds.icu_beds !== undefined) && (
                        <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                          {bedData.beds.emergency_beds !== undefined && (
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Emergency Beds: </span>
                              <strong>{bedData.beds.emergency_beds}</strong>
                            </div>
                          )}
                          {bedData.beds.icu_beds !== undefined && (
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>ICU Beds: </span>
                              <strong>{bedData.beds.icu_beds}</strong>
                            </div>
                          )}
                        </div>
                      )}

                      {bedData.data_available && bedData.beds && (
                        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                          <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold' }}>CAPACITY PRESSURE ANALYSIS</h4>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Current Footfall</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <select 
                                  value={demoUseOverride ? "override" : "current"}
                                  onChange={(e) => setDemoUseOverride(e.target.value === "override")}
                                  style={{ padding: '0.25rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                >
                                  <option value="current">Current ({currentFootfall})</option>
                                  <option value="override">Simulation Override</option>
                                </select>
                                {demoUseOverride ? (
                                  <input 
                                    type="number" 
                                    value={demoFootfallOverride}
                                    onChange={(e) => setDemoFootfallOverride(parseInt(e.target.value, 10) || 0)}
                                    style={{ width: '60px', padding: '0.25rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                    min="0"
                                  />
                                ) : (
                                  <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{activeFootfall}</span>
                                )}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Admission Rate</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input 
                                  type="number" 
                                  value={demoAdmissionRate}
                                  onChange={(e) => {
                                    let val = parseInt(e.target.value, 10);
                                    if (isNaN(val)) val = 0;
                                    if (val < 0) val = 0;
                                    if (val > 100) val = 100;
                                    setDemoAdmissionRate(val);
                                  }}
                                  style={{ width: '60px', padding: '0.4rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid var(--color-border)', textAlign: 'center', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
                                  min="0"
                                  max="100"
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>%</span>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Estimated Bed Demand</span>
                              <span style={{ fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--color-primary)' }}>{estimatedBedDemand}</span>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Available Beds</span>
                              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{bedData.beds.available_beds}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderTop: '1px dashed var(--color-border)' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Capacity Gap</span>
                              <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{capacityGap > 0 ? `+${capacityGap}` : capacityGap}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: capacityGap <= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
                              <span style={{ fontSize: '0.85rem', color: capacityGap <= 0 ? 'var(--color-safe)' : 'var(--color-critical)', textTransform: 'uppercase', fontWeight: 'bold' }}>Status</span>
                              <span style={{ fontWeight: 'bold', color: capacityGap <= 0 ? 'var(--color-safe)' : 'var(--color-critical)' }}>{capacityStatus}</span>
                            </div>

                            {capacityGap > 0 && capacityNearbyPhcs.length > 0 && (
                              <div style={{ marginTop: '0.5rem', padding: '0.75rem', border: '1px solid var(--color-critical)', borderRadius: '4px', backgroundColor: 'var(--color-bg-secondary)' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-critical)', marginBottom: '0.5rem' }}>OVER CAPACITY: Short {capacityGap} beds</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Nearby PHC intelligence:</div>
                                {capacityNearbyPhcs.map((phc, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: idx < capacityNearbyPhcs.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                                    <div>
                                      <strong>{phc.name.replace('PHC ', '')}</strong>
                                      <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>({phc.distance_km} km)</span>
                                    </div>
                                    <div>
                                      {phc.bedData.data_available ? (
                                        <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{phc.bedData.beds.available_beds} available</span>
                                      ) : (
                                        <span style={{ color: 'var(--color-text-muted)' }}>Bed data unavailable</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '0.5rem', fontStyle: 'italic', fontWeight: 'bold' }}>
                              Footfall represents visits and does not mean every visitor requires admission.
                            </div>

                            {/* BED CAPACITY FORECAST */}
                            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid var(--color-border)' }}>
                              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                BED CAPACITY FORECAST
                              </h4>

                              {bedForecastData.loading ? (
                                <div style={{padding: '1rem', textAlign: 'center'}}>
                                  <div className="spinner" style={{margin: '0 auto', marginBottom: '0.5rem', width: '20px', height: '20px', borderWidth: '2px'}}></div>
                                  <div style={{fontSize: '0.8rem', color: 'var(--color-text-muted)'}}>Calculating forecast...</div>
                                </div>
                              ) : bedForecastData.error ? (
                                <div style={{padding: '1rem', textAlign: 'center', color: 'var(--color-critical)', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px'}}>
                                  {bedForecastData.error}
                                </div>
                              ) : bedForecastData.data?.overallStatus === 'INSUFFICIENT_DATA' ? (
                                <div style={{padding: '1.5rem', textAlign: 'center', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px dashed var(--color-border)'}}>
                                  <div style={{color: 'var(--color-warning)', marginBottom: '0.5rem'}}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                  </div>
                                  <div style={{fontSize: '0.9rem', fontWeight: 'bold'}}>Insufficient historical footfall data</div>
                                  <div style={{fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem'}}>to generate a reliable forecast.</div>
                                </div>
                              ) : bedForecastData.data ? (
                                <>
                                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 'bold' }}>Current Available Beds:</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{bedForecastData.data.currentAvailableBeds}</span>
                                  </div>

                                  <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                          <th style={{ padding: '0.5rem 0.25rem', color: 'var(--color-text-muted)' }}>Day</th>
                                          <th style={{ padding: '0.5rem 0.25rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Expected Demand</th>
                                          <th style={{ padding: '0.5rem 0.25rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Margin</th>
                                          <th style={{ padding: '0.5rem 0.25rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bedForecastData.data.forecast.map((f, i) => {
                                          const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
                                          const isOver = f.status === 'OVER_CAPACITY';
                                          const isAtRisk = f.status === 'AT_RISK';
                                          return (
                                            <tr key={f.day} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                              <td style={{ padding: '0.75rem 0.25rem', fontWeight: 'bold' }}>
                                                {dayName}
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>{f.date}</div>
                                              </td>
                                              <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', fontWeight: 'bold' }}>{f.expectedBedDemand}</td>
                                              <td style={{ padding: '0.75rem 0.25rem', textAlign: 'center', color: isOver ? 'var(--color-critical)' : 'var(--color-safe)', fontWeight: 'bold' }}>
                                                {f.capacityMargin > 0 ? `+${f.capacityMargin}` : f.capacityMargin}
                                              </td>
                                              <td style={{ padding: '0.75rem 0.25rem', textAlign: 'right' }}>
                                                <span className={`badge ${isOver ? 'crit' : isAtRisk ? 'warn' : 'safe'}`} style={{ fontSize: '0.7rem' }}>
                                                  {f.status.replace('_', ' ')}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px' }}>
                                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>Forecast Status:</span>
                                      <span className={`badge ${bedForecastData.data.overallStatus === 'OVER_CAPACITY' ? 'crit' : bedForecastData.data.overallStatus === 'AT_RISK' ? 'warn' : 'safe'}`}>
                                        {bedForecastData.data.overallStatus.replace('_', ' ')}
                                      </span>
                                    </div>
                                    
                                    {bedForecastData.data.earliestPredictedShortage ? (() => {
                                      const shortageDay = bedForecastData.data.forecast.find(f => f.date === bedForecastData.data.earliestPredictedShortage);
                                      const dayIndex = bedForecastData.data.forecast.findIndex(f => f.date === bedForecastData.data.earliestPredictedShortage);
                                      const dayName = dayIndex === 0 ? 'Today' : dayIndex === 1 ? 'Tomorrow' : `Day ${dayIndex + 1}`;
                                      const shortageAmt = shortageDay ? Math.abs(shortageDay.capacityMargin) : 0;
                                      
                                      return (
                                        <div style={{ padding: '1rem', border: '1px solid var(--color-critical)', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                                          <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-critical)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                            Predicted Capacity Shortage
                                          </h5>
                                          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                            <strong>{dayName}</strong><br/>
                                            Expected demand: {shortageDay?.expectedBedDemand} beds<br/>
                                            Available capacity: {shortageDay?.availableBeds} beds<br/>
                                            <span style={{ color: 'var(--color-critical)', fontWeight: 'bold' }}>Predicted shortage: {shortageAmt} beds</span>
                                          </div>
                                          
                                          <button 
                                            className="btn btn-primary"
                                            style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
                                            onClick={() => setActiveWorkspace('network')}
                                          >
                                            View Nearby Capacity
                                          </button>
                                        </div>
                                      );
                                    })() : (
                                      <div style={{ padding: '1rem', textAlign: 'center', backgroundColor: 'rgba(34, 197, 94, 0.05)', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                                        <div style={{ color: 'var(--color-safe)', fontSize: '0.85rem', fontWeight: 'bold' }}>No capacity shortage predicted</div>
                                        <div style={{ color: 'var(--color-safe)', fontSize: '0.8rem' }}>for the next 3 days.</div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent Alerts */}
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Recent Alerts</h2>
                    <a className="card-link">View All</a>
                  </div>
                  <div className="recent-alerts-list">
                    {criticalItem && (
                      <div className="alert-item">
                        <div className="alert-dot crit"></div>
                        <div className="alert-content">
                          <h4 className="alert-title">{activePHC?.name.replace('PHC ', '')} - {medicines.find(m => m.medicine_id === criticalItem.medicineId)?.name}</h4>
                          <p className="alert-desc">Stock-out predicted ({criticalItem.estimatedDaysRemaining} days)</p>
                        </div>
                        <div className="alert-time">2 hours ago</div>
                      </div>
                    )}
                    <div className="alert-item">
                      <div className="alert-dot warn"></div>
                      <div className="alert-content">
                        <h4 className="alert-title">Mendarda - Paracetamol</h4>
                        <p className="alert-desc">Low stock (3 days)</p>
                      </div>
                      <div className="alert-time">4 hours ago</div>
                    </div>
                    <div className="alert-item">
                      <div className="alert-dot warn"></div>
                      <div className="alert-content">
                        <h4 className="alert-title">Maliya - Zinc</h4>
                        <p className="alert-desc">Increasing demand trend</p>
                      </div>
                      <div className="alert-time">6 hours ago</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        <div className="main-content-layout">
          {/* ======================================================================================
            INVENTORY WORKSPACE
            ================================================== */}
        {activeWorkspace === "inventory" && (
          <>
            <div className="page-header">
              <h1 className="page-title">Inventory Management</h1>
              <p className="page-subtitle">Track and manage physical stock across {activePHC?.name}</p>
            </div>

            <div className="metric-card-grid">
              <div className="metric-card">
                <span className="metric-label">Total Medicines</span>
                <span className="metric-value">{inventory.length}</span>
                <span className="metric-sub">Tracked in registry</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Total Units</span>
                <span className="metric-value">{inventory.reduce((sum, i) => sum + i.currentStock, 0).toLocaleString()}</span>
                <span className="metric-sub">Physical stock</span>
              </div>
              <div className="metric-card" style={{borderColor: 'var(--color-warning)'}}>
                <span className="metric-label" style={{color: 'var(--color-warning)'}}>Low Stock</span>
                <span className="metric-value">{inventory.filter(i => i.currentStock > 0 && i.currentStock < 50).length}</span>
                <span className="metric-sub">Units &lt; 50</span>
              </div>
              <div className="metric-card" style={{borderColor: 'var(--color-critical)', background: 'var(--color-critical-bg)'}}>
                <span className="metric-label" style={{color: 'var(--color-critical)'}}>Stock-Out</span>
                <span className="metric-value" style={{color: 'var(--color-critical)'}}>{inventory.filter(i => i.currentStock === 0).length}</span>
                <span className="metric-sub" style={{color: 'var(--color-critical)'}}>Zero physical stock</span>
              </div>
            </div>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Current Physical Inventory</h2>
              </div>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th style={{textAlign: 'right'}}>Current Stock</th>
                      <th style={{textAlign: 'right'}}>Total Received</th>
                      <th style={{textAlign: 'right'}}>Total Used</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.medicine_id}>
                        <td><strong>{item.name}</strong> <span style={{fontSize: '0.8rem', color: 'var(--color-text-muted)'}}>({item.unit})</span></td>
                        <td style={{textAlign: 'right', fontWeight: '800', color: item.currentStock === 0 ? 'var(--color-critical)' : 'var(--color-text)'}}>
                          {item.currentStock.toLocaleString()}
                        </td>
                        <td style={{textAlign: 'right'}}>{item.totalReceived.toLocaleString()}</td>
                        <td style={{textAlign: 'right'}}>{item.totalUsed.toLocaleString()}</td>
                        <td>
                          {item.currentStock === 0 ? <span className="status-badge crit">STOCK-OUT</span> : item.currentStock < 50 ? <span className="status-badge warn">LOW STOCK</span> : <span className="status-badge safe">SAFE</span>}
                        </td>
                        <td style={{color: 'var(--color-text-muted)', fontSize: '0.85rem'}}>
                          {item.lastUpdated
                            ? item.lastUpdated.toDate().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                            : "No transactions"}
                        </td>
                      </tr>
                    ))}
                    {inventory.length === 0 && (
                      <tr><td colSpan="6" style={{textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)'}}>No inventory data available for this PHC.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="overview-layout" style={{marginTop: '1.5rem'}}>
              <div className="overview-col-left">
                <section className="card">
                  <div className="card-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '1rem'}}>
                    <h2 className="card-title">Transaction Ledger</h2>
                    <div className="filters-grid" style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%'}}>
                      <select style={{flex: 1}} value={filterMedId} onChange={(e) => setFilterMedId(e.target.value)}>
                        <option value="">All Medicines</option>
                        {medicines.map((m) => (
                          <option key={m.medicine_id} value={m.medicine_id}>{m.name}</option>
                        ))}
                      </select>
                      <select style={{flex: 1}} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">All Types</option>
                        <option value="RECEIVED">RECEIVED</option>
                        <option value="USED">USED</option>
                        <option value="TRANSFER_IN">TRANSFER_IN</option>
                        <option value="TRANSFER_OUT">TRANSFER_OUT</option>
                      </select>
                      <input
                        style={{flex: 1}}
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                      />
                      {(filterMedId || filterType || filterDate) && (
                        <button className="btn btn-outline" style={{padding: '0.5rem 1rem'}} onClick={() => { setFilterMedId(""); setFilterType(""); setFilterDate(""); }}>Clear</button>
                      )}
                    </div>
                  </div>

                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Medicine</th>
                          <th>Type</th>
                          <th style={{textAlign: 'right'}}>Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)'}}>
                              No transactions match the selected filters.
                            </td>
                          </tr>
                        ) : (
                          filteredTransactions.map((tx) => {
                            const med = medicines.find((m) => m.medicine_id === tx.medicine_id);
                            const txDate = tx.timestamp.toDate();
                            const isPositive = tx.transaction_type === 'RECEIVED' || tx.transaction_type === 'TRANSFER_IN';
                            return (
                              <tr key={tx.transaction_id}>
                                <td style={{fontSize: '0.85rem', color: 'var(--color-text-muted)'}}>
                                  {txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} <br/>
                                  {txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td><strong>{med ? med.name : tx.medicine_id}</strong></td>
                                <td>
                                  <span className={`status-badge ${tx.transaction_type.includes('TRANSFER') ? 'info' : tx.transaction_type === 'RECEIVED' ? 'safe' : 'neutral'}`}>
                                    {tx.transaction_type.replace('_', ' ')}
                                  </span>
                                </td>
                                <td style={{textAlign: 'right', fontWeight: '700', color: isPositive ? 'var(--color-success)' : 'var(--color-text)'}}>
                                  {isPositive ? '+' : '-'}{tx.quantity}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
              
              <div className="overview-col-right">
                <section className="card transaction-form-card" style={{position: 'sticky', top: '100px'}}>
                  <h2 className="card-title" style={{marginBottom: '1rem'}}>Record Transaction</h2>
                  
                  <div className="form-toggle-buttons" style={{display: 'flex', gap: '0.5rem', marginBottom: '1.5rem'}}>
                    <button
                      className={`btn ${formType === "RECEIVED" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => { setFormType("RECEIVED"); setErrorMessage(null); }}
                      style={{flex: 1, padding: '0.5rem'}}
                    >
                      Inbound
                    </button>
                    <button
                      className={`btn ${formType === "USED" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => { setFormType("USED"); setErrorMessage(null); }}
                      style={{flex: 1, padding: '0.5rem'}}
                    >
                      Outbound
                    </button>
                  </div>

                  <form onSubmit={handleRecordTransaction} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                      <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Medicine</label>
                      <select value={targetMedId} onChange={(e) => setTargetMedId(e.target.value)} required>
                        <option value="">Select Medicine</option>
                        {medicines.map((m) => (
                          <option key={m.medicine_id} value={m.medicine_id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                      <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Quantity</label>
                      <input type="number" min="1" placeholder="Enter quantity" value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} required />
                    </div>

                    <div style={{display: 'flex', gap: '1rem'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1}}>
                        <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Date (Optional)</label>
                        <input type="date" value={txDateInput} onChange={(e) => setTxDateInput(e.target.value)} />
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1}}>
                        <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Time (Optional)</label>
                        <input type="time" value={txTimeInput} onChange={(e) => setTxTimeInput(e.target.value)} />
                      </div>
                    </div>

                    <button type="submit" disabled={loading} className="btn btn-primary" style={{marginTop: '1rem'}}>
                      {loading ? "Recording..." : `Confirm ${formType === "RECEIVED" ? "Inbound" : "Outbound"} Transaction`}
                    </button>
                  </form>
                </section>
              </div>
            </div>
          </>
        )}

        {/* ==================================================
            PATIENT FOOTFALL WORKSPACE
            ================================================== */}
        {activeWorkspace === "footfall" && (
          <>
            <div className="page-header">
              <h1 className="page-title">Patient Footfall Intelligence</h1>
              <p className="page-subtitle">Track daily visits, analyze trends, and predict network demand.</p>
            </div>

            <div className="metric-card-grid">
              <div className="metric-card">
                <span className="metric-label">Today's Patients</span>
                <span className="metric-value">{ffStats.todayPatients}</span>
                <span className="metric-sub">Recorded footfall</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">7-Day Daily Average</span>
                <span className="metric-value">{typeof ffStats.last7DaysAvg === "number" ? ffStats.last7DaysAvg : 0}</span>
                <span className="metric-sub">Patients per day</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Previous 7-Day Average</span>
                <span className="metric-value">{typeof ffStats.prev7DaysAvg === "number" ? ffStats.prev7DaysAvg : 0}</span>
                <span className="metric-sub">Historical comparison</span>
              </div>
              <div className="metric-card" style={{
                borderColor: ffStats.trend === 'INCREASING' ? 'var(--color-critical)' : ffStats.trend === 'DECREASING' ? 'var(--color-success)' : 'var(--color-info)',
                background: ffStats.trend === 'INCREASING' ? 'var(--color-critical-bg)' : ffStats.trend === 'DECREASING' ? 'var(--color-success-bg)' : 'var(--color-info-bg)'
              }}>
                <span className="metric-label" style={{color: ffStats.trend === 'INCREASING' ? 'var(--color-critical)' : ffStats.trend === 'DECREASING' ? 'var(--color-success)' : 'var(--color-info)'}}>
                  Demand Trend
                </span>
                <span className="metric-value" style={{color: ffStats.trend === 'INCREASING' ? 'var(--color-critical)' : ffStats.trend === 'DECREASING' ? 'var(--color-success)' : 'var(--color-info)', fontSize: '1.5rem'}}>
                  {ffStats.trend === "INCREASING" && "↑ INCREASING"}
                  {ffStats.trend === "DECREASING" && "↓ DECREASING"}
                  {ffStats.trend === "STABLE" && "→ STABLE"}
                  {ffStats.trend === "Insufficient data" && "⚠️ Insufficient data"}
                </span>
                <span className="metric-sub" style={{color: ffStats.trend === 'INCREASING' ? 'var(--color-critical)' : ffStats.trend === 'DECREASING' ? 'var(--color-success)' : 'var(--color-info)'}}>
                  Algorithmic evaluation
                </span>
              </div>
            </div>

            <section className="card" style={{marginBottom: '2rem'}}>
              <div className="card-header">
                <h2 className="card-title">Footfall History Chart</h2>
              </div>
              <div style={{width: '100%', height: '350px', padding: '1rem 0'}}>
                {filteredFootfalls.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={[...filteredFootfalls].sort((a,b) => a.date.toMillis() - b.date.toMillis()).map(f => ({
                        date: f.date.toDate().toLocaleDateString([], {month: 'short', day: 'numeric'}),
                        patients: f.patient_count
                      }))}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{fontSize: 12, fill: 'var(--color-text-muted)'}} />
                      <YAxis tick={{fontSize: 12, fill: 'var(--color-text-muted)'}} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <Tooltip 
                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)'}}
                        labelStyle={{fontWeight: 'bold', color: 'var(--color-text)'}}
                      />
                      <Area type="monotone" dataKey="patients" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorPatients)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-text-muted)'}}>
                    No chart data available for selected range.
                  </div>
                )}
              </div>
            </section>

            <div className="overview-layout">
              <div className="overview-col-left">
                <section className="card">
                  <div className="card-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '1rem'}}>
                    <h2 className="card-title">Footfall Ledger</h2>
                    <div className="filters-grid" style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <label style={{fontSize: '0.85rem', fontWeight: '600'}}>From:</label>
                        <input type="date" value={filterFfStart} onChange={(e) => setFilterFfStart(e.target.value)} style={{padding: '0.4rem'}} />
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <label style={{fontSize: '0.85rem', fontWeight: '600'}}>To:</label>
                        <input type="date" value={filterFfEnd} onChange={(e) => setFilterFfEnd(e.target.value)} style={{padding: '0.4rem'}} />
                      </div>
                      {(filterFfStart || filterFfEnd) && (
                        <button className="btn btn-outline" style={{padding: '0.4rem 1rem'}} onClick={() => { setFilterFfStart(""); setFilterFfEnd(""); }}>Clear Range</button>
                      )}
                    </div>
                  </div>

                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{textAlign: 'right'}}>Patient Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFootfalls.length === 0 ? (
                          <tr>
                            <td colSpan="2" style={{textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)'}}>
                              No footfall records found in this range.
                            </td>
                          </tr>
                        ) : (
                          filteredFootfalls.map((ff) => {
                            const ffDate = ff.date.toDate();
                            return (
                              <tr key={ff.footfall_id}>
                                <td>{ffDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                <td style={{textAlign: 'right', fontWeight: '800'}}>{ff.patient_count.toLocaleString()}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <div className="overview-col-right">
                <section className="card" style={{position: 'sticky', top: '100px'}}>
                  <h2 className="card-title" style={{marginBottom: '1rem'}}>Record Daily Footfall</h2>
                  <form onSubmit={handleRecordFootfall} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                      <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Date</label>
                      <input type="date" value={ffDateInput} onChange={(e) => setFfDateInput(e.target.value)} required />
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                      <label style={{fontSize: '0.85rem', fontWeight: '600'}}>Patient Count</label>
                      <input type="number" min="0" placeholder="Enter total patients" value={ffCountInput} onChange={(e) => setFfCountInput(e.target.value)} required />
                    </div>
                    <button type="submit" disabled={loading} className="btn btn-primary" style={{marginTop: '1rem'}}>
                      {loading ? "Recording..." : "Record Footfall"}
                    </button>
                  </form>
                </section>
              </div>
            </div>
          </>
        )}

        {/* ==================================================
            AI DEMAND FORECAST WORKSPACE
            ================================================== */}
        {activeWorkspace === "forecast" && (
          <>
            <div className="page-header">
              <h1 className="page-title">AI Demand Forecast & Risk Analysis</h1>
              <p className="page-subtitle">Predictive intelligence for preventing stock-outs</p>
            </div>

            {/* Forecast Control Panel */}
            <section className="card forecast-form-card" style={{marginBottom: '2rem'}}>
              <h2 className="card-title" style={{marginBottom: '1rem'}}>Select Medicine to Analyze</h2>
              <form onSubmit={handleForecastDemand} style={{display: 'flex', gap: '1rem', alignItems: 'flex-end'}}>
                <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                  <label style={{fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-text-muted)'}}>MEDICINE</label>
                  <select
                    value={forecastMedId}
                    onChange={(e) => setForecastMedId(e.target.value)}
                    required
                    style={{width: '100%'}}
                  >
                    <option value="">Select Medicine</option>
                    {medicines.map((m) => (
                      <option key={m.medicine_id} value={m.medicine_id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{padding: '0.75rem 2rem'}}>
                  {loading ? "Analyzing..." : "Run AI Forecast"}
                </button>
              </form>
            </section>

            {/* Forecast Output Summary */}
            {forecastResult && (
              <>
                {forecastResult.error ? (
                  <section className="card error-card" style={{borderLeft: '4px solid var(--color-critical)'}}>
                    <h2 className="card-title" style={{color: 'var(--color-critical)'}}>Execution Error</h2>
                    <div style={{padding: '1rem', background: 'var(--color-critical-bg)', borderRadius: '4px', margin: '1rem 0'}}>
                      <strong>{forecastResult.error}</strong>
                    </div>
                    <p style={{fontSize: '0.9rem', color: 'var(--color-text-muted)'}}>
                      This PHC + Medicine combination does not have sufficient history in Firestore to execute the model (requires at least 14 daily footfalls and 10 stock transactions).
                    </p>
                  </section>
                ) : (
                  <>
                    {stockOutResult && (
                      <section className="card" style={{marginBottom: '2rem', border: stockOutResult.riskLevel === 'CRITICAL' ? '2px solid var(--color-critical)' : stockOutResult.riskLevel === 'AT_RISK' ? '2px solid var(--color-warning)' : '1px solid var(--color-border)'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
                          <h2 className="card-title">Stock-Out Risk Assessment</h2>
                          <span className={`status-badge ${stockOutResult.riskLevel === "SAFE" ? "safe" : stockOutResult.riskLevel === "AT_RISK" ? "warn" : "crit"}`} style={{fontSize: '1rem', padding: '0.5rem 1rem'}}>
                            {stockOutResult.riskLevel}
                          </span>
                        </div>

                        <div className="metric-card-grid" style={{marginBottom: 0}}>
                          <div className="metric-card">
                            <span className="metric-label">Current Stock</span>
                            <span className="metric-value">{stockOutResult.currentStock.toLocaleString()}</span>
                            <span className="metric-sub">Units available</span>
                          </div>
                          <div className="metric-card">
                            <span className="metric-label">Projected Demand</span>
                            <span className="metric-value">{forecastResult.totalForecast.toLocaleString()}</span>
                            <span className="metric-sub">7-Day AI forecast</span>
                          </div>
                          <div className="metric-card">
                            <span className="metric-label">Average Daily Demand</span>
                            <span className="metric-value">{forecastResult.averageDailyDemand.toLocaleString()}</span>
                            <span className="metric-sub">units/day</span>
                          </div>
                          <div className="metric-card" style={{borderColor: stockOutResult.estimatedDaysRemaining <= 7 ? 'var(--color-critical)' : 'var(--color-border)'}}>
                            <span className="metric-label" style={{color: stockOutResult.estimatedDaysRemaining <= 7 ? 'var(--color-critical)' : 'var(--color-text-muted)'}}>Runway Remaining</span>
                            <span className="metric-value" style={{color: stockOutResult.estimatedDaysRemaining <= 7 ? 'var(--color-critical)' : 'var(--color-text)'}}>
                              {stockOutResult.estimatedDaysRemaining === 999 ? "∞" : stockOutResult.estimatedDaysRemaining} days
                            </span>
                            <span className="metric-sub">Until depletion</span>
                          </div>
                          <div className="metric-card" style={{borderColor: stockOutResult.projectedShortage > 0 ? 'var(--color-critical)' : 'var(--color-border)'}}>
                            <span className="metric-label" style={{color: stockOutResult.projectedShortage > 0 ? 'var(--color-critical)' : 'var(--color-text-muted)'}}>Predicted Shortage</span>
                            <span className="metric-value" style={{color: stockOutResult.projectedShortage > 0 ? 'var(--color-critical)' : 'var(--color-text)'}}>
                              {stockOutResult.projectedShortage.toLocaleString()}
                            </span>
                            <span className="metric-sub">Units required</span>
                          </div>
                        </div>
                      </section>
                    )}

                    <div className="overview-layout">
                      <div className="overview-col-left">
                        {/* Daily Breakdown Chart (Recharts) */}
                        <section className="card" style={{marginBottom: '2rem'}}>
                          <div className="card-header">
                            <h2 className="card-title">7-Day Demand Forecast Model</h2>
                            <span className="status-badge info">Trend: {forecastResult.trend}</span>
                          </div>
                          <div style={{width: '100%', height: '350px', padding: '1rem 0'}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={forecastResult.dailyForecast} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                <XAxis dataKey="date" tick={{fontSize: 12, fill: 'var(--color-text-muted)'}} />
                                <YAxis tick={{fontSize: 12, fill: 'var(--color-text-muted)'}} />
                                <Tooltip 
                                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)'}}
                                  labelStyle={{fontWeight: 'bold', color: 'var(--color-text)'}}
                                />
                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                <Line 
                                  type="monotone" 
                                  dataKey="demand" 
                                  name="Forecasted Demand"
                                  stroke="var(--color-primary)" 
                                  strokeWidth={3} 
                                  activeDot={{ r: 8 }} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                        
                        {/* AI INSIGHT CARD */}
                        {aiInsight && (
                          <section className="card" style={{background: 'linear-gradient(to right, rgba(170, 59, 255, 0.05), transparent)', borderLeft: '4px solid #aa3bff'}}>
                            <div className="card-header">
                              <h2 className="card-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#aa3bff'}}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="M4.93 19.07l2.83-2.83"></path><path d="M16.24 7.76l2.83-2.83"></path></svg>
                                AI Insight & Reasoning
                              </h2>
                            </div>
                            {aiInsight.available === false ? (
                              <div style={{color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '1rem 0'}}>
                                AI explanation temporarily unavailable.
                              </div>
                            ) : (
                              <div style={{padding: '1rem 0'}}>
                                <p style={{fontSize: '1rem', lineHeight: '1.6', color: 'var(--color-text)'}}>{aiInsight.explanation}</p>
                                <div style={{marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'flex-end'}}>
                                  Powered by Gemini 2.5 Flash
                                </div>
                              </div>
                            )}
                          </section>
                        )}
                      </div>

                      <div className="overview-col-right">
                        {/* NEARBY SURPLUS PHCs */}
                        {surplusPHCs.length > 0 && (
                          <section className="card" style={{marginBottom: '2rem'}}>
                            <div className="card-header">
                              <h2 className="card-title">Network Availability</h2>
                            </div>
                            <div className="data-table-container">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Source PHC</th>
                                    <th style={{textAlign: 'right'}}>Safe Surplus</th>
                                    <th style={{textAlign: 'right'}}>Distance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {surplusPHCs.map((phc, index) => (
                                    <tr key={index}>
                                      <td><strong>{phc.sourcePhc}</strong></td>
                                      <td style={{textAlign: 'right', fontWeight: '800', color: 'var(--color-success)'}}>{phc.safeSurplus.toLocaleString()}</td>
                                      <td style={{textAlign: 'right'}}>{phc.distance} km</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}

                        {/* MEDPULSE RECOMMENDATION */}
                        {finalRecommendation && finalRecommendation.recommendationStatus === "RECOMMENDED" && (
                          <section className="card" style={{borderTop: '4px solid var(--color-primary)'}}>
                            <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem'}}>
                              <h2 className="card-title">MedPulse Transfer Plan</h2>
                              <div className="status-badge warning" style={{display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold'}}>
                                <span style={{width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor'}}></span>
                                PENDING APPROVAL
                              </div>
                            </div>
                            
                            <div style={{background: 'var(--color-background)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem'}}>
                              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem'}}>
                                <div>
                                  <div style={{fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem'}}>Destination</div>
                                  <div style={{fontWeight: '800', fontSize: '1.1rem'}}>{finalRecommendation.destinationName}</div>
                                </div>
                                <div style={{textAlign: 'right'}}>
                                  <div style={{fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem'}}>Medicine</div>
                                  <div style={{fontWeight: '800', fontSize: '1.1rem'}}>{finalRecommendation.medicineName}</div>
                                </div>
                              </div>
                              
                              <div style={{borderBottom: '1px solid var(--color-border)', margin: '1rem 0'}}></div>
                              
                              <h4 style={{fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '1rem'}}>Source Allocations</h4>
                              
                              <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem'}}>
                                {finalRecommendation.allocations?.map((alloc, idx) => (
                                  <div key={idx} style={{background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem'}}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem'}}>
                                      <div style={{fontWeight: '700', fontSize: '1.05rem'}}>{alloc.sourceName}</div>
                                      <div style={{fontWeight: '800', color: 'var(--color-primary)'}}>{alloc.quantity.toLocaleString()} units</div>
                                    </div>
                                    <div style={{display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)'}}>
                                      <div><span style={{fontWeight: '600'}}>Safe Surplus:</span> {alloc.sourceSafeTransferCapacity.toLocaleString()}</div>
                                      <div><span style={{fontWeight: '600'}}>Distance:</span> {alloc.distanceKm} km</div>
                                      <div><span style={{fontWeight: '600'}}>Lead Time:</span> {alloc.estimatedLeadTimeHours} hrs</div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="metric-card-grid" style={{marginBottom: '1.25rem', gap: '1rem', gridTemplateColumns: '1fr 1fr'}}>
                                <div className="metric-card" style={{padding: '1rem', borderColor: 'var(--color-primary)', background: 'var(--color-primary-bg, rgba(0, 102, 255, 0.05))'}}>
                                  <span className="metric-label" style={{color: 'var(--color-primary)', textTransform: 'uppercase'}}>Total Planned Transfer</span>
                                  <span className="metric-value" style={{fontSize: '1.25rem', color: 'var(--color-primary)'}}>{finalRecommendation.totalAllocated?.toLocaleString() || finalRecommendation.recommendedTransferQuantity} units</span>
                                </div>
                                <div className="metric-card" style={{padding: '1rem', borderColor: finalRecommendation.isPartial ? 'var(--color-warning)' : 'var(--color-border)'}}>
                                  <span className="metric-label" style={{textTransform: 'uppercase', color: finalRecommendation.isPartial ? 'var(--color-warning)' : 'inherit'}}>Remaining Shortage</span>
                                  <span className="metric-value" style={{fontSize: '1.25rem', color: finalRecommendation.isPartial ? 'var(--color-warning)' : 'inherit'}}>{(finalRecommendation.remainingNeed || 0).toLocaleString()} units</span>
                                </div>
                              </div>
                              
                              <p style={{fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0, fontStyle: 'italic'}}>
                                {finalRecommendation.reason}
                              </p>
                            </div>

                            <div style={{display: 'flex', gap: '1rem'}}>
                              <button className="btn btn-outline" onClick={handleRejectTransfer} disabled={isApproving} style={{flex: 1}}>
                                Reject
                              </button>
                              <button className="btn btn-primary" onClick={() => setShowConfirmModal(true)} disabled={isApproving} style={{flex: 2}}>
                                Approve Transfer Plan
                              </button>
                            </div>

                            {showConfirmModal && (
                              <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                                <div style={{background: 'var(--color-surface)', padding: '2.5rem', borderRadius: '12px', maxWidth: '500px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)'}}>
                                  <h3 style={{fontSize: '1.5rem', marginBottom: '1rem'}}>Confirm Transfer Authorization</h3>
                                  <p style={{margin: '1.5rem 0', fontSize: '1.1rem'}}>
                                    Authorize the immediate transfer of <strong>{finalRecommendation.totalAllocated || finalRecommendation.recommendedTransferQuantity} {finalRecommendation.medicineName}</strong> from <strong>{finalRecommendation.allocations?.length || 1} source(s)</strong> to <strong>{finalRecommendation.destinationName}</strong>?
                                  </p>
                                  <p style={{fontSize: '0.9rem', color: 'var(--color-critical)', marginBottom: '2rem', padding: '1rem', background: 'var(--color-critical-bg)', borderRadius: '8px'}}>
                                    This action will create permanent official stock ledgers for both facilities and cannot be undone.
                                  </p>
                                  <div style={{display: 'flex', gap: '1rem'}}>
                                    <button className="btn btn-outline" onClick={() => setShowConfirmModal(false)} disabled={isApproving} style={{flex: 1}}>Cancel</button>
                                    <button className="btn btn-primary" onClick={handleApproveTransfer} disabled={isApproving} style={{flex: 1, background: 'var(--color-success)', borderColor: 'var(--color-success)'}}>
                                      {isApproving ? "Processing..." : "Authorize Transfer"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </section>
                        )}
                        
                        {finalRecommendation && finalRecommendation.recommendationStatus !== "RECOMMENDED" && (
                          <section className="card" style={{borderTop: '4px solid var(--color-warning)'}}>
                            <h2 className="card-title" style={{marginBottom: '1.5rem'}}>Action Not Recommended</h2>
                            <div style={{background: 'var(--color-background)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center'}}>
                              <div style={{marginBottom: '1rem'}}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                              </div>
                              <div style={{fontSize: '1rem', fontWeight: '600', color: 'var(--color-text)'}}>Automatic transfer is not possible</div>
                              <p style={{fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', fontStyle: 'italic'}}>
                                {finalRecommendation.reason}
                              </p>
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ==================================================
            NETWORK WORKSPACE
            ================================================== */}
        {activeWorkspace === "network" && !loading && (
          <div className="network-workspace">
            <div className="page-header">
              <h1 className="page-title">Network Intelligence</h1>
              <p className="page-subtitle">Real-time resource sharing & logistics analysis</p>
              
              <div style={{marginTop: '1rem', padding: '1rem', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)'}}>
                <div style={{fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem'}}>Selected PHC</div>
                <div style={{fontSize: '1.2rem', fontWeight: 'bold'}}>{activePHC?.name}</div>
                {activePHC?.address ? (
                  <div style={{fontSize: '0.9rem', color: 'var(--color-text-muted)', marginTop: '0.25rem'}}>{activePHC.address}</div>
                ) : (
                  <div style={{fontSize: '0.9rem', color: 'var(--color-text-muted)', marginTop: '0.25rem'}}>{activePHC?.district_name || activePHC?.district}, {activePHC?.state_name}</div>
                )}
              </div>
            </div>

            <div className="card" style={{marginBottom: '2rem'}}>
              <div className="card-header">
                <h2 className="card-title">Resource Availability</h2>
              </div>
              <div className="data-table-container" style={{padding: '1.5rem'}}>
                {!networkData.resources.data_available ? (
                  <div style={{textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem'}}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.5, marginBottom: '1rem'}}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <div>Insufficient Data / Data Unavailable</div>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Current Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {networkData.resources.resources.medicines.map(med => (
                        <tr key={med.medicine_id}>
                          <td><strong>{med.name}</strong></td>
                          <td>{med.current_stock} {med.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="overview-layout">
              <div className="overview-col-left">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Nearby PHCs</h2>
                    {!networkData.locationAvailable ? null : networkData.nearby.length > 0 ? (
                      <p style={{fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0'}}>
                        Showing {networkData.nearby.length} nearest {networkData.nearby.length === 1 ? 'PHC' : 'PHCs'} within {networkData.effectiveRadiusKm} km
                      </p>
                    ) : (
                      <p style={{fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0 0'}}>
                        No nearby PHCs with verified location data
                      </p>
                    )}
                  </div>
                  <div className="data-table-container">
                    {!networkData.locationAvailable ? (
                      <div style={{textAlign: 'center', color: 'var(--color-warning)', padding: '2rem'}}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '1rem'}}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
                        <div>Location data unavailable</div>
                      </div>
                    ) : networkData.nearby.length === 0 ? (
                      <div style={{textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)'}}>No nearby PHCs with verified location data</div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>PHC Name</th>
                            <th>District</th>
                            <th>State</th>
                            <th>Distance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {networkData.nearby.map(phc => (
                            <tr key={phc.phc_id}>
                              <td><strong>{phc.name}</strong></td>
                              <td>{phc.district_name}</td>
                              <td>{phc.state_name}</td>
                              <td>{phc.distance_km} km</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              <div className="overview-col-right" style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Same District ({activePHC?.district || activePHC?.district_id})</h2>
                  </div>
                  <div className="data-table-container">
                    {networkData.sameDistrict.length === 0 ? (
                      <div style={{textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)'}}>No other PHCs in this district.</div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>PHC Name</th>
                            <th>State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {networkData.sameDistrict.map(phc => (
                            <tr key={phc.phc_id}>
                              <td><strong>{phc.name}</strong></td>
                              <td>{phc.state_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Other Districts</h2>
                  </div>
                  <div className="data-table-container">
                    {networkData.otherDistricts.length === 0 ? (
                      <div style={{textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)'}}>No PHCs found in other districts.</div>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>PHC Name</th>
                            <th>District</th>
                          </tr>
                        </thead>
                        <tbody>
                          {networkData.otherDistricts.slice(0, 10).map(phc => (
                            <tr key={phc.phc_id}>
                              <td><strong>{phc.name}</strong></td>
                              <td>{phc.district_name}, {phc.state_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================
            EMERGENCY DEMO WORKSPACE
            ================================================== */}
        {activeWorkspace === "demo" && (
          <div className="demo-workspace">
            <div className="page-header" style={{borderLeft: '4px solid var(--color-critical)', paddingLeft: '1rem'}}>
              <h1 className="page-title" style={{color: 'var(--color-critical)'}}>Emergency Transfer Protocol Simulation</h1>
              <p className="page-subtitle">Demonstrating end-to-end automated risk mitigation for {activePHC?.name} ({medicines.find(m => m.medicine_id === forecastMedId)?.name})</p>
            </div>

            <section className="card">
              <div className="timeline-container">
                {[
                  {
                    title: "Demand Surge Detected",
                    desc: "Patient demand is increasing. Real-time footfall shows a massive spike today.",
                    show: demoStage >= 1
                  },
                  {
                    title: "AI Demand Forecast Generated",
                    desc: forecastResult ? `Predicted 7-Day Demand: ${forecastResult.total7DayDemand} units. Trend: ${forecastResult.footfallTrend}.` : "Generating forecast...",
                    show: demoStage >= 2
                  },
                  {
                    title: "Stock-Out Risk Identified",
                    desc: stockOutResult ? `Current Stock: ${stockOutResult.currentStock}. Risk Level: ${stockOutResult.riskLevel}.` : "Evaluating risk...",
                    statusClass: stockOutResult?.riskLevel === 'CRITICAL' ? 'crit' : stockOutResult?.riskLevel === 'AT_RISK' ? 'warn' : 'safe',
                    show: demoStage >= 3
                  },
                  {
                    title: "Network Surplus Search",
                    desc: surplusPHCs ? `Found ${surplusPHCs.length} eligible surplus PHCs in the network.` : "Searching network...",
                    show: demoStage >= 4
                  },
                  {
                    title: "Safe Transfer Targeting",
                    desc: surplusPHCs?.length > 0 && stockOutResult ? `Targeting ${surplusPHCs[0].sourcePhc}. Source Capacity: ${surplusPHCs[0].safeSurplus}. Destination Need: ${stockOutResult.predicted7DayDemand - stockOutResult.currentStock}.` : "Evaluating targets...",
                    show: demoStage >= 5
                  },
                  {
                    title: "Logistics Verification",
                    desc: surplusPHCs?.length > 0 ? `Distance: ${surplusPHCs[0].distance} km. Delivery within window verified.` : "Verifying logistics...",
                    show: demoStage >= 6
                  },
                  {
                    title: "Automated Transfer Recommendation",
                    desc: finalRecommendation ? `Recommended Transfer: ${finalRecommendation.recommendedTransferQuantity} units. ${finalRecommendation.reason}` : "Generating recommendation...",
                    show: demoStage >= 7
                  },
                  {
                    title: "Human Authorization Required",
                    desc: "System requires human review and authorization before executing the official inventory transaction.",
                    show: demoStage >= 8,
                    customContent: demoStage === 8 && finalRecommendation ? (
                      <div className="demo-approval-box" style={{marginTop: '1rem', padding: '1.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px'}}>
                        <div style={{display: 'flex', gap: '1rem'}}>
                          <button className="btn btn-outline" onClick={handleRejectTransfer} disabled={isApproving} style={{flex: 1}}>Reject</button>
                          <button className="btn btn-primary" onClick={() => setShowConfirmModal(true)} disabled={isApproving} style={{flex: 2}}>Review & Approve Transfer</button>
                        </div>
                        {showConfirmModal && (
                          <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <div style={{background: 'var(--color-surface)', padding: '2.5rem', borderRadius: '12px', maxWidth: '500px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)'}}>
                              <h3 style={{fontSize: '1.5rem', marginBottom: '1rem'}}>Confirm Transfer Authorization</h3>
                              <p style={{margin: '1.5rem 0', fontSize: '1.1rem'}}>Approve transfer of <strong>{finalRecommendation.recommendedTransferQuantity} {finalRecommendation.medicineName}</strong> from <strong>{finalRecommendation.sourceName}</strong> to <strong>{finalRecommendation.destinationName}</strong>?</p>
                              <div style={{display: 'flex', gap: '1rem'}}>
                                <button className="btn btn-outline" onClick={() => setShowConfirmModal(false)} disabled={isApproving} style={{flex: 1}}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleApproveTransfer} disabled={isApproving} style={{flex: 1, background: 'var(--color-success)', borderColor: 'var(--color-success)'}}>
                                  {isApproving ? "Processing..." : "Authorize Transfer"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null
                  },
                  {
                    title: "Transaction Committed & Risk Mitigated",
                    desc: "Transfer completed atomically via Firestore `runTransaction`. Stock-out risk neutralized.",
                    show: demoStage >= 9,
                    customContent: demoStage >= 9 ? (
                      <div className="metric-card-grid" style={{marginTop: '1rem'}}>
                        <div className="metric-card" style={{borderColor: 'var(--color-success)'}}>
                          <span className="metric-label" style={{color: 'var(--color-success)'}}>New Current Stock</span>
                          <span className="metric-value">{inventory.find(i => i.medicine_id === forecastMedId)?.currentStock}</span>
                        </div>
                        <div className="metric-card" style={{borderColor: 'var(--color-success)'}}>
                          <span className="metric-label" style={{color: 'var(--color-success)'}}>New Risk Level</span>
                          <span className="metric-value" style={{color: 'var(--color-success)'}}>SAFE</span>
                        </div>
                      </div>
                    ) : null
                  }
                ].map((step, idx) => (
                  <div key={idx} className={`timeline-step ${demoStage > idx + 1 ? 'completed' : demoStage === idx + 1 ? 'active' : ''}`} style={{display: step.show ? 'block' : 'none'}}>
                    <div className="timeline-node">
                      {demoStage > idx + 1 && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-title" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        {step.title}
                        {step.statusClass && (
                          <span className={`status-badge ${step.statusClass}`} style={{fontSize: '0.65rem'}}>{stockOutResult?.riskLevel}</span>
                        )}
                      </div>
                      <div className="timeline-desc">{step.desc}</div>
                      {step.customContent}
                    </div>
                  </div>
                ))}
              </div>

              {demoStage >= 1 && demoStage < 8 && (
                <div style={{marginTop: '3rem', textAlign: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '2rem'}}>
                  <button className="btn btn-primary" onClick={handleNextDemoStage} disabled={loading} style={{padding: '0.75rem 3rem', fontSize: '1rem', fontWeight: '700'}}>
                    {loading ? "Processing..." : `EXECUTE STAGE ${demoStage + 1}`}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================================================
            PERSONNEL / WORKFORCE WORKSPACE
            ================================================== */}
        {activeWorkspace === "personnel" && !loading && (
          <PersonnelWorkspace
            phcs={phcs}
            selectedPhcId={selectedPhcId}
            onSelectPhc={setSelectedPhcId}
          />
        )}

        {/* ==================================================
            MIGRATION WORKSPACE
            ================================================== */}
        {activeWorkspace === "migration" && !loading && (
          <MigrationPreview phcs={phcs} />
        )}
        
        </div>
      </main>
    </div>
  );
}

export default App;
