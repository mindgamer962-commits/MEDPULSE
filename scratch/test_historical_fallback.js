import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function testHistoricalFallback() {
  const phcsSnap = await getDocs(collection(db, "phcs"));
  const phcs = phcsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const medsSnap = await getDocs(collection(db, "medicines"));
  const medicines = medsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const txSnap = await getDocs(collection(db, "stock_transactions"));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const ffSnap = await getDocs(collection(db, "daily_footfall"));
  const footfalls = ffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const phcIds = ['phc-adalaj', 'phc-nakra', 'phc-koth', 'phc-achrol'];

  for (const pid of phcIds) {
    const phc = phcs.find(p => p.phc_id === pid);
    console.log(`\n==============================================`);
    console.log(`PHC: ${phc?.name || pid}`);
    console.log(`==============================================`);

    const phcFfs = footfalls.filter(f => f.phc_id === pid);
    const phcTxs = transactions.filter(t => t.phc_id === pid);

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const ffs30 = phcFfs.filter(f => (f.date?.toDate ? f.date.toDate() : new Date(f.date)) >= thirtyDaysAgo);
    const totalPatients30 = ffs30.reduce((acc, c) => acc + c.patient_count, 0);

    // Footfall trend calculation
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

    const recentRecords = phcFfs.filter((f) => recentDays.includes(f.date?.toDate ? f.date.toDate().toISOString().split("T")[0] : String(f.date).split("T")[0]));
    const prevRecords = phcFfs.filter((f) => prevDays.includes(f.date?.toDate ? f.date.toDate().toISOString().split("T")[0] : String(f.date).split("T")[0]));

    const recentAvgFf = recentRecords.length > 0 ? (recentRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / recentRecords.length) : 0;
    const prevAvgFf = prevRecords.length > 0 ? (prevRecords.reduce((acc, curr) => acc + curr.patient_count, 0) / prevRecords.length) : 0;

    let trendRatio = 1.0;
    if (prevAvgFf > 0 && recentAvgFf > 0) {
      trendRatio = recentAvgFf / prevAvgFf;
    }
    const clampedTrendRatio = Math.max(0.5, Math.min(2.5, trendRatio));

    for (const med of medicines) {
      const medTxs = phcTxs.filter(t => t.medicine_id === med.medicine_id);
      const allUsedTxs = medTxs.filter(t => t.transaction_type === 'USED' && t.quantity > 0);

      // Current 30-day window
      const txsUsed30 = medTxs.filter(t => {
        const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return t.transaction_type === "USED" && d >= thirtyDaysAgo;
      });

      let usageRate = 0;
      let usageSource = 'CURRENT_WINDOW';

      if (txsUsed30.length > 0) {
        const totalUsed30 = txsUsed30.reduce((acc, curr) => acc + curr.quantity, 0);
        usageRate = totalPatients30 > 0 ? (totalUsed30 / totalPatients30) : 0.5;
        usageSource = 'CURRENT_WINDOW';
      } else if (allUsedTxs.length > 0) {
        // Find most recent valid historical period containing USED transactions
        allUsedTxs.sort((a, b) => {
          const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
          const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
          return db - da; // newest first
        });

        const latestUsedDate = allUsedTxs[0].timestamp?.toDate ? allUsedTxs[0].timestamp.toDate() : new Date(allUsedTxs[0].timestamp);
        const histWindowStart = new Date(latestUsedDate);
        histWindowStart.setDate(latestUsedDate.getDate() - 30);

        const histUsedTxs = allUsedTxs.filter(t => {
          const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
          return d >= histWindowStart && d <= latestUsedDate;
        });

        const histFfs = phcFfs.filter(f => {
          const d = f.date?.toDate ? f.date.toDate() : new Date(f.date);
          return d >= histWindowStart && d <= latestUsedDate;
        });

        const histTotalUsed = histUsedTxs.reduce((acc, c) => acc + c.quantity, 0);
        const histTotalPatients = histFfs.reduce((acc, c) => acc + c.patient_count, 0);

        if (histTotalPatients > 0 && histTotalUsed > 0) {
          usageRate = histTotalUsed / histTotalPatients;
        } else if (histTotalUsed > 0) {
          // fallback across all available records
          const totalAllUsed = allUsedTxs.reduce((acc, c) => acc + c.quantity, 0);
          const totalAllPatients = phcFfs.reduce((acc, c) => acc + c.patient_count, 0);
          usageRate = totalAllPatients > 0 ? (totalAllUsed / totalAllPatients) : 0.5;
        } else {
          usageRate = 0.5;
        }
        usageSource = `HISTORICAL_FALLBACK (${latestUsedDate.toISOString().split('T')[0]})`;
      } else {
        usageSource = 'INSUFFICIENT_DATA';
      }

      // Forecast 7 Days
      let totalForecast = 0;
      if (usageSource !== 'INSUFFICIENT_DATA' && usageRate > 0) {
        for (let d = 1; d <= 7; d++) {
          const projectedFf = recentAvgFf * (1 + (clampedTrendRatio - 1) * (d / 7));
          const projectedDemand = Math.round(projectedFf * usageRate);
          totalForecast += projectedDemand;
        }
      }

      // Stock
      let currentStock = 0;
      for (const tx of medTxs) {
        if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
          currentStock += tx.quantity;
        } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
          currentStock -= tx.quantity;
        }
      }

      const averageDailyDemand = totalForecast > 0 ? parseFloat((totalForecast / 7).toFixed(1)) : 0;
      const estimatedDaysRemaining = averageDailyDemand > 0 ? parseFloat((currentStock / averageDailyDemand).toFixed(1)) : (currentStock > 0 ? 999 : 0);

      let riskLevel = "SAFE";
      if (usageSource === 'INSUFFICIENT_DATA') {
        riskLevel = "INSUFFICIENT_DATA";
      } else if (currentStock <= 0 || estimatedDaysRemaining <= 1.0) {
        riskLevel = "CRITICAL";
      } else if (estimatedDaysRemaining <= 7.0) {
        riskLevel = "AT_RISK";
      }

      console.log(`  ${med.name.padEnd(14)} | Stock: ${String(currentStock).padStart(5)} | Rate: ${usageRate.toFixed(3)} | Source: ${usageSource} | 7D Demand: ${String(totalForecast).padStart(4)} | Days Left: ${String(estimatedDaysRemaining).padStart(5)} | Risk: ${riskLevel}`);
    }
  }
}

testHistoricalFallback().catch(err => console.error(err));
