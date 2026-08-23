import { db } from "../firebase.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  runTransaction,
  deleteDoc
} from "firebase/firestore";

/**
 * @typedef {Object} PHC
 * @property {string} phc_id - Unique ID of the Primary Health Centre (often matches the Firestore doc ID)
 * @property {string} name - Name of the PHC
 * @property {string} district - District the PHC belongs to
 * @property {number} latitude - Latitude coordinate
 * @property {number} longitude - Longitude coordinate
 * @property {Timestamp} last_updated - Firestore Server Timestamp of last update
 */

/**
 * @typedef {Object} Medicine
 * @property {string} medicine_id - Unique medicine identifier (often matches the Firestore doc ID)
 * @property {string} name - Name of the medicine (e.g. Paracetamol)
 * @property {string} unit - Measurement unit (e.g. tablets, vials)
 */

/**
 * @typedef {Object} StockTransaction
 * @property {string} transaction_id - Unique transaction identifier
 * @property {string} phc_id - Associated PHC ID
 * @property {string} medicine_id - Associated Medicine ID
 * @property {('RECEIVED'|'USED'|'TRANSFER_IN'|'TRANSFER_OUT')} transaction_type - Type of stock transaction
 * @property {number} quantity - Quantity of stock transacted
 * @property {Timestamp} timestamp - Firestore Server Timestamp of transaction
 */

/**
 * @typedef {Object} DailyFootfall
 * @property {string} footfall_id - Unique footfall log ID
 * @property {string} phc_id - Associated PHC ID
 * @property {Timestamp} date - Date of recorded patient counts
 * @property {number} patient_count - Aggregated daily patient count
 */

/**
 * @typedef {Object} Shipment
 * @property {string} shipment_id - Unique shipment identifier
 * @property {string} phc_id - Destination PHC ID
 * @property {string} medicine_id - Transacted Medicine ID
 * @property {number} quantity - Quantity in shipment
 * @property {Timestamp} expected_arrival - Estimated arrival time
 * @property {string} status - Delivery status (e.g. PENDING, SHIPPED, DELIVERED)
 */

/**
 * @typedef {Object} MedicineBatch
 * @property {string} batch_id - Unique batch identifier
 * @property {string} phc_id - Associated PHC ID
 * @property {string} medicine_id - Associated Medicine ID
 * @property {number} quantity - Quantity in batch
 * @property {Timestamp} expiry_date - Batch expiration date
 */

// Helper to check if Firestore is ready
const checkDbReady = () => {
  if (!db) {
    throw new Error("Firestore client has not been initialized. Check environment variables.");
  }
};

/**
 * Create a new PHC document.
 * @param {Omit<PHC, 'last_updated'>} phcData 
 * @returns {Promise<string>} Created PHC ID
 */
