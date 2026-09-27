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

async function inspectUsedTransactions() {
  const txSnap = await getDocs(collection(db, "stock_transactions"));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const usedTxs = transactions.filter(t => t.transaction_type === 'USED');
  console.log(`Total USED transactions: ${usedTxs.length}`);

  const usedByDate = {};
  let minUsedDate = null;
  let maxUsedDate = null;

  usedTxs.forEach(t => {
    let d = null;
    if (t.timestamp?.toDate) d = t.timestamp.toDate();
    else if (t.timestamp instanceof Date) d = t.timestamp;
    else d = new Date(t.timestamp);

    if (d) {
      if (!minUsedDate || d < minUsedDate) minUsedDate = d;
      if (!maxUsedDate || d > maxUsedDate) maxUsedDate = d;

      const dayStr = d.toISOString().split('T')[0];
      usedByDate[dayStr] = (usedByDate[dayStr] || 0) + 1;
    }
  });

  console.log("USED Transactions Date Range:");
  console.log(" - Min USED Date:", minUsedDate ? minUsedDate.toISOString() : 'None');
  console.log(" - Max USED Date:", maxUsedDate ? maxUsedDate.toISOString() : 'None');

  const sortedDates = Object.keys(usedByDate).sort();
  console.log(`\nUnique Dates with USED transactions: ${sortedDates.length}`);
  console.log("First 5 dates with USED txs:", sortedDates.slice(0, 5).map(d => `${d} (${usedByDate[d]} txs)`));
  console.log("Last 10 dates with USED txs:", sortedDates.slice(-10).map(d => `${d} (${usedByDate[d]} txs)`));

  // Check September 2026 USED transactions
  const septUsed = usedTxs.filter(t => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
    return d.toISOString().startsWith('2026-09');
  });
  console.log(`\nTotal USED transactions in September 2026: ${septUsed.length}`);
  septUsed.forEach(t => {
    const dStr = t.timestamp?.toDate ? t.timestamp.toDate().toISOString() : t.timestamp;
    console.log(` - PHC: ${t.phc_id}, Med: ${t.medicine_id}, Qty: ${t.quantity}, Date: ${dStr}`);
  });

  // Check August 2026 USED transactions
  const augUsed = usedTxs.filter(t => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
    return d.toISOString().startsWith('2026-08');
  });
  console.log(`\nTotal USED transactions in August 2026: ${augUsed.length}`);
  console.log("Last 5 August USED txs:", augUsed.slice(-5).map(t => {
    const dStr = t.timestamp?.toDate ? t.timestamp.toDate().toISOString() : t.timestamp;
    return `PHC: ${t.phc_id}, Med: ${t.medicine_id}, Qty: ${t.quantity}, Date: ${dStr}`;
  }));

  // Check how forecastDemand computes the 30-day window:
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  console.log(`\nForecast 30-day window (when now = ${now.toISOString()}):`);
  console.log(` - Start: ${thirtyDaysAgo.toISOString()}`);
  console.log(` - End: ${now.toISOString()}`);

  const usedInWindow = usedTxs.filter(t => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
    return d >= thirtyDaysAgo && d <= now;
  });
  console.log(`Total USED transactions inside current 30-day window [${thirtyDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}]: ${usedInWindow.length}`);
  usedInWindow.forEach(t => {
    const dStr = t.timestamp?.toDate ? t.timestamp.toDate().toISOString() : t.timestamp;
    console.log(` - PHC: ${t.phc_id}, Med: ${t.medicine_id}, Qty: ${t.quantity}, Date: ${dStr}`);
  });
}

inspectUsedTransactions().catch(err => console.error("Error:", err));
