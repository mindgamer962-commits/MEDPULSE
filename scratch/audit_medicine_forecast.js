import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runAudit() {
  console.log("=== MEDICINE FORECAST DEMAND AUDIT (READ ONLY) ===");
  console.log("Current System Time (new Date()):", new Date().toISOString());

  // 1. Fetch PHCs
  const phcsSnap = await getDocs(collection(db, "phcs"));
  const phcs = phcsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total PHCs: ${phcs.length}`);

  // 2. Fetch Medicines
  const medsSnap = await getDocs(collection(db, "medicines"));
  const medicines = medsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total Medicines: ${medicines.length}`);
  medicines.forEach(m => console.log(` - ${m.medicine_id || m.id}: ${m.name} (${m.dosage || ''})`));

  // 3. Fetch Stock Transactions
  const txSnap = await getDocs(collection(db, "stock_transactions"));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\nTotal stock_transactions in Firestore: ${transactions.length}`);

  // Transaction type distribution
  const typeCounts = {};
  const phcCounts = {};
  const medCounts = {};
  let minTxDate = null;
  let maxTxDate = null;

  transactions.forEach(tx => {
    typeCounts[tx.transaction_type] = (typeCounts[tx.transaction_type] || 0) + 1;
    phcCounts[tx.phc_id] = (phcCounts[tx.phc_id] || 0) + 1;
    medCounts[tx.medicine_id] = (medCounts[tx.medicine_id] || 0) + 1;

    let txDate = null;
    if (tx.timestamp) {
      if (tx.timestamp.toDate) txDate = tx.timestamp.toDate();
      else if (tx.timestamp instanceof Date) txDate = tx.timestamp;
      else txDate = new Date(tx.timestamp);
    }
    if (txDate) {
      if (!minTxDate || txDate < minTxDate) minTxDate = txDate;
      if (!maxTxDate || txDate > maxTxDate) maxTxDate = txDate;
    }
  });

  console.log("\nTransaction Types in stock_transactions:", typeCounts);
  console.log("Stock Transactions Date Range:");
  console.log(" - Min Date:", minTxDate ? minTxDate.toISOString() : 'None');
  console.log(" - Max Date:", maxTxDate ? maxTxDate.toISOString() : 'None');

  // Sample stock transactions
  console.log("\nSample 10 stock_transactions:");
  transactions.slice(0, 10).forEach(tx => {
    const dStr = tx.timestamp?.toDate ? tx.timestamp.toDate().toISOString() : tx.timestamp;
    console.log(` - PHC: ${tx.phc_id}, Med: ${tx.medicine_id}, Type: ${tx.transaction_type}, Qty: ${tx.quantity} (${typeof tx.quantity}), Timestamp: ${dStr}`);
  });

  // 4. Fetch Daily Footfall
  const ffSnap = await getDocs(collection(db, "daily_footfall"));
  const footfalls = ffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\nTotal daily_footfall records: ${footfalls.length}`);
  let minFfDate = null;
  let maxFfDate = null;
  footfalls.forEach(f => {
    let d = null;
    if (f.date?.toDate) d = f.date.toDate();
    else if (f.date instanceof Date) d = f.date;
    else d = new Date(f.date);
    if (d) {
      if (!minFfDate || d < minFfDate) minFfDate = d;
      if (!maxFfDate || d > maxFfDate) maxFfDate = d;
    }
  });
  console.log("Daily Footfall Date Range:");
  console.log(" - Min Date:", minFfDate ? minFfDate.toISOString() : 'None');
  console.log(" - Max Date:", maxFfDate ? maxFfDate.toISOString() : 'None');

  // 5. Audit Specific PHCs: Adalaj, Nakra, Koth
  const testPhcIds = ['phc_002', 'phc_001', 'phc_003']; // Check IDs
  // Find PHC objects by name or id
  const adalaj = phcs.find(p => p.name?.toLowerCase().includes('adalaj') || p.phc_id === 'phc_002' || p.phc_name?.toLowerCase().includes('adalaj')) || phcs[0];
  const nakra = phcs.find(p => p.name?.toLowerCase().includes('nakra') || p.phc_id === 'phc_001' || p.phc_name?.toLowerCase().includes('nakra')) || phcs[1];
  const koth = phcs.find(p => p.name?.toLowerCase().includes('koth') || p.phc_id === 'phc_003' || p.phc_name?.toLowerCase().includes('koth')) || phcs[2];

  const auditPhcs = [adalaj, nakra, koth].filter(Boolean);

  console.log("\n=======================================================");
  console.log("DETAILED AUDIT FOR PHC ADALAJ & OTHER PHCS");
  console.log("=======================================================");

  for (const targetPhc of auditPhcs) {
    const phcId = targetPhc.phc_id;
    const phcName = targetPhc.name || targetPhc.phc_name;
    console.log(`\n>>> PHC: ${phcName} (${phcId}) <<<`);

    const phcFfs = footfalls.filter(f => f.phc_id === phcId);
    console.log(`Footfall records for ${phcId}: ${phcFfs.length}`);

    for (const med of medicines) {
      const medId = med.medicine_id;
      const medName = med.name;

      const phcTxs = transactions.filter(t => t.phc_id === phcId && t.medicine_id === medId);
      const usedTxs = phcTxs.filter(t => t.transaction_type === 'USED');

      // Current stock calculation
      let currentStock = 0;
      for (const tx of phcTxs) {
        if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
          currentStock += tx.quantity;
        } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
          currentStock -= tx.quantity;
        }
      }

      // Step-by-step trace of forecastDemand(phcId, medId)
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const ffs30 = phcFfs.filter((f) => {
        const d = f.date?.toDate ? f.date.toDate() : new Date(f.date);
        return d >= thirtyDaysAgo;
      });

      const txsUsed30 = phcTxs.filter((t) => {
        const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return t.transaction_type === "USED" && d >= thirtyDaysAgo;
      });

      const totalPatients30 = ffs30.reduce((acc, curr) => acc + curr.patient_count, 0);
      const totalUsed30 = txsUsed30.reduce((acc, curr) => acc + curr.quantity, 0);

      const usageRate = totalPatients30 > 0 ? (totalUsed30 / totalPatients30) : 0.5;

      // 7-day windows
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

      const recentRecords = phcFfs.filter((f) => {
        const dStr = f.date?.toDate ? f.date.toDate().toISOString().split("T")[0] : String(f.date).split("T")[0];
        return recentDays.includes(dStr);
      });
      const prevRecords = phcFfs.filter((f) => {
        const dStr = f.date?.toDate ? f.date.toDate().toISOString().split("T")[0] : String(f.date).split("T")[0];
        return prevDays.includes(dStr);
      });

      const recentAvgFf = recentRecords.length > 0 ? (recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / recentRecords.length) : 0;
      const prevAvgFf = prevRecords.length > 0 ? (prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / prevRecords.length) : 0;

      let trendRatio = 1.0;
      if (prevAvgFf > 0 && recentAvgFf > 0) {
        trendRatio = recentAvgFf / prevAvgFf;
      }
      const clampedTrendRatio = Math.max(0.5, Math.min(2.5, trendRatio));

      let totalForecast = 0;
      const projectedDailyDemands = [];
      for (let d = 1; d <= 7; d++) {
        const projectedFf = recentAvgFf * (1 + (clampedTrendRatio - 1) * (d / 7));
        const projectedDemand = Math.round(projectedFf * usageRate);
        projectedDailyDemands.push(projectedDemand);
        totalForecast += projectedDemand;
      }
      const averageDailyDemand = parseFloat((totalForecast / 7).toFixed(1));

      console.log(`\n  Medicine: ${medName} (${medId})`);
      console.log(`  Current stock: ${currentStock}`);
      console.log(`  Total stock transactions: ${phcTxs.length} (USED: ${usedTxs.length})`);
      console.log(`  30-day patient count (ffs30 count: ${ffs30.length}): ${totalPatients30}`);
      console.log(`  30-day qualifying usage quantity (txsUsed30 count: ${txsUsed30.length}): ${totalUsed30}`);
      console.log(`  usageRate: ${usageRate}`);
      console.log(`  recentAvgFf: ${recentAvgFf} (records: ${recentRecords.length})`);
      console.log(`  previousAvgFf: ${prevAvgFf} (records: ${prevRecords.length})`);
      console.log(`  trendRatio: ${trendRatio} (clamped: ${clampedTrendRatio})`);
      console.log(`  projected daily demand (7 days): [${projectedDailyDemands.join(', ')}]`);
      console.log(`  predicted 7-day demand (totalForecast): ${totalForecast}`);
      console.log(`  average daily demand: ${averageDailyDemand}`);

      // Check dates of phcTxs in detail
      if (phcTxs.length > 0) {
        console.log(`  Sample tx dates for ${medId}:`);
        phcTxs.slice(0, 5).forEach(t => {
          const dStr = t.timestamp?.toDate ? t.timestamp.toDate().toISOString() : t.timestamp;
          console.log(`    type: ${t.transaction_type}, qty: ${t.quantity}, date: ${dStr}`);
        });
      }
    }
  }
}

runAudit().catch(err => console.error("Audit error:", err));
