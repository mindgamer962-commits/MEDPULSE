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

async function checkMorePhcs() {
  const phcsSnap = await getDocs(collection(db, "phcs"));
  const phcs = phcsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const medsSnap = await getDocs(collection(db, "medicines"));
  const medicines = medsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const txSnap = await getDocs(collection(db, "stock_transactions"));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const ffSnap = await getDocs(collection(db, "daily_footfall"));
  const footfalls = ffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const targets = ['phc_004', 'phc_005', 'phc_006']; // Achrol, Gadat, Koyali (or by name)
  const achrol = phcs.find(p => p.name?.toLowerCase().includes('achrol') || p.phc_id === 'phc_004') || phcs[3];
  const gadat = phcs.find(p => p.name?.toLowerCase().includes('gadat') || p.phc_id === 'phc_005') || phcs[4];

  for (const phc of [achrol, gadat]) {
    console.log(`\n=== PHC: ${phc.name || phc.phc_name} (${phc.phc_id}) ===`);
    const phcFfs = footfalls.filter(f => f.phc_id === phc.phc_id);
    const phcTxs = transactions.filter(t => t.phc_id === phc.phc_id);

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const ffs30 = phcFfs.filter(f => {
      const d = f.date?.toDate ? f.date.toDate() : new Date(f.date);
      return d >= thirtyDaysAgo;
    });
    const totalPatients30 = ffs30.reduce((acc, curr) => acc + curr.patient_count, 0);

    for (const med of medicines) {
      const medTxs = phcTxs.filter(t => t.medicine_id === med.medicine_id);
      const usedTxs = medTxs.filter(t => t.transaction_type === 'USED');
      const used30 = medTxs.filter(t => {
        const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return t.transaction_type === 'USED' && d >= thirtyDaysAgo;
      });
      const totalUsed30 = used30.reduce((acc, curr) => acc + curr.quantity, 0);
      const usageRate = totalPatients30 > 0 ? (totalUsed30 / totalPatients30) : 0.5;

      let currentStock = 0;
      for (const tx of medTxs) {
        if (tx.transaction_type === "RECEIVED" || tx.transaction_type === "TRANSFER_IN") {
          currentStock += tx.quantity;
        } else if (tx.transaction_type === "USED" || tx.transaction_type === "TRANSFER_OUT") {
          currentStock -= tx.quantity;
        }
      }

      console.log(`  Medicine: ${med.name} (${med.medicine_id})`);
      console.log(`    Current Stock: ${currentStock}`);
      console.log(`    All USED txs count: ${usedTxs.length}`);
      console.log(`    30-day patient count: ${totalPatients30}`);
      console.log(`    30-day USED txs count: ${used30.length}, totalUsed30: ${totalUsed30}`);
      console.log(`    usageRate: ${usageRate}`);
    }
  }
}

checkMorePhcs().catch(err => console.error(err));