export async function createPHC(phcData) {
  checkDbReady();
  const id = phcData.phc_id || doc(collection(db, "phcs")).id;
  const docRef = doc(db, "phcs", id);
  const data = {
    ...phcData,
    phc_id: id,
    last_updated: serverTimestamp(),
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all PHCs.
 * @returns {Promise<PHC[]>} List of PHCs
 */
export async function getPHCs() {
  checkDbReady();
  const colRef = collection(db, "phcs");
  const q = query(colRef, orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Create a new Medicine document.
 * @param {Medicine} medicineData 
 * @returns {Promise<string>} Created Medicine ID
 */
export async function createMedicine(medicineData) {
  checkDbReady();
  const id = medicineData.medicine_id || doc(collection(db, "medicines")).id;
  const docRef = doc(db, "medicines", id);
  const data = {
    ...medicineData,
    medicine_id: id,
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all Medicines.
 * @returns {Promise<Medicine[]>} List of Medicines
 */
export async function getMedicines() {
  checkDbReady();
  const colRef = collection(db, "medicines");
  const q = query(colRef, orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Record a new stock transaction.
 * @param {Omit<StockTransaction, 'transaction_id'|'timestamp'> & { transaction_id?: string, timestamp?: Date }} transactionData 
 * @returns {Promise<string>} Created Transaction ID
 */
export async function recordStockTransaction(transactionData) {
  checkDbReady();
  if (!transactionData.phc_id || typeof transactionData.phc_id !== 'string') throw new Error("Invalid or missing phc_id");
  if (!transactionData.medicine_id || typeof transactionData.medicine_id !== 'string') throw new Error("Invalid or missing medicine_id");
  if (!transactionData.transaction_type || !['RECEIVED', 'USED', 'TRANSFER_IN', 'TRANSFER_OUT'].includes(transactionData.transaction_type)) throw new Error("Invalid transaction_type");
  if (typeof transactionData.quantity !== 'number' || isNaN(transactionData.quantity) || !isFinite(transactionData.quantity) || transactionData.quantity < 0) throw new Error("Invalid quantity");

  if (transactionData.transaction_type === 'USED' || transactionData.transaction_type === 'TRANSFER_OUT') {
    const currentStock = await getCurrentStock(transactionData.phc_id, transactionData.medicine_id);
    if (transactionData.quantity > currentStock) {
      throw new Error(`Insufficient stock. Available: ${currentStock} units.`);
    }
  }

  const id = transactionData.transaction_id || doc(collection(db, "stock_transactions")).id;
  const docRef = doc(db, "stock_transactions", id);
  const data = {
    ...transactionData,
    transaction_id: id,
    timestamp: transactionData.timestamp ? Timestamp.fromDate(transactionData.timestamp) : serverTimestamp(),
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all stock transactions.
 * @returns {Promise<StockTransaction[]>} List of transactions
 */
export async function getStockTransactions() {
  checkDbReady();
  const colRef = collection(db, "stock_transactions");
  const q = query(colRef, orderBy("timestamp", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Record daily patient footfall.
 * @param {Omit<DailyFootfall, 'footfall_id'|'date'> & { footfall_id?: string, date?: Date }} footfallData 
 * @returns {Promise<string>} Created Footfall log ID
 */
export async function recordDailyFootfall(footfallData) {
  checkDbReady();
  if (!footfallData.phc_id || typeof footfallData.phc_id !== 'string') throw new Error("Invalid or missing phc_id");
  if (typeof footfallData.patient_count !== 'number' || isNaN(footfallData.patient_count) || !isFinite(footfallData.patient_count) || footfallData.patient_count < 0) throw new Error("Invalid patient_count");
  if (footfallData.date && !(footfallData.date instanceof Date) && isNaN(new Date(footfallData.date).getTime())) throw new Error("Invalid date");

  const id = footfallData.footfall_id || doc(collection(db, "daily_footfall")).id;
  const docRef = doc(db, "daily_footfall", id);
  const data = {
    ...footfallData,
    footfall_id: id,
    date: footfallData.date ? Timestamp.fromDate(footfallData.date) : serverTimestamp(),
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all daily footfall records.
 * @returns {Promise<DailyFootfall[]>} List of footfall logs
 */
export async function getDailyFootfall() {
  checkDbReady();
  const colRef = collection(db, "daily_footfall");
  const q = query(colRef, orderBy("date", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Dynamically calculates the current physical stock of a medicine at a PHC.
 * @param {string} phcId 
 * @param {string} medicineId 
 * @returns {Promise<number>} Current Stock
 */
export async function getCurrentStock(phcId, medicineId) {
  checkDbReady();
  const txs = await getFilteredStockTransactions(phcId, medicineId);
  let stock = 0;
  for (const tx of txs) {
    if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
      stock += tx.quantity;
    } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
      stock -= tx.quantity;
    }
  }
  return stock;
}

/**
 * Helper to fetch transactions filtered by phcId and/or medicineId.
 * @param {string} [phcId] 
 * @param {string} [medicineId] 
 * @returns {Promise<StockTransaction[]>}
 */
export async function getFilteredStockTransactions(phcId, medicineId) {
  checkDbReady();
  const colRef = collection(db, "stock_transactions");
  const snapshot = await getDocs(colRef);
  let txs = snapshot.docs.map((doc) => doc.data());

  if (phcId) {
    txs = txs.filter((t) => t.phc_id === phcId);
  }
  if (medicineId) {
    txs = txs.filter((t) => t.medicine_id === medicineId);
  }

  // Sort by timestamp descending
  txs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
  return txs;
}

/**
 * Get inventory metrics for all medicines at a specific PHC.
 * @param {string} phcId 
 * @returns {Promise<Array<{ medicine_id: string, name: string, unit: string, currentStock: number, totalReceived: number, totalUsed: number, lastUpdated: Timestamp|null }>>}
 */
export async function getInventory(phcId) {
  checkDbReady();
  const medicines = await getMedicines();
  const colRef = collection(db, "stock_transactions");
  const snapshot = await getDocs(colRef);
  const allTxs = snapshot.docs.map((doc) => doc.data()).filter((t) => t.phc_id === phcId);

  const inventory = [];
  for (const med of medicines) {
    const medTxs = allTxs.filter((t) => t.medicine_id === med.medicine_id);
    let currentStock = 0;
    let totalReceived = 0;
    let totalUsed = 0;
    let lastUpdated = null;

    // Sort ascending to calculate chronologically
    medTxs.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

    for (const tx of medTxs) {
      if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
        currentStock += tx.quantity;
        if (tx.transaction_type === "RECEIVED") totalReceived += tx.quantity;
      } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
        currentStock -= tx.quantity;
        if (tx.transaction_type === "USED") totalUsed += tx.quantity;
      }
      if (!lastUpdated || tx.timestamp.toDate() > lastUpdated.toDate()) {
        lastUpdated = tx.timestamp;
      }
    }

    inventory.push({
      medicine_id: med.medicine_id,
      name: med.name,
      unit: med.unit,
      currentStock,
      totalReceived,
      totalUsed,
      lastUpdated,
    });
  }
  return inventory;
}

/**
 * Get inventory metrics for all PHCs.
 * @returns {Promise<Record<string, Array<{ medicine_id: string, currentStock: number }>>>}
 */
export async function getAllInventory() {
  checkDbReady();
  const phcs = await getPHCs();
  const medicines = await getMedicines();
  const colRef = collection(db, "stock_transactions");
  const snapshot = await getDocs(colRef);
  const allTxs = snapshot.docs.map((doc) => doc.data());

  const result = {};
  for (const phc of phcs) {
    result[phc.phc_id] = [];
    const phcTxs = allTxs.filter((t) => t.phc_id === phc.phc_id);
    for (const med of medicines) {
      const medTxs = phcTxs.filter((t) => t.medicine_id === med.medicine_id);
      let stock = 0;
      for (const tx of medTxs) {
        if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
          stock += tx.quantity;
        } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
          stock -= tx.quantity;
        }
      }
      result[phc.phc_id].push({
        medicine_id: med.medicine_id,
        currentStock: stock,
      });
    }
  }
  return result;
}

/**
 * Check if a daily footfall record already exists for the given PHC and date.
 * @param {string} phcId 
 * @param {string} dateStr - Date string formatted as 'YYYY-MM-DD'
 * @returns {Promise<DailyFootfall|null>} Existing record or null
 */
export async function checkForDuplicateFootfall(phcId, dateStr) {
  checkDbReady();
  const colRef = collection(db, "daily_footfall");
  const snapshot = await getDocs(colRef);
  
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.phc_id === phcId && data.date) {
      const txDateStr = data.date.toDate().toISOString().split("T")[0];
      if (txDateStr === dateStr) {
        return data;
      }
    }
  }
  return null;
}

/**
 * Update the patient count of an existing daily footfall record.
 * @param {string} footfallId 
 * @param {number} patientCount 
 * @returns {Promise<void>}
 */
export async function updateDailyFootfall(footfallId, patientCount) {
  checkDbReady();
  const docRef = doc(db, "daily_footfall", footfallId);
  await setDoc(docRef, { patient_count: patientCount }, { merge: true });
}

/**
 * Fetch and calculate dynamic footfall analytics for a selected PHC.
 * @param {string} phcId 
 * @returns {Promise<{ todayPatients: number|string, last7DaysTotal: number|string, last7DaysAvg: number|string, prev7DaysAvg: number|string, trend: string }>}
 */
export async function getFootfallStats(phcId) {
  checkDbReady();
  const colRef = collection(db, "daily_footfall");
  const snapshot = await getDocs(colRef);
  const allFfs = snapshot.docs.map((doc) => doc.data()).filter((f) => f.phc_id === phcId);

  // Determine current local date (frozen to mock dataset time)
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // 1. Today's patients
  const todayRecord = allFfs.find((f) => f.date.toDate().toISOString().split("T")[0] === todayStr);
  const todayPatients = todayRecord ? todayRecord.patient_count : "No data for today";

  // 2. Define trend periods
  // Recent 7 calendar days: range [today - 6 days, today]
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    recentDays.push(d.toISOString().split("T")[0]);
  }

  // Previous 7 calendar days: range [today - 13 days, today - 7 days]
  const prevDays = [];
  for (let i = 7; i < 14; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    prevDays.push(d.toISOString().split("T")[0]);
  }

  // 3. Filter entries in recent and previous day sets
  const recentRecords = allFfs.filter((f) => recentDays.includes(f.date.toDate().toISOString().split("T")[0]));
  const prevRecords = allFfs.filter((f) => prevDays.includes(f.date.toDate().toISOString().split("T")[0]));

  let last7DaysTotal = 0;
  let last7DaysAvg = "Insufficient data";
  let prev7DaysAvg = "Insufficient data";

  if (recentRecords.length > 0) {
    const sum = recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0);
    last7DaysTotal = sum;
    // Calculate averages from actual recorded days
    last7DaysAvg = parseFloat((sum / recentRecords.length).toFixed(1));
  } else {
    last7DaysTotal = "Insufficient data";
  }

  if (prevRecords.length > 0) {
    const sum = prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0);
    prev7DaysAvg = parseFloat((sum / prevRecords.length).toFixed(1));
  }

  // 4. Calculate trend
  let trend = "Insufficient data";
  if (typeof last7DaysAvg === "number" && typeof prev7DaysAvg === "number") {
    if (last7DaysAvg > prev7DaysAvg * 1.05) {
      trend = "INCREASING";
    } else if (last7DaysAvg < prev7DaysAvg * 0.95) {
      trend = "DECREASING";
    } else {
      trend = "STABLE";
    }
  }

  return {
    todayPatients,
    last7DaysTotal,
    last7DaysAvg,
    prev7DaysAvg,
    trend,
  };
}

/**
 * AI Demand Forecasting Engine MVP
 * Sourced directly from dynamic Firestore records.
 * @param {string} phcId 
 * @param {string} medicineId 
 * @returns {Promise<{ error?: string, phcId: string, medicineId: string, forecastDays: number, dailyForecast: Array<{ day: number, date: string, demand: number }>, totalForecast: number, averageDailyDemand: number, currentStock: number, trend: string, reasoning: string, generatedAt: Date }>}
 */
export async function forecastDemand(phcId, medicineId) {
  checkDbReady();

  // 1. Fetch relevant stock transactions & footfall
  const allFfs = await getDailyFootfall();
  const phcFfs = allFfs.filter((f) => f.phc_id === phcId);

  const colRef = collection(db, "stock_transactions");
  const snapshot = await getDocs(colRef);
  const phcTxs = snapshot.docs.map((doc) => doc.data()).filter((t) => t.phc_id === phcId && t.medicine_id === medicineId);

  // 2. Insufficient data checks
  // Check if we have less than 14 footfall records or if we have less than 10 stock transactions overall
  if (phcFfs.length < 14 || phcTxs.length < 10) {
    return { error: "Insufficient historical data" };
  }

  // 3. Current physical stock
  const medicines = await getMedicines();
  const med = medicines.find((m) => m.medicine_id === medicineId);
  const medName = med ? med.name : medicineId;
  let currentStock = 0;
  for (const tx of phcTxs) {
    if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
      currentStock += tx.quantity;
    } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
      currentStock -= tx.quantity;
    }
  }

  // 4. Calculate usage rate and footfall trend ratio over the last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  // Recent 30 days footfalls
  const ffs30 = phcFfs.filter((f) => f.date.toDate() >= thirtyDaysAgo);
  const txsUsed30 = phcTxs.filter((t) => t.transaction_type === "USED" && t.timestamp.toDate() >= thirtyDaysAgo);

  const totalPatients30 = ffs30.reduce((acc, curr) => acc + curr.patient_count, 0);
  const totalUsed30 = txsUsed30.reduce((acc, curr) => acc + curr.quantity, 0);

  // usage rate: medicine units per patient
  const usageRate = totalPatients30 > 0 ? (totalUsed30 / totalPatients30) : 0.5;

  // 5. Calculate recent vs previous 7 days averages for footfall trend
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    recentDays.push(d.toISOString().split("T")[0]);
  }
  const prevDays = [];
  for (let i = 7; i < 14; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    prevDays.push(d.toISOString().split("T")[0]);
  }

  const recentRecords = phcFfs.filter((f) => recentDays.includes(f.date.toDate().toISOString().split("T")[0]));
  const prevRecords = phcFfs.filter((f) => prevDays.includes(f.date.toDate().toISOString().split("T")[0]));

  const recentAvgFf = recentRecords.length > 0 ? (recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / recentRecords.length) : 0;
  const prevAvgFf = prevRecords.length > 0 ? (prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / prevRecords.length) : 0;

  // Trend factor
  let trendRatio = 1.0;
  let trend = "STABLE";
  if (prevAvgFf > 0 && recentAvgFf > 0) {
    trendRatio = recentAvgFf / prevAvgFf;
    if (trendRatio > 1.05) {
      trend = "INCREASING";
    } else if (trendRatio < 0.95) {
      trend = "DECREASING";
    }
  }

  // Clamp trend ratio to prevent unrealistic predictions
  const clampedTrendRatio = Math.max(0.5, Math.min(2.5, trendRatio));

  // 6. Forecast 7 Days (linear daily progression based on trends)
  const dailyForecast = [];
  let totalForecast = 0;
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (let d = 1; d <= 7; d++) {
    const forecastDate = new Date();
    forecastDate.setDate(now.getDate() + d);

    // Project patient footfall dynamically: linearly adjust towards trend ratio
    const projectedFf = recentAvgFf * (1 + (clampedTrendRatio - 1) * (d / 7));
    // Forecast daily usage
    const projectedDemand = Math.round(projectedFf * usageRate);

    dailyForecast.push({
      day: d,
      date: `${forecastDate.getDate()} ${forecastDate.toLocaleString([], { month: 'short' })} (${daysOfWeek[forecastDate.getDay()]})`,
      demand: projectedDemand
    });

    totalForecast += projectedDemand;
  }

  const averageDailyDemand = parseFloat((totalForecast / 7).toFixed(1));

  // 7. Explanatory reasoning
  const trendDescription = trend === "INCREASING" ? "a surge in patient traffic (+ " + Math.round((trendRatio - 1) * 100) + "%)" :
                           trend === "DECREASING" ? "a decline in patient footfalls (- " + Math.round((1 - trendRatio) * 100) + "%)" :
                           "a stable patient footfall rate";

  const reasoning = `Based on historical records, this PHC has a recent average footfall of ${Math.round(recentAvgFf)} patients/day and an operating consumption rate of ${usageRate.toFixed(2)} units of ${medName} per patient. Combining this with ${trendDescription} over the past 14 days, the model projects a total demand of ${totalForecast} units of ${medName} for the next 7 days.`;

  return {
    phcId,
    medicineId,
    forecastDays: 7,
    dailyForecast,
    totalForecast,
    averageDailyDemand,
    currentStock,
    trend,
    reasoning,
    generatedAt: new Date()
  };
}

/**
 * Predict Stock-Out details from current stock and daily forecasted demand.
 * Deterministic calculations.
 * @param {string} phcId 
 * @param {string} medicineId 
 * @returns {Promise<{ error?: string, phcId: string, medicineId: string, currentStock: number, predicted7DayDemand: number, averageDailyDemand: number, estimatedDaysRemaining: number, stockOutDate: string|null, riskLevel: 'SAFE'|'AT_RISK'|'CRITICAL', projectedShortage: number }>}
 */
export async function predictStockOut(phcId, medicineId) {
  checkDbReady();

  // 1. Get dynamic forecast results
  const forecast = await forecastDemand(phcId, medicineId);
  if (forecast.error) {
    return { error: forecast.error };
  }

  const { currentStock, totalForecast, averageDailyDemand, dailyForecast } = forecast;

  // 2. Loop through daily forecast to calculate stock out date
  let stockRemaining = currentStock;
  let stockOutDateStr = null;
  let daysToStockOut = null;

  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < dailyForecast.length; i++) {
    const dailyDemand = dailyForecast[i].demand;
    stockRemaining -= dailyDemand;

    if (stockRemaining <= 0 && stockOutDateStr === null) {
      daysToStockOut = i + 1; // 1-indexed day offset
      const dOut = new Date();
      dOut.setDate(now.getDate() + daysToStockOut);
      stockOutDateStr = `${dOut.getDate()} ${months[dOut.getMonth()]} ${dOut.getFullYear()}`;
    }
  }

  // 3. Compute remaining metrics
  const estimatedDaysRemaining = averageDailyDemand > 0 ? parseFloat((currentStock / averageDailyDemand).toFixed(1)) : (currentStock > 0 ? 999 : 0);
  const projectedShortage = stockRemaining < 0 ? Math.abs(stockRemaining) : 0;

  // 4. Define risk level based on simple thresholds
  let riskLevel = "SAFE";
  if (currentStock <= 0 || (daysToStockOut !== null && daysToStockOut <= 2) || estimatedDaysRemaining <= 1.0) {
    riskLevel = "CRITICAL";
  } else if (daysToStockOut !== null && daysToStockOut <= 7) {
    riskLevel = "AT_RISK";
  }

  return {
    phcId,
    medicineId,
    currentStock,
    predicted7DayDemand: totalForecast,
    averageDailyDemand,
    estimatedDaysRemaining,
    stockOutDate: stockOutDateStr,
    riskLevel,
    projectedShortage
  };
}

/**
 * Calculate straight-line geographic distance using the Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

/**
 * Find nearby PHCs that have a safe available surplus of the same medicine.
 * @param {string} destinationPhcId
 * @param {string} medicineId
 * @returns {Promise<Array<{ sourcePhc: string, medicine: string, currentStock: number, protectedDemand: number, safeSurplus: number, distance: number }>>}
 */
export async function findSurplusPHCs(destinationPhcId, medicineId) {
  checkDbReady();

  const phcs = await getPHCs();
  const medicines = await getMedicines();
  const med = medicines.find((m) => m.medicine_id === medicineId);
  const medName = med ? med.name : medicineId;

  const destPhc = phcs.find((p) => p.phc_id === destinationPhcId);
  if (!destPhc || destPhc.latitude === undefined || destPhc.longitude === undefined) {
    return [];
  }

  // 1. Calculate destination shortage
  const destStockOut = await predictStockOut(destinationPhcId, medicineId);
  if (destStockOut.error) return [];
  const destShortage = Math.max(0, destStockOut.predicted7DayDemand - destStockOut.currentStock);

  // 2. Iterate through all other PHCs to find candidates
  const candidates = [];
  for (const phc of phcs) {
    if (phc.phc_id === destinationPhcId) continue;
    if (phc.latitude === undefined || phc.longitude === undefined) continue;

    const sourceStockOut = await predictStockOut(phc.phc_id, medicineId);
    if (sourceStockOut.error) continue;

    const currentStock = sourceStockOut.currentStock;
    const protectedDemand = sourceStockOut.predicted7DayDemand;
    const safeSurplus = currentStock - protectedDemand;

    if (safeSurplus > 0) {
      const distance = getHaversineDistance(
        destPhc.latitude,
        destPhc.longitude,
        phc.latitude,
        phc.longitude
      );

      candidates.push({
        sourcePhcId: phc.phc_id,
        sourcePhc: phc.name,
        medicine: medName,
        currentStock,
        protectedDemand,
        safeSurplus,
        distance: parseFloat(distance.toFixed(1)),
      });
    }
  }

  // 3. Sort candidates
  candidates.sort((a, b) => {
    // Sort 1: Can they fully cover the destination shortage?
    const aCovers = a.safeSurplus >= destShortage;
    const bCovers = b.safeSurplus >= destShortage;
    if (aCovers && !bCovers) return -1;
    if (!aCovers && bCovers) return 1;

    // Sort 2: Shortest distance
    return a.distance - b.distance;
  });

  return candidates;
}

/**
 * Calculate the safe transfer recommendation for a destination PHC shortage.
 * @param {string} destinationPhcId
 * @param {string} medicineId
 * @returns {Promise<Object|null>}
 */
export async function calculateTransferRecommendation(destinationPhcId, medicineId) {
  checkDbReady();

  // 1. Calculate destination need
  const destStockOut = await predictStockOut(destinationPhcId, medicineId);
  if (destStockOut.error) return { error: destStockOut.error };
  
  const destNeed = Math.max(0, destStockOut.predicted7DayDemand - destStockOut.currentStock);
  if (destNeed <= 0) return { error: "Destination does not have a shortage." };

  // 2. Find eligible source PHCs using existing function
  const candidates = await findSurplusPHCs(destinationPhcId, medicineId);
  if (candidates.length === 0) {
    return { error: "No eligible surplus PHCs found." };
  }

  // 3. Take the top ranked source (already sorted by coverage and distance in findSurplusPHCs)
  const bestSource = candidates[0];

  // 4. Calculate recommended transfer
  const recommendedTransfer = Math.min(destNeed, bestSource.safeSurplus);

  const sourceProjectedRemainingStock = bestSource.currentStock - recommendedTransfer;
  const destinationProjectedStock = destStockOut.currentStock + recommendedTransfer;

  let reason = "Optimal single-source transfer recommended.";
  if (recommendedTransfer < destNeed) {
    reason = "Insufficient single-source surplus.";
  }

  const phcs = await getPHCs();
  const destinationPhc = phcs.find(p => p.phc_id === destinationPhcId);

  return {
    destinationPhcId,
    destinationName: destinationPhc ? destinationPhc.name : destinationPhcId,
    medicineId,
    medicineName: bestSource.medicine,
    destinationCurrentStock: destStockOut.currentStock,
    destinationPredictedDemand: destStockOut.predicted7DayDemand,
    destinationNeed: destNeed,

    sourcePhcId: bestSource.sourcePhcId,
    sourceName: bestSource.sourcePhc,
    sourceCurrentStock: bestSource.currentStock,
    sourceProtectedDemand: bestSource.protectedDemand,
    sourceSafeTransferCapacity: bestSource.safeSurplus,

    recommendedTransferQuantity: recommendedTransfer,

    sourceProjectedRemainingStock,
    destinationProjectedStock,

    reason
  };
}

// Configurable constants for MVP transport assumptions
const AVERAGE_TRANSPORT_SPEED_KMH = 40;
const HANDLING_HOURS = 2;

/**
 * Calculates estimated transport and lead time for a transfer.
 * @param {string} sourcePhcId 
 * @param {string} destinationPhcId 
 * @param {string} medicineId 
 * @returns {Promise<Object|null>}
 */
export async function calculateTransportEstimate(sourcePhcId, destinationPhcId, medicineId) {
  checkDbReady();

  const phcs = await getPHCs();
  const sourcePhc = phcs.find((p) => p.phc_id === sourcePhcId);
  const destPhc = phcs.find((p) => p.phc_id === destinationPhcId);

  if (!sourcePhc || !destPhc || sourcePhc.latitude === undefined || destPhc.latitude === undefined) {
    return { error: "Invalid geographic coordinates for one or both PHCs." };
  }

  // 1. Calculate geographic distance
  const distanceKm = parseFloat(getHaversineDistance(
    destPhc.latitude, destPhc.longitude,
    sourcePhc.latitude, sourcePhc.longitude
  ).toFixed(1));

  // 2. Transport assumptions
  const estimatedTravelHours = parseFloat((distanceKm / AVERAGE_TRANSPORT_SPEED_KMH).toFixed(2));
  const estimatedLeadTimeHours = parseFloat((estimatedTravelHours + HANDLING_HOURS).toFixed(2));

  // 3. Shortage Timeframe vs Lead time
  const destStockOut = await predictStockOut(destinationPhcId, medicineId);
  if (destStockOut.error) return { error: destStockOut.error };
  
  const estimatedDaysRemaining = destStockOut.estimatedDaysRemaining;
  const timeRemainingHours = estimatedDaysRemaining * 24;

  const deliveryWithinRiskWindow = estimatedLeadTimeHours <= timeRemainingHours;

  let timingStatus;
  if (timeRemainingHours <= 0) {
    timingStatus = "STOCK_OUT_ALREADY_REACHED";
  } else if (deliveryWithinRiskWindow) {
    timingStatus = "ARRIVES_BEFORE_STOCK_OUT";
  } else {
    timingStatus = "ARRIVES_AFTER_STOCK_OUT";
  }

  return {
    sourcePhcId,
    destinationPhcId,
    distanceKm,
    estimatedTravelHours,
    handlingHours: HANDLING_HOURS,
    estimatedLeadTimeHours,
    estimatedDaysRemaining,
    deliveryWithinRiskWindow,
    timingStatus
  };
}

/**
 * Generates a unified transfer recommendation evaluating all criteria (Steps 9, 11, 12, 13).
 * @param {string} destinationPhcId
 * @param {string} medicineId
 * @returns {Promise<Object>}
 */
export async function generateTransferRecommendation(destinationPhcId, medicineId) {
  checkDbReady();

  // 1. Predict Stock Out for destination
  const destStockOut = await predictStockOut(destinationPhcId, medicineId);
  if (destStockOut.error) return { recommendationStatus: "ERROR", reason: destStockOut.error };
  
  const destNeed = Math.max(0, destStockOut.predicted7DayDemand - destStockOut.currentStock);
  if (destNeed <= 0) {
    return { recommendationStatus: "NO_SHORTAGE", reason: "Destination does not have a shortage." };
  }

  // 2. Find eligible source PHCs
  const candidates = await findSurplusPHCs(destinationPhcId, medicineId);
  if (candidates.length === 0) {
    return { recommendationStatus: "NO_SAFE_SOURCE", reason: "No eligible surplus PHCs found." };
  }

  // 3. For each candidate, calculate transport estimate and filter
  const validCandidates = [];
  for (const candidate of candidates) {
    const transport = await calculateTransportEstimate(candidate.sourcePhcId, destinationPhcId, medicineId);
    if (transport && !transport.error && (transport.deliveryWithinRiskWindow || transport.timingStatus === "STOCK_OUT_ALREADY_REACHED")) {
      validCandidates.push({
        ...candidate,
        transport
      });
    }
  }

  if (validCandidates.length === 0) {
    return { recommendationStatus: "DELIVERY_TOO_SLOW", reason: "Available sources cannot deliver within the risk window." };
  }

  // 4. Rank candidates:
  // - 1. Can safely satisfy remaining need
  // - 2. Shortest distance
  // - 3. Highest safe surplus
  validCandidates.sort((a, b) => {
    const aCovers = a.safeSurplus >= destNeed;
    const bCovers = b.safeSurplus >= destNeed;
    if (aCovers && !bCovers) return -1;
    if (!aCovers && bCovers) return 1;

    if (a.transport.distanceKm !== b.transport.distanceKm) {
      return a.transport.distanceKm - b.transport.distanceKm;
    }

    return b.safeSurplus - a.safeSurplus;
  });

  const allocations = [];
  let remainingNeed = destNeed;
  let totalAllocated = 0;

  for (const candidate of validCandidates) {
    if (remainingNeed <= 0) break;

    const allocationQty = Math.min(remainingNeed, candidate.safeSurplus);
    
    if (allocationQty > 0) {
      allocations.push({
        sourcePhcId: candidate.sourcePhcId,
        sourceName: candidate.sourcePhc,
        sourceCurrentStock: candidate.currentStock,
        sourceProtectedDemand: candidate.protectedDemand,
        sourceSafeTransferCapacity: candidate.safeSurplus,
        quantity: allocationQty,
        distanceKm: candidate.transport.distanceKm,
        estimatedLeadTimeHours: candidate.transport.estimatedLeadTimeHours,
        estimatedDaysRemaining: candidate.transport.estimatedDaysRemaining,
        deliveryWithinRiskWindow: candidate.transport.deliveryWithinRiskWindow
      });

      remainingNeed -= allocationQty;
      totalAllocated += allocationQty;
    }
  }

  if (allocations.length === 0) {
    return { recommendationStatus: "INSUFFICIENT_SURPLUS", reason: "Insufficient surplus across all eligible sources." };
  }

  const phcs = await getPHCs();
  const destinationPhc = phcs.find(p => p.phc_id === destinationPhcId);

  let reason = "";
  if (destStockOut.estimatedDaysRemaining <= 0) {
    reason = `${destinationPhc ? destinationPhc.name : destinationPhcId} has already reached stock-out. Estimated arrival: ${allocations[0].estimatedLeadTimeHours} hours. `;
  } else {
    reason = `${destinationPhc ? destinationPhc.name : destinationPhcId} is projected to face an ${allocations[0].medicineName || medicineId} shortage. `;
  }
  
  if (remainingNeed <= 0) {
    reason += `The system has planned a complete transfer of ${totalAllocated} units from ${allocations.length} eligible source(s).`;
  } else {
    reason += `The system has planned a partial transfer of ${totalAllocated} units from ${allocations.length} eligible source(s), but a shortage of ${remainingNeed} units remains.`;
  }

  return {
    recommendationStatus: "RECOMMENDED",
    destinationPhcId,
    destinationName: destinationPhc ? destinationPhc.name : destinationPhcId,
    destinationMedicineId: medicineId,
    medicineId,
    medicineName: candidates[0].medicine,

    currentDestinationStock: destStockOut.currentStock,
    destinationNeed: destNeed,

    allocations,
    totalAllocated,
    remainingNeed,
    isPartial: remainingNeed > 0,

    reason
  };
}

export async function rejectTransfer(recommendationData, isDemo = false) {
  checkDbReady();
  const id = doc(collection(db, "transfer_recommendations")).id;
  const docRef = doc(db, "transfer_recommendations", id);
  
  const payload = {
    transfer_id: id,
    destination_phc_id: recommendationData.destinationPhcId,
    medicine_id: recommendationData.medicineId,
    status: "REJECTED",
    created_at: serverTimestamp(),
    is_demo: isDemo
  };

  if (recommendationData.allocations) {
    payload.allocations = recommendationData.allocations.map(a => ({
      source_phc_id: a.sourcePhcId,
      recommended_quantity: a.quantity
    }));
    payload.total_quantity = recommendationData.totalAllocated;
  } else {
    payload.source_phc_id = recommendationData.sourcePhcId;
    payload.recommended_quantity = recommendationData.recommendedTransferQuantity;
  }

  await setDoc(docRef, payload);
  return id;
}

export async function approveTransfer(recommendationData, isDemo = false) {
  checkDbReady();

  if (!recommendationData.destinationPhcId || typeof recommendationData.destinationPhcId !== 'string') throw new Error("Invalid destination PHC ID");
  if (!recommendationData.medicineId || typeof recommendationData.medicineId !== 'string') throw new Error("Invalid medicine ID");
  
  let allocations = recommendationData.allocations;
  // Fallback for single-source format (if any legacy calls remain)
  if (!allocations) {
    if (!recommendationData.sourcePhcId) throw new Error("Invalid source PHC ID");
    if (typeof recommendationData.recommendedTransferQuantity !== 'number' || recommendationData.recommendedTransferQuantity <= 0) throw new Error("Invalid transfer quantity");
    allocations = [{
      sourcePhcId: recommendationData.sourcePhcId,
      quantity: recommendationData.recommendedTransferQuantity,
      sourceProtectedDemand: recommendationData.sourceProtectedDemand
    }];
  }

  return await runTransaction(db, async (transaction) => {
    // 1. Re-check the current stock for ALL source PHCs within the transaction logic.
    // If ANY source fails, the entire transaction is aborted.
    const sourceStocks = {};
    for (const alloc of allocations) {
      if (alloc.sourcePhcId === recommendationData.destinationPhcId) throw new Error("Source and destination cannot be the same");
      const currentSourceStock = await getCurrentStock(alloc.sourcePhcId, recommendationData.medicineId);
      
      if (currentSourceStock - alloc.quantity < alloc.sourceProtectedDemand) {
        throw new Error(`Transfer cannot be completed. Stock at ${alloc.sourceName || alloc.sourcePhcId} has changed. Current stock (${currentSourceStock}) cannot support transfer of ${alloc.quantity} while protecting ${alloc.sourceProtectedDemand}.`);
      }
      sourceStocks[alloc.sourcePhcId] = currentSourceStock;
    }

    // 2. Prepare writes for all allocations
    const recRef = doc(collection(db, "transfer_recommendations"));
    const allocationsData = [];

    for (const alloc of allocations) {
      const outRef = doc(collection(db, "stock_transactions"));
      const inRef = doc(collection(db, "stock_transactions"));

      // Write TRANSFER_OUT
      transaction.set(outRef, {
        transaction_id: outRef.id,
        phc_id: alloc.sourcePhcId,
        medicine_id: recommendationData.medicineId,
        transaction_type: "TRANSFER_OUT",
        quantity: alloc.quantity,
        timestamp: serverTimestamp(),
        is_demo: isDemo
      });

      // Write TRANSFER_IN
      transaction.set(inRef, {
        transaction_id: inRef.id,
        phc_id: recommendationData.destinationPhcId,
        medicine_id: recommendationData.medicineId,
        transaction_type: "TRANSFER_IN",
        quantity: alloc.quantity,
        timestamp: serverTimestamp(),
        is_demo: isDemo
      });

      allocationsData.push({
        source_phc_id: alloc.sourcePhcId,
        recommended_quantity: alloc.quantity,
        approved_quantity: alloc.quantity
      });
    }

    // Write MASTER TRANSFER RECORD
    const masterPayload = {
      transfer_id: recRef.id,
      destination_phc_id: recommendationData.destinationPhcId,
      medicine_id: recommendationData.medicineId,
      allocations: allocationsData,
      total_quantity: recommendationData.totalAllocated || allocationsData.reduce((sum, a) => sum + a.approved_quantity, 0),
      status: "APPROVED",
      created_at: serverTimestamp(),
      approved_at: serverTimestamp(),
      is_demo: isDemo
    };
    
    transaction.set(recRef, masterPayload);

    return { success: true, transfer_id: recRef.id };
  });
}


/**
 * Setup Emergency Demo State
 * Injects a footfall spike and temporary stock for the demo.
 */
export async function setupDemoState(phcId, medicineId) {
  checkDbReady();
  const txRef = collection(db, "stock_transactions");
  const ffRef = collection(db, "daily_footfall");

  // 1. Temporary footfall spike (simulate increasing demand today)
  await addDoc(ffRef, {
    footfall_id: "demo-footfall-spike",
    phc_id: phcId,
    date: Timestamp.fromDate(new Date()),
    patient_count: 500000, // MASSIVE spike to force multi-source
    is_demo: true
  });

  // 2. Temporary stock injection to ensure Nakra has enough time window for Koth delivery
  await addDoc(txRef, {
    transaction_id: "demo-stock-injection",
    phc_id: phcId,
    medicine_id: medicineId,
    transaction_type: "RECEIVED",
    quantity: 1000,
    timestamp: serverTimestamp(),
    is_demo: true
  });
}

/**
 * Reset Emergency Demo State
 * Cleans up all is_demo records.
 */
export async function resetDemoState() {
  checkDbReady();
  const collections = ["stock_transactions", "daily_footfall", "transfer_recommendations"];
  
  for (const collName of collections) {
    const q = query(collection(db, collName), where("is_demo", "==", true));
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
      await deleteDoc(d.ref);
    }
  }
}
