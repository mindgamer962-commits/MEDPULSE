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
 * @property {string} [state_id] - Optional state ID
 * @property {string} [state_name] - Optional state name
 * @property {string} [district_id] - Optional district ID
 * @property {string} [district_name] - Optional district name
 * @property {number} latitude - Latitude coordinate
 * @property {number} longitude - Longitude coordinate
 * @property {Timestamp} last_updated - Firestore Server Timestamp of last update
 */

/**
 * @typedef {Object} State
 * @property {string} state_id - Unique state ID (e.g., "GJ")
 * @property {string} name - Name of the state (e.g., "Gujarat")
 * @property {string} code - State code
 * @property {boolean} active - Whether the state is currently active
 */

/**
 * @typedef {Object} District
 * @property {string} district_id - Unique district ID (e.g., "JUN")
 * @property {string} name - Name of the district (e.g., "Junagadh")
 * @property {string} state_id - Parent state ID
 * @property {string} state_name - Parent state name
 * @property {boolean} active - Whether the district is currently active
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
 * Create a new State document.
 * @param {State} stateData 
 * @returns {Promise<string>} Created State ID
 */
export async function createState(stateData) {
  checkDbReady();
  if (!stateData.state_id || typeof stateData.state_id !== 'string') throw new Error("Invalid or missing state_id");
  const id = stateData.state_id;
  const docRef = doc(db, "states", id);
  const data = {
    ...stateData,
    state_id: id,
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all States.
 * @returns {Promise<State[]>} List of States
 */
export async function getStates() {
  checkDbReady();
  const colRef = collection(db, "states");
  const q = query(colRef, orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Create a new District document.
 * @param {District} districtData 
 * @returns {Promise<string>} Created District ID
 */
export async function createDistrict(districtData) {
  checkDbReady();
  if (!districtData.district_id || typeof districtData.district_id !== 'string') throw new Error("Invalid or missing district_id");
  const id = districtData.district_id;
  const docRef = doc(db, "districts", id);
  const data = {
    ...districtData,
    district_id: id,
  };
  await setDoc(docRef, data);
  return id;
}

/**
 * Fetch all Districts.
 * @returns {Promise<District[]>} List of Districts
 */
export async function getDistricts() {
  checkDbReady();
  const colRef = collection(db, "districts");
  const q = query(colRef, orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Fetch PHCs by state ID.
 * @param {string} stateId 
 * @returns {Promise<PHC[]>} List of PHCs
 */
export async function getPHCsByState(stateId) {
  checkDbReady();
  if (!stateId || typeof stateId !== 'string') throw new Error("Invalid or missing stateId");
  const colRef = collection(db, "phcs");
  const q = query(colRef, where("state_id", "==", stateId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Fetch PHCs by district ID.
 * @param {string} districtId 
 * @returns {Promise<PHC[]>} List of PHCs
 */
export async function getPHCsByDistrict(districtId) {
  checkDbReady();
  if (!districtId || typeof districtId !== 'string') throw new Error("Invalid or missing districtId");
  const colRef = collection(db, "phcs");
  const q = query(colRef, where("district_id", "==", districtId));
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
 * Fetch all daily footfall records, optionally filtered by PHC.
 * @param {string} [phcId] - Optional PHC ID filter
 * @returns {Promise<DailyFootfall[]>} List of footfall logs
 */
export async function getDailyFootfall(phcId = null) {
  checkDbReady();
  const colRef = collection(db, "daily_footfall");
  let q;
  if (phcId) {
    q = query(colRef, where("phc_id", "==", phcId));
  } else {
    q = query(colRef, orderBy("date", "desc"));
  }
  const snapshot = await getDocs(q);
  const list = snapshot.docs.map((doc) => doc.data());
  list.sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return db - da;
  });
  return list;
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
  let q;
  if (phcId && medicineId) {
    q = query(colRef, where("phc_id", "==", phcId), where("medicine_id", "==", medicineId));
  } else if (phcId) {
    q = query(colRef, where("phc_id", "==", phcId));
  } else if (medicineId) {
    q = query(colRef, where("medicine_id", "==", medicineId));
  } else {
    q = colRef;
  }
  const snapshot = await getDocs(q);
  let txs = snapshot.docs.map((doc) => doc.data());

  // Sort by timestamp descending
  txs.sort((a, b) => {
    const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
    const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
    return db - da;
  });
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
  const q = phcId ? query(colRef, where("phc_id", "==", phcId)) : colRef;
  const snapshot = await getDocs(q);
  const allTxs = snapshot.docs.map((doc) => doc.data());

  const inventory = [];
  for (const med of medicines) {
    const medTxs = allTxs.filter((t) => t.medicine_id === med.medicine_id);
    let currentStock = 0;
    let totalReceived = 0;
    let totalUsed = 0;
    let lastUpdated = null;

    // Sort ascending to calculate chronologically
    medTxs.sort((a, b) => {
      const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      return da - db;
    });

    for (const tx of medTxs) {
      if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
        currentStock += tx.quantity;
        if (tx.transaction_type === "RECEIVED") totalReceived += tx.quantity;
      } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
        currentStock -= tx.quantity;
        if (tx.transaction_type === "USED") totalUsed += tx.quantity;
      }
      const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
      const lastDate = lastUpdated?.toDate ? lastUpdated.toDate() : (lastUpdated ? new Date(lastUpdated) : null);
      if (!lastDate || txDate > lastDate) {
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
  const q = phcId ? query(colRef, where("phc_id", "==", phcId)) : colRef;
  const snapshot = await getDocs(q);
  
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.date) {
      const txDateStr = data.date.toDate ? data.date.toDate().toISOString().split("T")[0] : (data.date instanceof Date ? data.date.toISOString().split("T")[0] : String(data.date).split("T")[0]);
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
 * @param {string|Date|null} [referenceDate=null] - Optional reference date (YYYY-MM-DD or Date object). Defaults to current date.
 * @returns {Promise<{ todayPatients: number|string, last7DaysTotal: number|string, last7DaysAvg: number|string, prev7DaysAvg: number|string, trend: string }>}
 */
export async function getFootfallStats(phcId, referenceDate = null) {
  checkDbReady();
  const colRef = collection(db, "daily_footfall");
  const q = phcId ? query(colRef, where("phc_id", "==", phcId)) : colRef;
  const snapshot = await getDocs(q);
  const allFfs = snapshot.docs.map((doc) => doc.data());

  // Determine reference date (frozen to target date or current date for backward compatibility)
  let refDate;
  if (referenceDate) {
    if (typeof referenceDate === 'string') {
      const parts = referenceDate.split('T')[0].split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        refDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      } else {
        refDate = new Date(referenceDate);
      }
    } else if (referenceDate instanceof Date) {
      refDate = new Date(Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()));
    } else {
      refDate = new Date();
    }
  } else {
    refDate = new Date();
  }

  const todayStr = refDate.toISOString().split("T")[0];

  // Helper to extract YYYY-MM-DD from doc
  const getDocDateStr = (f) => {
    if (!f || !f.date) return null;
    if (f.date.toDate) return f.date.toDate().toISOString().split("T")[0];
    if (f.date instanceof Date) return f.date.toISOString().split("T")[0];
    return String(f.date).split("T")[0];
  };

  // 1. Today's patients
  const todayRecord = allFfs.find((f) => {
    const dateStr = getDocDateStr(f);
    return dateStr === todayStr;
  });
  const todayPatients = todayRecord ? todayRecord.patient_count : "No data for today";

  // 2. Define trend periods
  // Recent 7 calendar days: range [referenceDate - 6 days, referenceDate] (inclusive, 7 days)
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(refDate.getTime());
    d.setUTCDate(refDate.getUTCDate() - i);
    recentDays.push(d.toISOString().split("T")[0]);
  }

  // Previous 7 calendar days: range [referenceDate - 13 days, referenceDate - 7 days] (inclusive, 7 days)
  const prevDays = [];
  for (let i = 7; i < 14; i++) {
    const d = new Date(refDate.getTime());
    d.setUTCDate(refDate.getUTCDate() - i);
    prevDays.push(d.toISOString().split("T")[0]);
  }

  // 3. Filter entries in recent and previous day sets
  const recentRecords = allFfs.filter((f) => {
    const dateStr = getDocDateStr(f);
    return dateStr && recentDays.includes(dateStr);
  });
  const prevRecords = allFfs.filter((f) => {
    const dateStr = getDocDateStr(f);
    return dateStr && prevDays.includes(dateStr);
  });

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

  // 1. Fetch relevant stock transactions & footfall directly filtered by PHC and medicine
  const phcFfs = await getDailyFootfall(phcId);

  const txCol = collection(db, "stock_transactions");
  const txQuery = query(txCol, where("phc_id", "==", phcId), where("medicine_id", "==", medicineId));
  const snapshot = await getDocs(txQuery);
  const phcTxs = snapshot.docs.map((doc) => doc.data());

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

  let usageRate = 0;
  let isHistoricalFallback = false;
  let fallbackReferenceDate = null;

  if (txsUsed30.length > 0) {
    // Current 30-day window contains valid USED transactions
    const totalPatients30 = ffs30.reduce((acc, curr) => acc + curr.patient_count, 0);
    const totalUsed30 = txsUsed30.reduce((acc, curr) => acc + curr.quantity, 0);
    usageRate = totalPatients30 > 0 ? (totalUsed30 / totalPatients30) : 0.5;
  } else {
    // Current 30-day window contains zero valid USED transactions -> search historical stock_transactions
    const allUsedTxs = phcTxs.filter((t) => t.transaction_type === "USED" && t.quantity > 0);

    if (allUsedTxs.length === 0) {
      // Genuinely no usable USED history anywhere for this PHC + medicine -> INSUFFICIENT_DATA
      return { error: "Insufficient historical usage data" };
    }

    // Sort to find the most recent valid historical period containing USED transactions
    allUsedTxs.sort((a, b) => {
      const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      return db - da; // newest first
    });

    const latestUsedDate = allUsedTxs[0].timestamp?.toDate ? allUsedTxs[0].timestamp.toDate() : new Date(allUsedTxs[0].timestamp);
    const histWindowStart = new Date(latestUsedDate);
    histWindowStart.setDate(latestUsedDate.getDate() - 30);

    const histUsedTxs = allUsedTxs.filter((t) => {
      const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
      return d >= histWindowStart && d <= latestUsedDate;
    });

    const histFfs = phcFfs.filter((f) => {
      const d = f.date?.toDate ? f.date.toDate() : new Date(f.date);
      return d >= histWindowStart && d <= latestUsedDate;
    });

    const histTotalUsed = histUsedTxs.reduce((acc, c) => acc + c.quantity, 0);
    const histTotalPatients = histFfs.reduce((acc, c) => acc + c.patient_count, 0);

    if (histTotalPatients > 0 && histTotalUsed > 0) {
      usageRate = histTotalUsed / histTotalPatients;
    } else if (histTotalUsed > 0) {
      const totalAllUsed = allUsedTxs.reduce((acc, c) => acc + c.quantity, 0);
      const totalAllPatients = phcFfs.reduce((acc, c) => acc + c.patient_count, 0);
      usageRate = totalAllPatients > 0 ? (totalAllUsed / totalAllPatients) : 0.5;
    } else {
      usageRate = 0.5;
    }

    isHistoricalFallback = true;
    fallbackReferenceDate = latestUsedDate;
  }

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

  const getDateStr = (f) => {
    if (!f || !f.date) return "";
    if (f.date.toDate) return f.date.toDate().toISOString().split("T")[0];
    if (f.date instanceof Date) return f.date.toISOString().split("T")[0];
    return String(f.date).split("T")[0];
  };

  const recentRecords = phcFfs.filter((f) => recentDays.includes(getDateStr(f)));
  const prevRecords = phcFfs.filter((f) => prevDays.includes(getDateStr(f)));

  let recentAvgFf = recentRecords.length > 0 ? (recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / recentRecords.length) : 0;
  if (recentAvgFf === 0 && ffs30.length > 0) {
    recentAvgFf = ffs30.reduce((acc, curr) => acc + curr.patient_count, 0) / ffs30.length;
  } else if (recentAvgFf === 0 && phcFfs.length > 0) {
    recentAvgFf = phcFfs.reduce((acc, curr) => acc + curr.patient_count, 0) / phcFfs.length;
  }
  const prevAvgFf = prevRecords.length > 0 ? (prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / prevRecords.length) : recentAvgFf;

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

  const fallbackNotice = isHistoricalFallback
    ? ` (consumption rate established from latest available historical usage period ending ${fallbackReferenceDate ? fallbackReferenceDate.toISOString().split('T')[0] : 'prior baseline'})`
    : '';

  const reasoning = `Based on historical records, this PHC has a recent average footfall of ${Math.round(recentAvgFf)} patients/day and an operating consumption rate of ${usageRate.toFixed(2)} units of ${medName} per patient${fallbackNotice}. Combining this with ${trendDescription} over the past 14 days, the model projects a total demand of ${totalForecast} units of ${medName} for the next 7 days.`;

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
    isHistoricalFallback,
    fallbackReferenceDate,
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

import { findTransferSourcesByDistrict } from './network.js';

/**
 * Find nearby PHCs that have a safe available surplus of the same medicine.
 * @param {string} destinationPhcId
 * @param {string} medicineId
 * @returns {Promise<Array<{ sourcePhcId: string, sourcePhc: string, medicine: string, currentStock: number, protectedDemand: number, safeSurplus: number, classification: string }>>}
 */
export async function findSurplusPHCs(destinationPhcId, medicineId) {
  checkDbReady();

  // 1. Calculate destination shortage
  const destStockOut = await predictStockOut(destinationPhcId, medicineId);
  if (destStockOut.error) return [];
  const destShortage = Math.max(0, destStockOut.predicted7DayDemand - destStockOut.currentStock);

  // 2. Get all surplus candidates grouped by district logic
  const networkSources = await findTransferSourcesByDistrict(destinationPhcId, medicineId);

  const medicines = await getMedicines();
  const med = medicines.find((m) => m.medicine_id === medicineId);
  const medName = med ? med.name : medicineId;

  const candidates = networkSources.map(src => ({
    sourcePhcId: src.phc_id,
    sourcePhc: src.name,
    medicine: medName,
    currentStock: src.current_stock,
    protectedDemand: src.current_stock - src.safe_surplus, // reconstruct
    safeSurplus: src.safe_surplus,
    classification: src.classification
  }));

  // 3. Sort candidates internally for backward compatibility 
  // (generateTransferRecommendation does its own final sort)
  candidates.sort((a, b) => {
    // Sort 1: District priority
    if (a.classification === "SAME_DISTRICT" && b.classification === "OTHER_DISTRICT") return -1;
    if (a.classification === "OTHER_DISTRICT" && b.classification === "SAME_DISTRICT") return 1;

    // Sort 2: Can they fully cover the destination shortage?
    const aCovers = a.safeSurplus >= destShortage;
    const bCovers = b.safeSurplus >= destShortage;
    if (aCovers && !bCovers) return -1;
    if (!aCovers && bCovers) return 1;
    
    return 0;
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
  // - 1. Same district preferred
  // - 2. Can safely satisfy remaining need
  // - 3. Shortest distance
  // - 4. Highest safe surplus
  validCandidates.sort((a, b) => {
    // 1. Same district preferred
    if (a.classification === "SAME_DISTRICT" && b.classification === "OTHER_DISTRICT") return -1;
    if (a.classification === "OTHER_DISTRICT" && b.classification === "SAME_DISTRICT") return 1;

    // 2. Can safely satisfy remaining need
    const aCovers = a.safeSurplus >= destNeed;
    const bCovers = b.safeSurplus >= destNeed;
    if (aCovers && !bCovers) return -1;
    if (!aCovers && bCovers) return 1;

    // 3. Shortest distance
    if (a.transport.distanceKm !== b.transport.distanceKm) {
      return a.transport.distanceKm - b.transport.distanceKm;
    }

    // 4. Highest safe surplus
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
    patient_count: 150, // Realistic spike
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

/**
 * Validates bed capacity data object.
 * @param {Object} data - Bed capacity data
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateBedCapacity(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be an object' };
  
  if (!data.phc_id || typeof data.phc_id !== 'string') {
    return { valid: false, error: 'Missing or invalid phc_id' };
  }
  
  const ensureNumber = (val) => typeof val === 'number' && !isNaN(val);

  if (!ensureNumber(data.total_beds) || data.total_beds < 0) {
    return { valid: false, error: 'total_beds must be a non-negative number' };
  }
  if (!ensureNumber(data.occupied_beds) || data.occupied_beds < 0) {
    return { valid: false, error: 'occupied_beds must be a non-negative number' };
  }
  if (!ensureNumber(data.available_beds) || data.available_beds < 0) {
    return { valid: false, error: 'available_beds must be a non-negative number' };
  }

  if (data.occupied_beds > data.total_beds) {
    return { valid: false, error: 'occupied_beds cannot exceed total_beds' };
  }
  
  if (data.available_beds !== data.total_beds - data.occupied_beds) {
    return { valid: false, error: 'available_beds must equal total_beds - occupied_beds' };
  }
  
  if (data.emergency_beds !== undefined && data.emergency_beds !== null) {
    if (!ensureNumber(data.emergency_beds) || data.emergency_beds < 0) {
      return { valid: false, error: 'emergency_beds must be a non-negative number' };
    }
    if (data.emergency_beds > data.total_beds) {
      return { valid: false, error: 'emergency_beds cannot exceed total_beds' };
    }
  }

  if (data.icu_beds !== undefined && data.icu_beds !== null) {
    if (!ensureNumber(data.icu_beds) || data.icu_beds < 0) {
      return { valid: false, error: 'icu_beds must be a non-negative number' };
    }
    if (data.icu_beds > data.total_beds) {
      return { valid: false, error: 'icu_beds cannot exceed total_beds' };
    }
  }

  return { valid: true };
}

/**
 * Fetch bed capacity for a PHC.
 * Returns null if the document does not exist, explicitly signifying unknown state.
 * @param {string} phcId 
 * @param {boolean} isDemo
 * @returns {Promise<Object|null>}
 */
export async function getBedCapacity(phcId, isDemo = false) {
  checkDbReady();
  if (!phcId) throw new Error("phcId is required");

  // Validate that PHC actually exists in the database
  const phcRef = doc(db, "phcs", phcId);
  const { getDoc } = await import("firebase/firestore");
  const phcSnap = await getDoc(phcRef);
  if (!phcSnap.exists()) {
    throw new Error(`PHC with ID ${phcId} does not exist`);
  }

  const collectionName = isDemo ? "demo_beds" : "beds";
  const bedRef = doc(db, collectionName, phcId);
  const bedSnap = await getDoc(bedRef);

  if (!bedSnap.exists()) {
    return null; // Missing data means UNKNOWN
  }

  const bedData = bedSnap.data();
  const validation = validateBedCapacity(bedData);
  if (!validation.valid) {
    throw new Error(`Corrupted bed data for PHC ${phcId}: ${validation.error}`);
  }

  return bedData;
}

/**
 * Update bed capacity safely using a transaction to prevent race conditions.
 * @param {string} phcId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateBedCapacity(phcId, data) {
  checkDbReady();
  if (!phcId) throw new Error("phcId is required");
  
  // Validate basic constraints before proceeding
  const validation = validateBedCapacity(data);
  if (!validation.valid) {
    throw new Error(`Invalid bed capacity data: ${validation.error}`);
  }

  const phcRef = doc(db, "phcs", phcId);
  const bedRef = doc(db, "beds", phcId);

  return await runTransaction(db, async (transaction) => {
    const phcSnap = await transaction.get(phcRef);
    if (!phcSnap.exists()) {
      throw new Error(`PHC with ID ${phcId} does not exist`);
    }

    const payload = {
      phc_id: phcId,
      total_beds: data.total_beds,
      occupied_beds: data.occupied_beds,
      available_beds: data.available_beds,
      last_updated: serverTimestamp()
    };
    
    if (data.emergency_beds !== undefined) {
      payload.emergency_beds = data.emergency_beds;
    }
    if (data.icu_beds !== undefined) {
      payload.icu_beds = data.icu_beds;
    }

    transaction.set(bedRef, payload, { merge: true });
    return { success: true, ...payload };
  });
}
